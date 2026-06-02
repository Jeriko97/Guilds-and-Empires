# Briefing pour Claude Code — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle session Claude Code.

## Contexte projet rapide

Guilds & Empires (GAE) — MMORPG économique mobile médiéval-fantasy.
Phase 1 Vertical Slice en cours. Backend Firebase + Cloud Functions v2.

## État du repo (mise à jour : 2026-06-02)

- Branche active : feature/bootstrap-architecture
- Dernier commit : voir `git log` — dernier commit code : d1c7590 (feat: ProductionScreen)
- **ÉTAPE 16 FERMÉE** — Login de bout en bout Unity → backend confirmé
  Auth anonyme → resolveLoginState → PlayerState affiché (gold 0, rank local_supplier)
- **ÉTAPE 17 en cours (17.0 + 17.A-1 + 17.A-2 + 17.A-3 fermés)**
- **9 CF Phase 1 + firestore.rules déployées sur guildsandempires-ca543**
- Projet Firebase unique : `guildsandempires-ca543` (pas de dev/staging/prod séparés)
- App Check : Open (CF publiquement appelables — acceptable pré-alpha, D-ETAPE16-005)
- TD-013 ouverte : migration Node.js 20 → 22 avant 2026-10-30
- 9/9 Cloud Functions complètes (resolveLoginState, startProductionSlot,
  collectProduction, acceptContract, deliverToContract, sellToMarket,
  upgradeInventoryCap, purchaseGuildCharter, updateMarketPrices)
- 201/201 tests verts contre Firebase Emulator (179 handlers + 22 rules, stable sur 2 runs)
- **TD-010 RÉSOLUE** : firestore.rules Phase 1 + @firebase/rules-unit-testing@5.0.1

### Sous-étapes ÉTAPE 17 fermées

- **17.0** : Nettoyage legacy client — suppression stack POC auth/profile/economy
  (`AuthUIController`, `ProfileService`, `IEconomyService`, `EconomyService`, Canvas uGUI).
  AppBootstrap nettoyé. Doctrine : services par domaine, pas de service fourre-tout.
- **17.A-1** : buildingId server-authoritative dans resolveLoginState.
  `PlayerStateBuilding = BuildingDocument & { id: string }`. Client Unity ne reconstruit
  jamais l'id depuis une convention — toujours `BuildingSnapshot.Id` (D-ETAPE17.A-1).
- **17.A-2** : `ParseTimestampMs` canonique — clés `_seconds`/`_nanoseconds` (underscore),
  `null → 0L`, formule `sec * 1000L + nano / 1_000_000L`. SOURCE DE VÉRITÉ unique.
  Validé en Play : DebugScreen affiche `sawmill_0 (sawmill lv1)`, slots idle.
- **17.A-3** : ProductionScreen via `ScreenManager.SetRoot`. `startProductionSlot` retourne
  `{building: BuildingDocument; inventory: InventoryState}` (pas void). `IProductionService` /
  `FirebaseProductionService` sur patron `FirebasePlayerService`. `recipeId` figé `"logs"`.
  `ParseTimestampMs` passé `internal` pour réutilisation. DebugScreen conservé, inactif.
  Validé en Play : 3 slots idle → slot 0 « Logs en cours », 0 erreur console.

### Reste sur ÉTAPE 17

- **17.B** : collectProduction (prochain jalon)

### Points d'attention

- **TD-014** : test `resolveLoginState` avec `sleep(6000)` → flaky en CI.
  À corriger EN TOUT PREMIER au démarrage de 17.B.

### Couche client Unity (Assets/_Project/)

- `ServiceLocator` (static) — Register/Resolve/TryResolve
- `MainThreadDispatcher` — ConcurrentQueue<Action> drainé dans Update
- `FirebaseBootstrap` — CheckAndFixDependencies + PersistenceEnabled = true
- `AppBootstrap` — pipeline 7 steps (Firebase + anon auth + services + ScreenManager.SetRoot)
  Step 5 : enregistre `IPlayerService` + `IProductionService`. Step 7 : `ScreenManager.SetRoot(_productionScreen)`.
- `IPlayerService` + `FirebasePlayerService` — appel resolveLoginState, parsing, C6
- `IProductionService` + `FirebaseProductionService` — appel startProductionSlot, parsing, C6
  Patron identique à FirebasePlayerService (GetHttpsCallable → CallAsync → Parse → exceptions).
