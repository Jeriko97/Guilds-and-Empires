# Doctrine — MMO Persistent Economy

## Principe fondamental

Une économie MMO est un système fermé. Chaque pièce d'or créée sans sink correspondant est de
l'inflation. Le rôle du Technical Director n'est pas seulement de s'assurer que le code compile —
c'est de s'assurer que l'économie ne s'effondre pas six mois après le lancement.

---

## Sources et Sinks — Équilibre obligatoire

### Sources légitimes (gold entrant)
| Source | Type | Rate limit |
|---|---|---|
| Production bâtiments | Passif/temps | Plafonné par capacité de stockage |
| Récompenses quêtes | Actif/one-shot | Une fois par quête |
| Bonus quotidien | Passif/jour | Strictement 1x/24h serveur |
| IAP (premium currency → gold) | Monétisation | N/A (source externe) |
| Vente marché | Actif | Commission prélevée |

### Sinks obligatoires (gold sortant)
| Sink | Montant | Note |
|---|---|---|
| Commission marché | 5% (configurable RC) | Sur chaque transaction vendue |
| Upgrade bâtiments | Coût croissant (exponentiel) | Sink principal early/mid game |
| Crafting d'items | Coût fixe par recette | |
| Cosmétiques (F2P éthique) | Prix fixes | Pas de Pay-to-Win |
| Guilde treasury | Contribution volontaire | Pool partagé |

**Règle d'or :** Le total de gold produit par un joueur sur 30 jours doit être inférieur au total
des sinks disponibles sur 30 jours. Sinon inflation → dévaluation du marché → mort du jeu.

---

## Architecture de l'économie persistante

### Schéma Firestore (economy layer)

```
players/{uid}/
  resources:
    gold: int            ← jamais modifié côté client
    wood: int
    stone: int
    food: int
    gems: int            ← premium currency — IAP + CF seulement
    updatedAt: timestamp ← serverTimestamp à chaque mutation

  buildings/{buildingId}:
    type: string
    level: int           ← 1-10
    lastCollectedAt: timestamp  ← serverTimestamp sur collecte
    isUpgrading: bool
    upgradeStartedAt: timestamp | null

globalEconomy/prices:
  wood: int
  stone: int
  food: int
  updatedAt: timestamp   ← mis à jour par Cloud Scheduler (pas les clients)

market/{region}/listings/{listingId}:
  sellerId: string
  resourceType: string
  quantity: int
  pricePerUnit: int
  listedAt: timestamp
  expiresAt: timestamp   ← TTL Firestore policy
  status: "active" | "sold" | "cancelled" | "expired"
```

### Règles de calcul serveur

**Collecte bâtiment — calcul serveur uniquement :**
```typescript
// Cloud Function collectBuilding
const elapsed = Date.now() - building.lastCollectedAt.toMillis(); // server reads from Firestore
const yield = Math.min(
  calculateYield(building.type, building.level, elapsed), // server formula
  getStorageCap(building.type, building.level)             // server-side cap
);
// Le client n'envoie que : { buildingId, requestId }
// Le client ne calcule rien — il n'envoie aucun montant
```

**Transaction marché — atomique :**
```typescript
await db.runTransaction(async t => {
  const listing = await t.get(listingRef);
  if (listing.data().status !== 'active') throw new HttpsError('failed-precondition', 'Already sold');
  
  const buyerResources = await t.get(buyerResourcesRef);
  const totalCost = listing.data().quantity * listing.data().pricePerUnit;
  if (buyerResources.data().gold < totalCost) throw new HttpsError('failed-precondition', 'Insufficient gold');

  // Commission prélevée sur le vendeur
  const commission = Math.floor(totalCost * MARKET_FEE); // depuis Remote Config
  const sellerReceives = totalCost - commission;

  t.update(buyerResourcesRef,  { gold: FieldValue.increment(-totalCost), updatedAt: FieldValue.serverTimestamp() });
  t.update(sellerResourcesRef, { gold: FieldValue.increment(sellerReceives), updatedAt: FieldValue.serverTimestamp() });
  t.update(listingRef,         { status: 'sold', soldAt: FieldValue.serverTimestamp() });
  // La commission disparaît — c'est le sink du marché
});
```

