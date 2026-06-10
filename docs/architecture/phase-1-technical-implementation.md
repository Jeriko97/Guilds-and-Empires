# GAE Phase 1 — Architecture Technique (Prompt 3B)

---

## Préambule

Cette réponse suit l'ordre canonique du skill : Firestore schema → Security Rules → Cloud Functions → Unity client → Coûts. Chaque section référence les doctrines du projet quand elles s'appliquent.

Deux désaccords techniques avec des décisions de 3A sont flaggés en fin de document. Les deux ont une alternative qui préserve l'intention design.

---

## 1. Firestore Schema

### Document joueur — `/players/{uid}`

```typescript
{
  schemaVersion: 1,                    // migration obligatoire — Doctrine Anti-Cheat
  displayName: string,
  createdAt: Timestamp,
  lastLoginAt: Timestamp,              // serverTimestamp() — jamais DateTime.Now

  // Économie — server-authoritative, allow write: if false côté client
  gold: number,
  imperialFavor: number,               // cumulatif, ne décroît jamais

  // Inventaire dénormalisé (voir justification ci-dessous)
  inventory: {
    logs:                { quantity: number, cap: number },
    planks:              { quantity: number, cap: number },
    reconstructionKits:  { quantity: number, cap: number }
  },

  // Rang dénormalisé — évite tout calcul côté client
  favorRank: 'local_supplier'
           | 'approved_merchant'
           | 'imperial_entrepreneur'
           | 'guild_charter_eligible',

  // Guild Charter
  guildCharterUnlocked: boolean,
  guildCharterPurchasedAt: Timestamp | null,

  // Flag déclenche l'event scripté — mis à true après premier contrat livré
  firstContractCompleted: boolean,
}
```

**Justification de la dénormalisation de l'inventaire :**
Au login, 1 read unique récupère gold + favor + rang + inventaire complet. Avec une subcollection séparée, ce serait 3-4 reads. À 10k DAU × 30 jours, ça représente 60-90M reads économisés — soit $36-54/mois évités. La dénormalisation est ici un choix économique, pas de la paresse.

---

### Production state — `/players/{uid}/buildings/{buildingId}`

```typescript
{
  buildingType: 'sawmill',
  level: 1,                           // extensible Phase 2
  slots: [
    {
      slotIndex: 0 | 1 | 2,
      recipeId: 'logs' | 'planks' | 'reconstruction_kits' | null,
      startedAt: Timestamp | null,    // serverTimestamp() au démarrage
      // ⚠️ PAS de completedAt — le serveur calcule startedAt + duration à la collection
    }
  ]
}
```

**Pourquoi pas de `completedAt` :** avec la production offline continue, personne n'est présent pour écrire le document quand la production se termine. Le serveur recalcule `floor(elapsed / duration) × output` à chaque collecte. Zéro scheduled write par slot actif.

---

### Contrats actifs — `/players/{uid}/contracts/{contractId}`

```typescript
{
  contractTemplateId: string,         // référence au contractPool global
  tier: 'standard' | 'reinforced' | 'priority',
  resourceType: 'reconstruction_kits',
  quantityRequired: number,
  quantityDelivered: number,
  rewardGold: number,
  rewardFavor: number,
  status: 'active' | 'completed' | 'expired',
  acceptedAt: Timestamp,
  expiresAt: Timestamp | null,        // null = Standard, timestamp = Priority
  completedAt: Timestamp | null,
  idempotencyKey: string,             // UUID généré au moment de la livraison
}
```

---

### Market state global — `marketState/state` (singleton)

```typescript
{
  schemaVersion: 1,
  lastUpdatedAt: Timestamp,

  prices: {
    logs: {
      currentPrice: number,
      basePrice: number,              // référence pour le calcul de drift
      trend: 'rising' | 'stable' | 'falling',
      // 👇 Migration-ready Phase 2 : on ajoute une subcollection orderBook
      //    sans toucher à cette structure racine
    },
    planks: {
      currentPrice: number,
      basePrice: number,
      trend: 'rising' | 'stable' | 'falling',
    }
  },

  // Ticker UI : 3 derniers prix pour la flèche directionnelle
  // Évite que le client reconstruise un historique par reads multiples
  priceHistory: {
    logs:   number[],                 // 3 valeurs max, FIFO
    planks: number[]
  }
}
```