- `PlayerStateSnapshot` — modèle C# complet (gold, favor, inventory, favorRank, etc.)
- `ProductionResult` — `{ BuildingSnapshot Building; InventoryState Inventory }` + `Parse(data, buildingId)`
  Réutilise `PlayerStateSnapshot.ParseTimestampMs` (internal) — source unique préservée.
- `ScreenManager` (MonoBehaviour, `-80`) — stack Push/Pop/Replace/SetRoot, C3 conforme
- `BaseScreen` (abstract MonoBehaviour) — Show/Hide via `gameObject.SetActive`, `OnShow`/`OnHide`
- `ProductionScreen : BaseScreen` — C9 (CTS OnEnable/OnDisable), C3 (ServiceLocator),
  liste slots sawmill, bouton « Produire Logs » (idle) / label « Logs en cours » (actif)
- `DebugScreenController` — UI Toolkit, C9, inactif en runtime (remplacé par ProductionScreen via SetRoot)
- `DebugScreen.uxml` + `DebugScreen.uss` — layouts et styles debug (en scène, GO inactif)
- `ProductionScreen.uxml` + `ProductionScreen.uss` — layouts et styles production

### Backend Firebase (firebase/functions/src/)

- Helper partagé : shared/production.ts (processBuildingSlots)
- Helper partagé : shared/inventoryUpgrades.ts (INVENTORY_UPGRADE_COSTS/AMOUNTS)
- Helper partagé : shared/favorRank.ts (FAVOR_THRESHOLDS 50/200/350)
- Helper partagé : shared/guildCharter.ts (GUILD_CHARTER_COST=500)
- Helper partagé : shared/marketPrices.ts (MARKET_PRICE_BOUNDS)
- Helper partagé : shared/computeMarketPrice.ts (helper pur testé sans emulator)
- Java 21 requis (Eclipse Temurin)
- Émulateur : firebase emulators:start --only firestore,auth --project demo-guilds-empires
- Tests : npm run test:emulator (depuis firebase/functions/)

## Skills à activer (Claude Code)

- unity-firebase-architect
- mobile-mmorpg-economy-systems-designer

Les deux skills sont dans le repo sous docs/skills/.

## Documents de référence dans le repo

Lire en priorité au démarrage :

