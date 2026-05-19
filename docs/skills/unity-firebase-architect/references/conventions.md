# Conventions — Guilds & Empires (V2)

## C# Naming

| Élément | Convention | Exemple |
|---|---|---|
| Class | PascalCase | `FirebaseEconomyService` |
| Interface | I + PascalCase | `IEconomyService` |
| ScriptableObject | PascalCase + SO | `ResourceTypeSO`, `EconomyConstantsSO` |
| Private field | _camelCase | `_profileListener` |
| Méthode async | PascalCase + Async | `CollectBuildingAsync` |
| Model Firestore | PascalCase, pas de suffixe | `PlayerProfile`, `MarketListing` |
| Event | On + PascalCase | `OnProfileChanged`, `OnBuildingReady` |
| ScriptableObject key | camelCase | `goldProductionRate` (même nom que la clé RC) |
| Cloud Function (TS) | camelCase | `collectBuilding`, `executeTrade` |

## Remote Config — Naming des clés

Les clés Remote Config utilisent le même nom que les champs ScriptableObject correspondants.
Cela évite les bugs de traduction entre SO et RC.

```csharp
// EconomyConstantsSO.cs
public int goldProductionRate = 10;  // ← même nom que la clé RC
public int collectionIntervalSeconds = 300;

// RemoteConfigManager.cs
public int GoldProductionRate => (int)_rc.GetValue("goldProductionRate").LongValue;
//                                                   ^^^^^^^^^^^^^^^^^^^
//                                                   même nom exactement
```

---

## Git — Workflow trunk-based (solo founder)

```
main           ← toujours deployable en prod
feature/xxx    ← durée max 2 jours — fusionner tôt, fusionner souvent
fix/xxx        ← hotfix depuis main
```

**Règle :** Pas de branches longues. Si une feature prend plus de 2 jours,
découpez-la et mergez les parties indépendantes.

### Commit format (Conventional Commits)

```
type(scope): description courte

Corps optionnel si nécessaire.
```