**Migration-ready note :** En Phase 2, les vrais ordres atterrissent dans `market/orderBook/{orderId}` — une subcollection du document `market` (top-level collection). Le document `marketState` continue d'exister comme snapshot du prix courant (calculé depuis le carnet d'ordres). Aucun refactor du schéma existant.

---

### World events actifs — `activeWorldEvents/{eventId}`

```typescript
{
  eventId: string,
  eventType: 'imperial_reconstruction_initiative' | string,
  status: 'pending' | 'active' | 'decaying' | 'completed',
  startedAt: Timestamp | null,
  endsAt: Timestamp | null,           // startedAt + 4h
  decayEndsAt: Timestamp | null,      // endsAt + 1h

  priceMultipliers: {
    logs: number,                     // 1.80
    planks: number                    // 1.83
  },

  priorityContractSlots: {
    total: number,                    // 5
    claimed: number                   // incrémenté server-side à chaque acceptation
  },

  // Condition de déclenchement pour l'event scripté
  triggerCondition: 'first_contract_completed' | 'manual' | null,
  triggerProcessed: boolean           // évite double-déclenchement
}
```

---

### Contract pool global — `contractPool/{contractId}`

```typescript
{
  tier: 'standard' | 'reinforced' | 'priority',
  resourceType: 'reconstruction_kits',
  quantityRequired: number,
  rewardGold: number,
  rewardFavor: number,
  associatedEventId: string | null,
  isActive: boolean,
  validFrom: Timestamp,
  validUntil: Timestamp | null
}
```

---

## 2. Cloud Functions — Signatures TypeScript

