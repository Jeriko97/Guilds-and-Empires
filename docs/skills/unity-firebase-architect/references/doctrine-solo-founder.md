# Doctrine — Solo Founder Anti-Overengineering

## Principe fondamental

La complexité est votre ennemi principal. Chaque abstraction que vous construisez est du code que
vous devez maintenir indéfiniment. Un solo founder qui over-engineer son architecture passe son
temps à maintenir des patterns au lieu de livrer du gameplay.

**Budget de complexité :** Si vous ne pouvez pas expliquer l'architecture complète du projet
à un développeur senior en 5 minutes, c'est trop complexe.

---

## Les YAGNI absolus (Ne jamais construire pour ce projet)

| Pattern | Pourquoi c'est tentant | Pourquoi c'est mauvais ici |
|---|---|---|
| Generic repository `IRepository<T>` | "Ça évite la répétition" | Vous avez 3 entités. Concrétisez. La généricité vient après 10+ entités. |
| Event Sourcing / CQRS | "C'est scalable" | Vous êtes pre-alpha. Aucune nécessité à < 100k DAU. Firestore + CF suffit. |
| Kubernetes / Docker containers | "La prod doit scaler" | Firebase Cloud Functions scalent automatiquement. Zéro ops. |
| Custom DI container (Zenject, etc.) | "La testabilité" | `ServiceLocator` suffit. Zenject = 50k LOC de dépendance pour 5 services. |
| Microservices | "Séparation des responsabilités" | Une Cloud Functions codebase. Tout dans `functions/`. |
| WebSockets custom | "Latence temps réel" | Firebase Realtime Database pour la présence. Firestore listeners pour l'état. |
| Message queues (Pub/Sub, etc.) | "Découplage" | Cloud Functions + Firestore triggers suffisent. |
| Redux / state management framework | "État centralisé" | Un ServiceLocator + callbacks. Pas de boilerplate Redux en C#. |
| Reflection-based serialization | "Flexibilité" | Sérialisation Firestore manuelle. Explicite > magique. |
| ORM / Firebase abstraction layer | "Portabilité" | Firebase est votre backend. Vous ne migrez pas. |

---

## Règle des 3 couches (strictement respectée)

```
UI Layer        → IService Interface → Firebase SDK
                                    ↗ (inject: FirebaseXxxService)

Maximum 3 couches entre l'action utilisateur et Firebase.
```

Si vous vous retrouvez à écrire :
```
UI → ViewModel → Presenter → UseCase → Repository → DataSource → Firebase
```
c'est 4 couches de trop. Vous faites du Clean Architecture pour une app de banking.
Ce projet n'est pas une app de banking.

---

## Structure de service acceptable (ni plus, ni moins)

```csharp
// Interface (pour la testabilité)
public interface IEconomyService
{
    Task RequestCollectAsync(string buildingId, CancellationToken ct);
    Task<ResourceBundle> GetResourcesAsync(CancellationToken ct);
    IDisposable ObserveResources(Action<ResourceBundle> onChanged);
}

// Implémentation Firebase (une seule)
public class FirebaseEconomyService : IEconomyService
{
    private readonly FirebaseFunctions _functions;
    private readonly FirebaseFirestore _db;

    public FirebaseEconomyService()
    {
        _functions = FirebaseFunctions.DefaultInstance;
        _db = FirebaseFirestore.DefaultInstance;
    }

    public async Task RequestCollectAsync(string buildingId, CancellationToken ct)
    {
        var fn = _functions.GetHttpsCallable("collectBuilding");
        var result = await fn.CallAsync(new Dictionary<string, object>
        {
            ["buildingId"] = buildingId,
            ["requestId"]  = Guid.NewGuid().ToString()
        }).WaitAsync(ct);
        // Firestore listener se met à jour automatiquement via ObserveResources
    }
    // ... autres méthodes
}

// ServiceLocator (pas de DI framework)
public static class Services
{
    public static IAuthService Auth       { get; private set; }
    public static IEconomyService Economy { get; private set; }
    public static IProfileService Profile { get; private set; }

    public static void Initialize()
    {
        Auth    = new FirebaseAuthService();
        Economy = new FirebaseEconomyService();
        Profile = new FirebaseProfileService();
    }
}
```

---

## Stratégie de tests (pragmatique pour solo founder)

**Pas de mock hell.** Les mocks qui ne correspondent pas à Firebase réel ne protègent pas
contre les bugs de production.

### Ce qu'on teste