---

## Monitoring économique

### Métriques à surveiller (via Analytics + BigQuery)

| Métrique | Seuil d'alerte | Action |
|---|---|---|
| Gold/heure médian | Baseline + 2σ | Investigation anomalie |
| Gold/heure max | > 10× médian | Freeze automatique du compte |
| Transactions annulées | > 5% | Bug ou double-spend attack |
| Gold total en circulation | Croissance > 20%/semaine | Rebalancing sink urgence |
| Taux de conversion sinks | < 30% du gold produit | Ajouter/renforcer les sinks |

### Détection d'anomalies dans Cloud Functions

```typescript
async function checkEconomyAnomaly(uid: string, goldDelta: number, source: string) {
  const hour = Math.floor(Date.now() / 3600000);
  const rateLimitKey = `rateLimit/${uid}/gold_${hour}`;
  
  const snap = await db.doc(rateLimitKey).get();
  const current = snap.exists ? snap.data()!.total : 0;
  
  if (current + goldDelta > MAX_GOLD_PER_HOUR) {
    // Log l'anomalie, freeze l'action, alerter l'admin
    await db.collection('anomalies').add({ uid, goldDelta, source, detectedAt: FieldValue.serverTimestamp() });
    throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
  }
  
  await db.doc(rateLimitKey).set({ total: current + goldDelta }, { merge: true });
}
```

---

## Prix du marché — Architecture anti-hot-document

**Problème :** Si `globalEconomy/prices` est un listener temps réel pour 10k joueurs, chaque
mise à jour coûte 10k lectures Firestore. À 10 updates/minute → 144M lectures/jour → ~$86/jour.

**Solution :**
```typescript
// Cloud Scheduler — toutes les 5 minutes
export const updateMarketPrices = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  // Agrège les listings actifs, calcule le prix médian, écrit une fois
  const prices = await aggregateMarketPrices();
  await db.doc('globalEconomy/prices').set({ ...prices, updatedAt: FieldValue.serverTimestamp() });
});
```

```csharp
// Côté Unity — polling toutes les 5 minutes, pas de listener temps réel
private async Task PollMarketPricesAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        var prices = await Services.Market.GetPricesAsync(ct);
        MainThreadDispatcher.Post(() => UpdatePriceDisplay(prices));
        await Task.Delay(TimeSpan.FromMinutes(5), ct);
    }
}
```

---

## Idempotency — Protection double-spend

Toute Cloud Function qui mute l'économie doit vérifier et enregistrer un `requestId` :

```typescript
async function ensureIdempotent(requestId: string, uid: string): Promise<boolean> {
  const ref = db.doc(`idempotency/${requestId}`);
  const snap = await ref.get();
  if (snap.exists) return true; // déjà traité — retourner résultat précédent

  // Enregistrement atomique dans la transaction
  // Ne jamais appeler set() ici — le faire dans la transaction principale
  return false;
}
```

**TTL :** Les documents `idempotency/` ont une TTL de 24h (politique Firestore TTL). Au-delà,
un même `requestId` peut être réutilisé — acceptable car les retries légitimes sont plus courts.

---

## Remote Config — Clés économiques obligatoires

| Clé RC | Type | Défaut SO | Note |
|---|---|---|---|
| `goldProductionRate_{buildingType}` | int | Varies | Unités/heure/niveau |
| `collectionIntervalSeconds` | int | 300 | 5 min minimum |
| `buildingStorageCap_{type}` | int | Varies | Plafond par type |
| `marketFeePercent` | int | 5 | Commission marché |
| `maxMarketListingsPerPlayer` | int | 5 | Anti-spam marché |
| `maxGoldPerHour` | int | 1000 | Seuil anomalie |
| `upgradeBaseCost_{type}` | int | Varies | Coût base niveau 1→2 |
| `upgradeScalingFactor` | float | 1.8 | Multiplicateur par niveau |