**Types :** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`

**Scopes :** `economy`, `guild`, `market`, `auth`, `ui`, `services`, `firebase`,
`addressables`, `liveops`, `iap`, `anticheat`, `perf`, `build`

**Exemples :**
```
feat(economy): add collectBuilding Cloud Function with server-side yield calculation
fix(ui): dispatch Firestore callbacks to main thread via MainThreadDispatcher
refactor(services): extract IEconomyService interface from static EconomyService
chore(deps): upgrade Firebase SDK to 13.2.0
perf(ui): replace string concat with TMP SetText in resource display
test(economy): add Firebase Emulator integration tests for collectBuilding
docs(adr): ADR-002 market architecture — listings vs global price document
```

---

## PR Self-Review Checklist (obligatoire avant merge)

### Sécurité & économie
- [ ] Aucune écriture économique côté client (pas de `gold +=` ni write Firestore direct)
- [ ] Cloud Functions : auth check, input validation, idempotency, rate limit ?
- [ ] Nouvelles collections Firestore couvertes par les Security Rules ?
- [ ] Nouveaux champs de timing utilisent `FieldValue.serverTimestamp()` ?

### Unity & mobile
- [ ] Callbacks Firebase dispatched via `MainThreadDispatcher.Post` ?
- [ ] Listeners Firestore disposés dans `OnDisable` ?
- [ ] `CancellationToken` passé à toutes les méthodes async ?
- [ ] `OnApplicationPause` ferme les listeners correctement ?
- [ ] Aucun `Resources.Load` en gameplay (passe par Addressables) ?
- [ ] Aucune allocation string dans Update/hot paths ?

### Config & LiveOps
- [ ] Nouveaux nombres de gameplay = clé Remote Config avec default dans SO ?
- [ ] Nouvelles clés RC ajoutées au registry dans `conventions.md` et `EconomyConstantsSO` ?
- [ ] Nouveaux events Analytics ajoutés dans `AnalyticsEvents.cs` ?

### Architecture
- [ ] Aucun accès Firebase direct depuis l'UI (passe par IService) ?
- [ ] Pas de nouvelle dépendance sans justification dans l'ADR ?
- [ ] Pas de pattern YAGNI introduit ?

---

## Analytics — Registry des events

| Event | Déclencheur | Paramètres obligatoires |
|---|---|---|
| `session_start` | App au premier plan | `player_level` |
| `auth_success` | Login/signup réussi | `method` (email/google/anonymous) |
| `auth_error` | Login/signup échoué | `method`, `error_code` |
| `building_collected` | Collecte bâtiment | `building_type`, `building_level`, `yield_amount` |
| `building_upgrade_started` | Début upgrade | `building_type`, `from_level`, `to_level`, `cost` |
| `trade_executed` | Achat/vente marché | `resource_type`, `quantity`, `price_per_unit`, `is_buying` |
| `listing_created` | Création annonce | `resource_type`, `quantity`, `price_per_unit` |
| `iap_initiated` | Ouverture store | `product_id` |
| `iap_completed` | Achat validé côté serveur | `product_id`, `gems_granted` |
| `iap_failed` | Achat échoué/annulé | `product_id`, `error_code` |
| `guild_created` | Création guilde | — |
| `guild_joined` | Rejoindre guilde | — |
| `liveops_event_seen` | Bannière événement vue | `event_name` |
| `cf_error` | Cloud Function erreur | `function_name`, `error_code` |
| `app_backgrounded` | `OnApplicationPause(true)` | `session_duration_seconds` |

---

## Remote Config — Registry complet des clés

| Clé | Type | Défaut SO | Notes |
|---|---|---|---|
| `goldProductionRate` | int | 10 | Unités/heure/niveau bâtiment |
| `woodProductionRate` | int | 8 | Idem |
| `stoneProductionRate` | int | 6 | Idem |
| `foodProductionRate` | int | 12 | Idem |
| `collectionIntervalSeconds` | int | 300 | Minimum recommandé : 60 |
| `buildingStorageCap` | int | 500 | Plafond stockage par bâtiment |
| `marketFeePercent` | int | 5 | Commission (0-20) |
| `maxMarketListingsPerPlayer` | int | 5 | Anti-spam listings |
| `guildMaxMembers` | int | 20 | Membres max par guilde |
| `guildCreationCost` | int | 500 | Coût gold création guilde |
| `maxGoldPerHour` | int | 1000 | Seuil anomalie anti-triche |
| `buildingUpgradeBaseCost` | int | 200 | Coût upgrade niveau 1→2 |
| `buildingUpgradeScaling` | float | 1.8 | Multiplicateur par niveau |
| `newPlayerGoldBonus` | int | 100 | Bonus de démarrage |
| `eventActive` | bool | false | Activer/désactiver événement LiveOps |
| `eventName` | string | "" | Nom affiché événement |
| `eventMultiplier` | float | 1.0 | Multiplicateur production événement |
| `eventEndTimestamp` | long | 0 | Unix timestamp fin événement |
| `pushNotifEnabled` | bool | true | Kill-switch notifications push |
| `maintenanceMode` | bool | false | Afficher écran maintenance |
| `iapGemsSmall` | int | 100 | Gems pour le petit pack IAP |
| `iapGemsMedium` | int | 550 | Gems pour le pack moyen (+10%) |
| `iapGemsLarge` | int | 1200 | Gems pour le grand pack (+20%) |

---

## GitHub Actions — Pipelines

### Deploy Cloud Functions (sur push main, paths functions/**)
```yaml
name: Deploy Functions
on:
  push:
    branches: [main]
    paths: ['functions/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd functions && npm ci && npm test
      - run: npx firebase deploy --only functions --project ${{ vars.FIREBASE_PROJECT }}
        env: { FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }} }
```

### Deploy Firestore Rules (sur push main, paths firestore.rules)
```yaml
name: Deploy Firestore Rules
on:
  push:
    branches: [main]
    paths: ['firestore.rules', 'firestore.indexes.json']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx firebase deploy --only firestore --project ${{ vars.FIREBASE_PROJECT }}
        env: { FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }} }
```

---

## Scènes — Conventions

| Scène | Bootstrap | Rôle |
|---|---|---|
| `Boot.unity` | AppController, MainThreadDispatcher | Init Firebase, loading, routing |
| `Auth.unity` | — | Login / signup / anonymous |
| `MainHub.unity` | — | HUD ressources, bâtiments, navigation |
| `Market.unity` | — | Listings, achat, vente |
| `Guild.unity` | — | Gestion guilde |

**Règle :** Aucun GameObject Firebase dans les scènes autre que `Boot.unity`.
Les services Firebase sont initialisés une fois dans `AppController` et injectés via `Services`.

---

## Packages Unity — Liste autorisée

| Package | Version | Justification |
|---|---|---|
| Universal Render Pipeline | 17.x | Rendu mobile optimisé |
| Input System | 1.14.x | Nouveau système — obligatoire |
| Addressables | 2.x | Chargement d'assets mobile |
| TextMeshPro | (inclus) | UI texte sans GC |
| Firebase SDK | 13.x | Backend |
| DOTween | 1.x | Animations UI sans GC |
| Unity Test Framework | (inclus) | Tests |

**Retirer immédiatement :**
- Visual Scripting (1.9.7) — inutile, +15 MB
- Multiplayer Center (1.0.0) — inutile, mauvais modèle réseau