```typescript
import * as functions from 'firebase-functions/v2';

// ─── LOGIN ────────────────────────────────────────────────────────────────────

/**
 * Calcule la production différée depuis le dernier login.
 * Le serveur lit slot.startedAt — le client ne fournit AUCUN paramètre temporel.
 * Idempotency: clampé à 1 appel / 5s par uid (rate limit interne).
 * Retourne le state complet mis à jour (évite un second read client post-appel).
 */
export const resolveLoginState = functions.https.onCall(
  async (request: CallableRequest<void>): Promise<PlayerStateSnapshot> => { /* ... */ }
);

// ─── PRODUCTION ───────────────────────────────────────────────────────────────

/**
 * Lance un cycle de production sur un slot de la Sawmill.
 * Validations serveur : uid authentifié, recipeId dans la liste autorisée,
 * slot disponible (recipeId == null), inventaire input suffisant.
 * Idempotency: uid + buildingId + slotIndex + recipeId (évite double-start).
 */
// NOTE (réconcilié 17.A-3) : retourne building + inventory mis à jour (pas void) —
// permet au client de rendre l'état post-start sans second resolveLoginState.
export const startProductionSlot = functions.https.onCall(
  async (request: CallableRequest<{
    buildingId: string;
    slotIndex: 0 | 1 | 2;
    recipeId: 'logs' | 'planks' | 'reconstruction_kits';
  }>): Promise<{ building: BuildingDocument; inventory: InventoryState }> => { /* ... */ }
);

/**
 * Collecte la production disponible sur tous les slots actifs.
 * Le serveur calcule elapsed = serverTimestamp - slot.startedAt.
 * Le client ne passe que buildingId — jamais un amount, jamais un elapsed.
 * Rate limit: 10 appels / min par uid.
 * Side effect: si production continue et cap atteint, slot reste actif mais yield = 0.
 * Renvoie l'état mis à jour (building sans id Firestore — injecté par le service client,
 * D-ETAPE16-004) ainsi que collected/discarded. Aligné sur startProductionSlot (17.B-0).
 */
export const collectProduction = functions.https.onCall(
  async (request: CallableRequest<{
    buildingId: string;
  }>): Promise<{
    collected: Partial<Record<ResourceKey, number>>;
    discarded: Partial<Record<ResourceKey, number>>;
    building:  BuildingDocument;
    inventory: InventoryState;
  }> => { /* ... */ }
);

// ─── CONTRATS ─────────────────────────────────────────────────────────────────

/**
 * Accepte un contrat depuis le pool global.
 * Validations : contractId actif, favorRank suffisant pour le tier,
 * pas déjà accepté par ce joueur, slots Priority non épuisés si applicable.
 * Idempotency: uid + contractId.
 */
export const acceptContract = functions.https.onCall(
  async (request: CallableRequest<{
    contractTemplateId: string;
  }>): Promise<{ playerContractId: string }> => { /* ... */ }
);

/**
 * Livre les ressources contre les récompenses d'un contrat actif.
 * Validations : contrat actif et non expiré, inventory.reconstructionKits >= quantityRequired.
 * Le serveur lit les rewardGold/rewardFavor depuis le document contrat — jamais depuis le client.
 * Side effect : vérifie déclenchement event scripté (firstContractCompleted flag).
 * Side effect : recalcule favorRank si seuil franchi.
 * Idempotency: idempotencyKey (UUID client stocké dans le document contrat).
 */
export const deliverToContract = functions.https.onCall(
  async (request: CallableRequest<{
    playerContractId: string;
    idempotencyKey: string;
  }>): Promise<{ goldEarned: number; favorEarned: number; newFavorRank: string | null }> => { /* ... */ }
);

// ─── MARCHÉ ───────────────────────────────────────────────────────────────────

/**
 * Vend des ressources à l'AI market au prix courant.
 * Le serveur lit le prix depuis /global/marketState — jamais fourni par le client.
 * Rate limit: 20 ventes / heure par uid (anti-farming).
 * Validation : quantity > 0, quantity <= inventory, quantity <= seuil par transaction.
 * Idempotency: idempotencyKey.
 */
export const sellToMarket = functions.https.onCall(
  async (request: CallableRequest<{
    resourceType: 'logs' | 'planks' | 'reconstruction_kits';
    quantity: number;
    idempotencyKey: string;
  }>): Promise<{ goldEarned: number; priceApplied: number }> => { /* ... */ }
);

// ─── UPGRADES ─────────────────────────────────────────────────────────────────

/**
 * Achète un upgrade de capacité d'inventaire.
 * Validation : gold suffisant, upgradeIndex valide (0 ou 1), pas déjà acheté pour ce tier.
 * Le coût est lu depuis Remote Config — jamais fourni par le client.
 * Idempotency: uid + resourceType + upgradeIndex.
 */
export const upgradeInventoryCap = functions.https.onCall(
  async (request: CallableRequest<{
    resourceType: 'logs' | 'planks' | 'reconstruction_kits';
    upgradeIndex: 0 | 1;
    idempotencyKey: string;
  }>): Promise<{ newCap: number; goldSpent: number }> => { /* ... */ }
);

// ─── GUILD CHARTER ────────────────────────────────────────────────────────────

/**
 * Achète le Guild Charter si les deux conditions sont remplies.
 * Validation : imperialFavor >= 350 ET gold >= 500 ET guildCharterUnlocked == false.
 * Les seuils sont lus depuis Remote Config — non hard-codés.
 * Idempotency: uid + idempotencyKey.
 */
export const purchaseGuildCharter = functions.https.onCall(
  async (request: CallableRequest<{
    idempotencyKey: string;
  }>): Promise<void> => { /* ... */ }
);

// ─── SCHEDULED (non callable) ─────────────────────────────────────────────────

/**
 * Recalcule les prix du marché toutes les 5 minutes.
 * Algorithme : drift lent vers basePrice + bruit contrôlé (±5% max par tick)
 *              + multiplicateurs des world events actifs.
 * Écrit dans /global/marketState — 1 write / 5 min.
 * Pas de sinusoïde prévisible : le bruit est pseudo-aléatoire seedé par serverTimestamp.
 */
export const updateMarketPrices = functions.scheduler.onSchedule(
  'every 5 minutes',
  async (): Promise<void> => { /* ... */ }
);

/**
 * Gère le cycle de vie des world events : pending → active → decaying → completed.
 * Vérifie le flag firstContractCompleted pour déclencher l'event scripté.
 * Vérifie les expirations de Contrats Priority.
 */
export const processWorldEventLifecycle = functions.scheduler.onSchedule(
  'every 10 minutes',
  async (): Promise<void> => { /* ... */ }
);
```

### Stratégie de calcul différé au login (pseudo-code)