```
80% — Tests d'intégration (Firebase Emulator Suite)
  → Cloud Functions + Firestore Rules + économie
  → Ces tests attrapent les vraies erreurs de prod

20% — Tests unitaires (logique pure)
  → Calculs économiques (calculateYield, upgradeCost)
  → Validation inputs (amount bounds, buildingId format)
  → Pas besoin de Firebase pour ces tests
```

### Ce qu'on ne teste PAS (solo founder)

- Mock des services Firebase (couplage à l'implémentation, faux positifs)
- Tests UI automatisés (trop fragiles, trop lents à maintenir)
- Performance tests automatisés (Unity Profiler manuel est suffisant)
- 100% de coverage (les tests qui n'attrapent pas de bugs sont une dette)

### Firebase Emulator Suite — setup minimal

```bash
# Installation (une fois)
npm install -g firebase-tools
firebase init emulators  # Auth, Firestore, Functions

# Lancement pour les tests
firebase emulators:start --only auth,firestore,functions
```

```typescript
// Cloud Functions test (Jest)
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'guilds-empires-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});

test('collectBuilding should yield correctly', async () => {
  const uid = 'test-user-1';
  const db = testEnv.authenticatedContext(uid).firestore();
  
  // Setup building with lastCollectedAt 10 minutes ago
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().doc(`players/${uid}/buildings/sawmill`).set({
      type: 'sawmill', level: 1,
      lastCollectedAt: Timestamp.fromMillis(Date.now() - 600_000)
    });
  });

  // Call the function
  const result = await collectBuilding({ buildingId: 'sawmill', requestId: 'req-1' }, { auth: { uid } });
  
  expect(result.status).toBe('ok');
  expect(result.yield).toBeGreaterThan(0);
});
```

---

## Quand introduire de la complexité

### Maintenant (pre-alpha) :
- ServiceLocator avec interfaces
- Cloud Functions séparées par domaine (economy, guild, market)
- Firestore listeners + MainThreadDispatcher
- ScriptableObjects + Remote Config

### À 1k DAU (early access) :
- Firebase Realtime Database pour la présence joueurs (pas Firestore)
- Sharding Firestore pour les documents hot (leaderboards)
- BigQuery export pour analytics avancé

### À 10k DAU :
- Cloud Functions en régions multiples (latence géographique)
- Firestore TTL policies pour auto-nettoyage
- Monitoring coûts avec alertes automatiques

### À 50k DAU :
- Évaluer Redis/Memorystore pour le cache de prix marché
- Évaluer Cloud Tasks pour les jobs lourds asynchrones
- Évaluer la séparation en Firebase projects (dev/staging/prod)

### Jamais (pour ce projet) :
- Kubernetes, microservices, message queues
- Custom auth server
- Base de données relationnelle séparée
- Serveur de jeu custom (Unity, Photon, Mirror)

---

## Anti-patterns de solo founder

### Le "j'ai besoin de ça plus tard"

```
"Je vais abstraire le repository maintenant, j'en aurai besoin plus tard."
→ YAGNI. Vous avez 3 collections Firestore. Quand vous en aurez 10, refactorisez.
  Le refactoring est moins cher que la maintenance d'une abstraction prématurée.
```

### Le "j'ai vu ça dans un gros projet"

```
"Netflix utilise CQRS, on devrait aussi."
→ Netflix a des équipes dédiées pour ça. Vous êtes seul. Firestore + Cloud Functions
  suffisent à des centaines de milliers d'utilisateurs avec la bonne architecture.
```

### Le "ça sera plus clean"

```
"Je vais ajouter une couche de mapping entre Firestore et mes models."
→ La "cleanness" n'est pas une métrique business. La vitesse de livraison l'est.
  Désérialisez Firestore directement dans vos model classes.
```

---

## Checklist avant d'ajouter une dépendance

Avant d'ajouter un nouveau package Unity ou npm :

- [ ] Quel problème résout-il que je ne peux pas résoudre avec ce qui existe ?
- [ ] Est-ce que j'ai ce problème maintenant ou je le prévois ?
- [ ] Quelle est la maintenance burden si le package devient abandonné ?
- [ ] Combien de MB ajoute-t-il au build ?
- [ ] Y a-t-il un conflit connu avec Firebase SDK ou URP ?
- [ ] Y a-t-il une solution plus simple qui résout 80% du problème ?

Si la réponse à la deuxième question est "je le prévois" : **ne pas ajouter**.