- docs/architecture/phase-1-technical-implementation.md (architecture)
- docs/architecture/phase-1-decisions-log.md (décisions tranchées)
- docs/architecture/technical-debt.md (TD-001 à TD-012, TD-008 non ouverte)
- docs/architecture/schema-migrations.md (schéma Firestore v1)
- docs/design/phase-1-economy-values.md (valeurs économiques)
- Dernier docs/sessions/*.md disponible

## Conventions installées (NON négociables)

1. Pattern handler/wrapper TD-005 :
   - export type {Function}Request = CallableRequest<DataType>
   - export type {Function}Response = ResultType
   - export async function {function}Handler(request): Promise<Response>
   - export const {function} = onCall({...}, {function}Handler)

2. TD-007 : pas de FieldValue.serverTimestamp() dans les arrays
   Firestore. Utiliser Timestamp.now() à la place.

3. Tests : --runInBand obligatoire dans le script test:emulator.
   Pas de afterAll, --forceExit suffit.

4. Validators : asserts pour le narrowing TypeScript. Payload entrant
   typé en unknown, validé au runtime.

5. Transactions Firestore pour toute opération multi-document.

6. check-then-mutate : valider tout avant de modifier quoi que ce soit.

7. Pas de paramètre temporel reçu du client. Tout temps vient du
   serveur via Timestamp.now() ou serverTimestamp().

8. HttpsError typé : unauthenticated, resource-exhausted,
   invalid-argument, failed-precondition, not-found, internal.

9. Helper computeFavorRank disponible dans shared/favorRank.ts
   (seuils 50/200/350). À utiliser pour tout recalcul de favorRank
   côté serveur. Ne pas dupliquer la logique de seuils inline.

10. Tests concurrents : Promise.allSettled (jamais Promise.all) pour
    éviter les uncaught rejections. Assertions exhaustives sur l'état
    Firestore post-transaction obligatoires (décrément UNE seule fois,
    crédit UNE seule fois).

11. Commits atomiques par responsabilité.

## Méthode de travail attendue

- Validation par étape (ne pas enchaîner sans validation founder)
- Tickets précis avec règles strictes
- Audit visible avant exécution (montrer le diff, attendre validation)
- Tests verts avant commit (jamais commit du code rouge)
- Documenter dans TD log toute dette consciente

## Pattern industriel pour une nouvelle Cloud Function

1. Vérifier l'état du repo (git status, git log)
2. Implémenter le handler avec tous les imports nécessaires
3. Mettre à jour index.ts pour exporter la fonction
4. Implémenter les tests d'intégration (8-14 tests minimum)
5. Lancer l'Emulator + npm run test:emulator
6. Si tous verts : commit unique
7. Si rouge : analyser, proposer le fix, attendre validation,
   re-tester, commit

## Patterns introduits (cumulatifs)

- Double idempotency (ÉTAPE 12) : technique (subcollection) + métier
  (upgradesApplied guard). Ordre canonique : technique AVANT métier.
- Séparation upgradesApplied / cap : progression permanente vs valeur
  effective (compatible buffs futurs sans migration).
- `shared/inventoryUpgrades.ts` : constantes typées `as const` pour
  coûts et montants d'upgrade. Cast `as readonly number[]` pour indexage.
- FAVOR_THRESHOLDS factorisé (ÉTAPE 13) : seuils 50/200/350 dans
  `shared/favorRank.ts`. Re-export ciblé via `shared/guildCharter.ts`.
  Trigger : 2e consommateur du seuil 350 (D-ETAPE13).
- V5 — ordre checks économiques : prérequis sémantique (favor) AVANT
  transaction (gold). Cohérent avec UX : l'erreur explicative passe en premier.
- Snapshot analytique dans le ledger (ÉTAPE 13) : favorAtPurchase +
  favorRankAtPurchase dans guildPurchases. Permet analytics "âge de
  promotion Phase 2" sans relire l'historique.
- Scheduled CF pattern (ÉTAPE 14) : TD-005 adapté — handler exporté
  `updateMarketPricesHandler(random?, now?)` testé directement, wrapper
  `onSchedule` non triggerable par l'emulator. random et now injectés.
- Guard active vs decaying events (ÉTAPE 14) : pour active, `decayEndsAt`
  est null en Firestore (schéma correct). Le guard ne bloque que les
  decaying sans timestamps. Placeholder `decayEndsAt ?? endsAt` pour active.
- Helper pur computeMarketPrice (ÉTAPE 14) : testé sans emulator dans
  `__test__/computeMarketPrice.test.ts`. Import admin uniquement pour Timestamp.
- Fail loudly / fail silently (ÉTAPE 14) : marketState absent → log+return.
  marketState corrompu (struct incomplète) → throw Error (D-ETAPE14c).

## Patterns Unity client établis (ÉTAPE 16)

- **Doctrine C3** : aucun SDK Firebase (Auth/Firestore/Functions) dans les classes UI.
  UI → IService → FirebaseXxxService (seule classe qui importe Firebase.*).
- **Doctrine C9** : `OnEnable` crée CTS + lance async ; `OnDisable` annule CTS.
  Pas de callback fantôme, pas de fuite mémoire.
- **D-ETAPE16-002** : ServiceLocator static existant réutilisé (pas MonoBehaviour).
- **D-ETAPE16-003** : Auth anonyme directement dans AppBootstrap step 4 (pas IAuthService).
  Trigger de refactor = introduction email/Google/Apple Sign-In.
- **Parsing Firebase Functions** : `Dictionary<object, object>` (pas `<string, object>`).
  Voir `PlayerStateSnapshot.Parse` + `ProductionResult.Parse` pour les deux patterns.
  `ParseTimestampMs` est `internal` dans `PlayerStateSnapshot` — source unique, ne jamais dupliquer.
- **UID dans snapshot** : injecté par le service après auth (pas récupéré dans l'UI).
- **Handlers métier retournent l'état mis à jour** (D-ETAPE17.A-3) : `startProductionSlot`
  retourne `{building, inventory}` — le client rend directement, zéro re-`resolveLoginState`.
  `resolveLoginState` = chargement initial uniquement. Patron à reproduire en 17.B+.
- **Navigation ScreenManager** : `SetRoot(screen)` pour premier écran post-boot.
  `BaseScreen` activé/désactivé via `gameObject.SetActive` (pas USS display, pas UIDocument.enabled).
  `_screenContainer` non câblé (pas d'Instantiate pour l'instant).

## Prochaine étape

**TD-014 (diagnostic)** puis **ÉTAPE 17.B collectProduction**.
17.A-3 entièrement fermée — premier écran gameplay + navigation ScreenManager prouvés en Play.