```
resolveLoginState():
  player = read /players/{uid}                    // 1 read
  buildings = read /players/{uid}/buildings       // 1 read (subcollection)
  now = serverTimestamp()

  Pour chaque building:
    Pour chaque slot où recipeId != null ET startedAt != null:
      elapsed = now - slot.startedAt              // serveur calcule, jamais le client
      recipe = getRecipeConfig(recipeId)          // depuis Remote Config / cache CF
      completedCycles = floor(elapsed / recipe.durationMs)
      rawYield = completedCycles * recipe.outputQty

      // Clamp par cap — la saturation est le mécanisme de check-in
      availableSpace = inventory[recipe.output].cap - inventory[recipe.output].quantity
      actualYield = min(rawYield, availableSpace)
      inventory[recipe.output].quantity += actualYield

      // Production continue : le slot reste actif
      // startedAt N'EST PAS reset — il sert de référence absolue
      // Le prochain collectProduction recalculera depuis le même startedAt

  player.lastLoginAt = now
  write /players/{uid}                            // 1 write

  return PlayerStateSnapshot                      // évite un second read client
```

---

## 3. Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─── PLAYER DATA ───────────────────────────────────────────────
    match /players/{uid} {
      // Lecture : uniquement le joueur propriétaire
      allow read: if request.auth != null
                  && request.auth.uid == uid;
      // Écriture : JAMAIS directement depuis le client
      allow write: if false;

      match /buildings/{buildingId} {
        allow read: if request.auth != null
                    && request.auth.uid == uid;
        allow write: if false;
      }

      match /contracts/{contractId} {
        allow read: if request.auth != null
                    && request.auth.uid == uid;
        allow write: if false;
      }
    }

    // ─── GLOBAL STATE ──────────────────────────────────────────────
    // Lecture authentifiée, écriture uniquement via Cloud Functions (service account)
    match /marketState/{document} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /activeWorldEvents/{eventId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    match /contractPool/{contractId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // ─── FALLBACK DENY-ALL ─────────────────────────────────────────
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Note sur les Cloud Functions :** elles s'exécutent avec un service account Admin SDK qui bypasse les Security Rules. Les validations métier sont dans les fonctions elles-mêmes — les Security Rules sont une deuxième ligne de défense, pas la première.

---

## 4. Estimation des coûts Firestore

### Par session typique (15-30 min, 1-2 sessions/jour)

| Action | Reads | Writes |
|---|---|---|
| `resolveLoginState` | 2 (player + buildings) | 1 (player mis à jour) |
| Lecture `marketState` au login | 1 | 0 |
| Lecture `activeWorldEvents` | 1 | 0 |
| Lecture `contracts` (liste) | 1 | 0 |
| `collectProduction` × 1 | 2 | 1 |
| `deliverToContract` × 1 | 3 | 2 |
| `sellToMarket` × 1 | 2 | 1 |
| Poll `marketState` (×2 pendant session) | 2 | 0 |
| **Total session** | **~14 reads** | **~5 writes** |

### Projections à l'échelle

| Échelle | Reads/mois | Writes/mois | Coût Firestore | Coût Functions | **Total** |
|---|---|---|---|---|---|
| 1k DAU | 420k | 150k | ~$0.25 | ~$0 (free tier) | **~$0.25/mois** |
| 10k DAU | 4.2M | 1.5M | ~$2.50 | ~$0.50 | **~$3/mois** |
| 50k DAU | 21M | 7.5M | ~$12.60 | ~$4 | **~$17/mois** |

Scheduled functions : `updateMarketPrices` = 12 writes/h × 24h × 30j = ~8 600 writes/mois → **négligeable**.

**Bien en dessous de la cible $50/mois à 10k DAU.**

---

### ⚠️ FLAG COÛT #1 — Listener Firestore sur `marketState` (BLOQUANT)

Si le ticker UI utilise un **listener temps réel** sur `/global/marketState`, chaque write du scheduled CF (toutes les 5 min) génère **1 read par joueur connecté**.

```
12 writes/h × 24h × 30j = 8 640 writes/mois
8 640 × 10 000 joueurs connectés = 86.4M reads/mois
86.4M × $0.06/100k = $51.84/mois — uniquement pour le ticker
```

**Alternative qui préserve l'intention design :**
Le client poll `/global/marketState` manuellement toutes les 5 minutes (même cadence que la mise à jour serveur). Le joueur voit les prix se mettre à jour exactement aussi souvent qu'ils changent réellement. L'intention "lecture ambiante" est préservée. Le coût est réduit à ~3M reads/mois supplémentaires à 10k DAU.

### ⚠️ FLAG COÛT #2 — Subcollection buildings qui grandit (Phase 2)

En Phase 1, 1 bâtiment = 1 read de subcollection au login. En Phase 2 avec 5+ bâtiments, c'est 5+ reads supplémentaires par login. **Solution préventive :** dénormaliser les bâtiments dans le document player jusqu'à 5 bâtiments maximum. Le document player grossit (~2-3 KB supplémentaires) mais le coût en reads reste à 1 au login. À reconsidérer uniquement si le joueur peut posséder >10 bâtiments.

---

## 5. Architecture Client Unity

### Service Locator

```csharp
// Une seule instance dans la Bootstrap scene, DontDestroyOnLoad
// Pas de MonoBehaviour singleton — interface + implémentation découplées
public class GameServiceLocator : MonoBehaviour
{
    public static GameServiceLocator Instance { get; private set; }
    private readonly Dictionary<Type, object> _services = new();

    private void Awake()
    {
        if (Instance != null) { Destroy(gameObject); return; }
        Instance = this;
        DontDestroyOnLoad(gameObject);
        RegisterServices();
    }

    private void RegisterServices()
    {
        var dispatcher = GetComponent<MainThreadDispatcher>();
        _services[typeof(IPlayerService)]     = new FirebasePlayerService(dispatcher);
        _services[typeof(IProductionService)] = new FirebaseProductionService(dispatcher);
        _services[typeof(IContractService)]   = new FirebaseContractService(dispatcher);
        _services[typeof(IMarketService)]     = new FirebaseMarketService(dispatcher);
    }

    public T Get<T>() => (T)_services[typeof(T)];
}
```

### MainThreadDispatcher

```csharp
// Sur le même GameObject que ServiceLocator
public class MainThreadDispatcher : MonoBehaviour
{
    private static readonly ConcurrentQueue<Action> _queue = new();

    private void Update()
    {
        while (_queue.TryDequeue(out var action))
            action?.Invoke();
    }

    public static void Post(Action action) => _queue.Enqueue(action);
}

// Usage dans TOUS les callbacks Firebase :
_functions.GetHttpsCallable("resolveLoginState")
    .CallAsync()
    .ContinueWith(task => {
        if (task.IsFaulted) { /* log */ return; }
        MainThreadDispatcher.Post(() => {
            // Mise à jour UI sur le main thread — jamais directement ici
            _view.Refresh(ParseSnapshot(task.Result));
        });
    });
```

### Offline persistence (à configurer avant tout autre appel Firebase)

```csharp
public class FirebaseInitializer : MonoBehaviour
{
    private async void Awake()
    {
        await FirebaseApp.CheckAndFixDependenciesAsync();

        // Offline persistence AVANT le premier listener ou GetSnapshot
        var settings = FirebaseFirestore.DefaultInstance.Settings;
        settings.PersistenceEnabled = true;
        settings.CacheSizeBytes = 10 * 1024 * 1024; // 10 MB — suffisant pour Phase 1
        FirebaseFirestore.DefaultInstance.Settings = settings;
    }
}
```

### ScriptableObjects vs Remote Config vs Firestore

| Donnée | Stockage | Raison |
|---|---|---|
| Durées de production | `ScriptableObject` (défaut) + **Remote Config** (override) | LiveOps-able sans deploy, fallback offline garanti |
| Prix de base du marché | `ScriptableObject` + **Remote Config** | Idem |
| Templates de contrats (quantités, rewards) | **Remote Config** uniquement | Changent fréquemment, doivent être pilotables en live |
| Favor thresholds | `ScriptableObject` + **Remote Config** | Rarement changés mais doivent l'être sans store update |
| Coûts des upgrades inventaire | **Remote Config** | Gold sink = levier économique LiveOps critique |
| Coût du Guild Charter | **Remote Config** | Événement économique majeur = trigger LiveOps |
| Prix courants | **Firestore** (`/global/marketState`) | State live, server-authoritative |
| State joueur (gold, inventory) | **Firestore** uniquement | Server-authoritative, jamais de cache local économique |

**Règle d'or :** si la valeur affecte l'économie → Remote Config. Si c'est du state live → Firestore. ScriptableObject est le fallback offline, jamais la source de vérité en production.

### Ticker de prix — sans exploser les reads

```csharp
public class FirebaseMarketService : IMarketService
{
    private MarketSnapshot _cache;
    private float _lastFetchTime = float.MinValue;
    private const float POLL_INTERVAL = 300f; // 5 min = cadence du scheduled CF

    public async Task<MarketSnapshot> GetCurrentPricesAsync(CancellationToken ct)
    {
        // Sert le cache si suffisamment récent
        if (_cache != null && Time.realtimeSinceStartup - _lastFetchTime < POLL_INTERVAL)
            return _cache;

        var snapshot = await FirebaseFirestore.DefaultInstance
            .Document("global/marketState")
            .GetSnapshotAsync(ct);

        _cache = snapshot.ConvertTo<MarketSnapshot>();
        _lastFetchTime = Time.realtimeSinceStartup;
        return _cache;
    }
}
```

Le ticker UI appelle `GetCurrentPricesAsync()` à l'affichage — il reçoit le cache en <1 ms la plupart du temps, et déclenche un vrai read seulement toutes les 5 min. **Zéro listener Firestore sur les documents globaux.**

---

## Désaccords avec les décisions gameplay de 3A

### Désaccord 1 — "Ticker compact toujours visible" ≠ listener temps réel

La décision de design est correcte et doit être préservée. Mais **un listener Firestore permanent sur `marketState` coûte ~$52/mois à 10k DAU** rien que pour cette fonctionnalité.

**Alternative préservant l'intention :** polling toutes les 5 minutes (même cadence que `updateMarketPrices`). Le joueur voit les prix changer exactement aussi souvent qu'ils changent réellement. L'expérience est identique, le coût est négligeable. C'est la seule approche viable.

### Désaccord 2 — La spec 3A dit "delta temps × production rate calculé au login"

VETO préventif sur la formulation — pas sur l'intention.

> **VETO — Doctrine Anti-Cheat.** Le client ne fournit jamais de paramètre temporel. `resolveLoginState` ne reçoit aucun `elapsedSeconds` du client. Le serveur lit `slot.startedAt` depuis Firestore et calcule `now - startedAt` lui-même avec `serverTimestamp()`. Le client envoie uniquement un appel vide `{}`. Toute autre formulation ouvre une fenêtre de triche triviale.

L'intention design (production offline continue, clampée par le cap) est entièrement préservée. Seul le vecteur du calcul change : serveur uniquement.

---

## 3 Questions Critiques Avant la Première Ligne de Code

**Q1 — Stratégie de migration du schéma Firestore**
Le champ `schemaVersion` est en place, mais la politique de migration doit être décidée maintenant. Deux options : (A) Cloud Function de migration one-shot qui met à jour tous les documents existants quand `schemaVersion` change — simple, mais risqué sur un dataset large. (B) Couche de compatibilité dans les services Unity qui lit les deux formats pendant une période de transition. Pour un pre-alpha solo avec peu de documents, A est recommandé. Mais la décision doit précéder le premier write en production, pas le suivre.

**Q2 — Firebase App Check : provider de debug pour l'environnement local**
App Check est non-négociable avant tout lancement public (audit v1 — HIGH open). Mais le Firebase Emulator ne supporte pas App Check, et activer le `DebugProvider` en développement crée un risque d'oubli en production. La stratégie recommandée : flag de build `#if UNITY_EDITOR` qui active le `DebugProvider` uniquement en éditeur, et `PlayIntegrityProvider` (Android) en production. Ce setup doit être validé avant d'écrire la moindre Cloud Function — sinon tout le dev local sera bloqué ou non sécurisé.

**Q3 — Firebase Emulator Suite vs projet de staging séparé pour les tests**
La Doctrine Solo Founder recommande 80% de tests d'intégration contre l'Emulator. Mais l'Emulator a des limitations sur les Scheduled Functions et ne supporte pas App Check. Recommandation : Emulator pour toutes les `onCall` functions (production, contrats, marché), et un projet Firebase de staging dédié (~$2-5/mois) pour valider les Scheduled Functions et les Security Rules en conditions réelles avant chaque deploy. Ce choix impacte la structure du `firebase.json`, les scripts CI et la gestion des secrets — il doit être acté avant le premier `firebase deploy`.
