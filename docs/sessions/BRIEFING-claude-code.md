# Briefing pour Claude Code — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle session Claude Code.

## Contexte projet rapide

Guilds & Empires (GAE) — MMORPG économique mobile médiéval-fantasy.
Phase 1 Vertical Slice en cours. Backend Firebase + Cloud Functions v2.

## Reprise 2026-11-01 — LIRE EN PREMIER

- Audit complet : `docs/architecture/audit-v2-2026-11-01.md` ; log : `docs/sessions/2026-11-01-reprise-audit-p0.md`.
- ÉTAPE 18 (slice marché) entamée en juillet-août : `IMarketService`, `SellToMarketAsync`,
  `PlayerEconomyStateStore`, coquille `MarketScreen` + navigation (commitée le 11-01).
  ÉTAPE 18.2b-2 (11-01) : contenu de `MarketScreen` (prix pollés 5 min 5 s, vente 1 / 10 / Tout) et ligne
  gold/inventaire sur `ProductionScreen`. **ÉTAPE 18 FERMÉE le 11-01** — log
  `docs/sessions/2026-11-01-etape-18-marche.md`, décisions D-ETAPE18-001 à 006.
- **11-02** : ÉTAPE 18 poussée ; décision founder TD-020 (D-TD020-001, amendée D-TD020-002) — prix d'event ABSOLU
  9 / 22 = prérequis bloquant de l'étape world events (voir « Prochaine étape »). Puis 3 arbitrages figés
  (D-TD020-003) : prix de référence créé à la volée, un seul event par ressource, redescente 60 min.
- Revue croisée : règle de **passe courte** (D-ETAPE18-006) — correction de logique après la revue diff →
  les deux relecteurs relisent ce delta uniquement, avant commit (`CLAUDE.md` §a.6).
- **Règle du founder (2026-11-02)** : toute modification faite après un GO, **même de forme**, déclenche une passe de
  revue courte (Codex + auditeur, sur ce delta uniquement) avant le commit. Pour les modifications faites après un
  GO, cette règle prime sur la phrase de `CLAUDE.md` §a.6 « Correction sans effet sur la logique (doc, commentaire,
  style) : listée dans le rapport » (alignement de `CLAUDE.md` et du skill `revue-croisee` à décider par le founder).
- Runtime CF : **Node 22**, déployé le 11-01 (TD-013 résolue).
- `claimDailyBonus` retiré du code (D-REPRISE-001/002).
- Tests : **222/222** verts (dont 13 du seed marché TD-018).
- Facturation Firebase réactivée le 11-01 (elle était coupée : toutes les CF renvoyaient `INTERNAL`).

### Pilotage de l'Éditeur Unity (D-REPRISE-001) — l'agent câble et valide lui-même

Unity CLI + `com.unity.pipeline` (skill `unity:unity-cli`). Plus de « wiring manuel requis » ni de
« validé en Play par le founder » : l'agent fait le câblage scène/prefab et valide en Play.
La direction artistique reste au founder.
- `unity status` → attendre `ready`. Si `PIPELINE_LOAD_PENDING`, donner le focus à la fenêtre Unity.
- Syntaxe : `unity command <groupe.commande> --param valeur --result-only --no-banner`
  (catalogue : `unity list --format json`).
- Mode Play : `editor.playmode.start|stop`. Activer `editor.playmode.set_run_in_background --enable true`,
  sinon le jeu se fige quand Unity n'a pas le focus.
- Console : `console.clear` / `console.get --tail N`. Capture : `capture.game_view` (base64 sans `--save_path` ;
  avec `--save_path`, le fichier est écrit sous `Assets/`).
- Cliquer un bouton UI Toolkit : `script.eval` + `UQueryExtensions.Q<Button>(root, "name")` +
  `NavigationSubmitEvent` (les méthodes d'extension ne sont pas visibles sans appel explicite).
- Déplacer/renommer un asset : `asset.move` (conserve le GUID). Ne jamais éditer le YAML
  `.unity`/`.prefab` à la main quand l'Éditeur est joignable.
- Erreur de compilation → le pont tombe (`Library/ScriptAssemblies` vide). Corriger le C# dans les fichiers, puis relancer.
- Après tout ajout d'asset : vérifier que son `.meta` est commité (incident du 31/05 → 11/01).
- `ProjectSettings/Packages/com.unity.pipeline/EditorPipelineConfig.json` est ignoré par git (D-ETAPE18-005) :
  le paquet le réécrit à chaque session. Vérifier à la main que `m_AllowBrowserClients` reste `false`.
- Tester une CF contre la production avec des appels « à échec voulu » est refusé par le garde-fou
  de l'agent (vu en 18.2b-2) : prévoir ces tests sur l'émulateur.

### Déploiement des CF

Uniquement sur autorisation explicite du founder pour ce déploiement (garde-fou auto mode).
```bash
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions --project guildsandempires-ca543
```
Sans `FUNCTIONS_DISCOVERY_TIMEOUT`, la CLI échoue sur ce poste (« User code failed to load…
Timeout after 10000 ») : chargement à froid de `lib/index.js` > 10 s sur le disque G:.
Dernier déploiement complet : 2026-11-01, 9 CF en Node 22, `claimDailyBonus` supprimée.
Dernier déploiement ciblé : 2026-11-01 21:13 UTC, `updateMarketPrices` seule (`--only functions:updateMarketPrices`),
depuis `0a54298` (TD-018). Les 8 autres CF tournent sur le code du déploiement complet.
Vigilance : le prochain déploiement complet embarquera tout ce qui a été commité depuis (escalade cas 2).
TD-019 : y joindre la montée `firebase-functions` 7.2.5 → 7.4.0 (avertissement de la CLI), tests verts avant.
Rappel D-TD018-001 : `updateMarketPrices` lève une erreur si `marketState/state` manque (seedé en prod le 11-01).

### ⚠️ TD-018 — marché seedé, contrats non initialisés en production

**Marché : résolu le 2026-11-01** — `marketState/state` seedé en prod (5 / 12 / 20) et `updateMarketPrices`
redéployée. `sellToMarket` → `inventory` vérifié en Play le 11-01 (ÉTAPE 18.2b-2, 1 log vendu).
**Reste :** `contractPool` vide (étape contrats).
Seed versionné (D-TD018-001), idempotent — toute nouvelle exécution prod reste une escalade founder :
```bash
npm --prefix firebase/functions run seed:market -- --project guildsandempires-ca543            # dry-run
npm --prefix firebase/functions run seed:market -- --project guildsandempires-ca543 --apply --confirm-production
```
Identifiants : Application Default Credentials. Google Cloud CLI 591.0.0 installé le 11-01
(`%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`), ADC du founder dans
`%APPDATA%\gcloud\application_default_credentials.json` (hors repo). Avertissement « quota project » sans effet.

## État du repo (mise à jour : 2026-06-18 — historique, voir « Reprise » ci-dessus)

- Branche active : feature/bootstrap-architecture
- **ÉTAPE 16 FERMÉE** — Login de bout en bout Unity → backend confirmé
  Auth anonyme → resolveLoginState → PlayerState affiché (gold 0, rank local_supplier)
- **ÉTAPE 17.B FERMÉE — boucle production câblée client (produce + collect)**
- **9/9 CF Phase 1 + firestore.rules déployées sur guildsandempires-ca543**
- Projet Firebase unique : `guildsandempires-ca543` (pas de dev/staging/prod séparés)
- App Check : Open (CF publiquement appelables — acceptable pré-alpha, D-ETAPE16-005)
- TD-013 ouverte : migration Node.js 20 → 22 avant 2026-10-30
- 9/9 Cloud Functions complètes (resolveLoginState, startProductionSlot,
  collectProduction, acceptContract, deliverToContract, sellToMarket,
  upgradeInventoryCap, purchaseGuildCharter, updateMarketPrices)
- 207/207 tests verts contre Firebase Emulator (185 handlers + 22 rules, stable sur 2 runs)
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
- **17.B-0** : collectProduction enrichi — `{ collected, discarded }` → `{ collected, discarded,
  building, inventory }`. Aligné sur startProductionSlot (doctrine 17.A-3).
- **TD-004 RÉSOLUE** : résiduel préservé dans lastProcessedAt — factory `createTimestamp` injectée
  en 4e param de `processBuildingSlots`, flag `hasProcessedCycles` explicit.
- **17.B-1** : `CollectProductionAsync(buildingId, ct)` → `CollectProductionResult { Building,
  Inventory, Collected, Discarded }`. Extraction `ProductionParsingHelpers` (helpers partagés,
  internal). `ParseTimestampMs` single-source préservée. TD-015 ouverte.
- **17.B-2** : bouton global « Collecter » dans ProductionScreen — visible si ≥1 slot actif,
  C9 (souscription balancée OnEnable/OnDisable), CollectAsync miroir de ProduceSlotAsync.
  Validé en Play : tap Collecter → collectProduction OK, « Rien à récolter » (no-op correct).

### Reste sur ÉTAPE 17

Slice production complète câblée. Prochaine slice client à arbitrer (marché / contrats / chaîne complète).

### Points d'attention

- **TD-014 RÉSOLUE** : sleeps remplacés par suppression déterministe du doc rateLimits.
- **TD-015** (requalifiée 11-01) : primitives de parsing dans 4 foyers (`Core/FirebaseParsingHelpers`,
  `InventoryParsingHelpers`, `ProductionParsingHelpers`, `PlayerStateSnapshot`) — FAIBLE. Cible :
  `Core/FirebaseParsingHelpers`, au plus tard à l'étape contrats.
- **TD-020** : multiplicateur d'event cumulatif (prix event Logs ≈ 16 au lieu de 9) — correction actée le 11-02
  (D-TD020-001/002 : prix d'event absolu 9 / 22), **prérequis bloquant** de l'étape qui activera `processWorldEventLifecycle`.
  Arbitrages figés le 11-02 (D-TD020-003) : création à la volée, un seul event par ressource, redescente 60 min.
- **TO_PLAYTEST** (economy-values §4) : prix des Logs immobile hors event (points fixes 3-6).

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
- `ProductionParsingHelpers` (internal static) — helpers partagés (RequireDict/GetValue/GetString/GetLong +
  ParseBuilding/ParseSlot/ParseInventory/ParseResourceStack). Délégués par ProductionResult et CollectProductionResult.
- `ProductionResult` — `{ BuildingSnapshot Building; InventoryState Inventory }` + `Parse(data, buildingId)`
  Délègue à ProductionParsingHelpers. `ParseTimestampMs` source unique préservée (internal, PlayerStateSnapshot).
- `CollectProductionResult` — `{ Building; Inventory; IReadOnlyDictionary<string,int> Collected; Discarded }` + `Parse(data, buildingId)`
  Même patron que ProductionResult. Collected/Discarded = map ResourceKey → (int)GetLong (long boxé wire).
- `ScreenManager` (MonoBehaviour, `-80`) — stack Push/Pop/Replace/SetRoot, C3 conforme
- `BaseScreen` (abstract MonoBehaviour) — Show/Hide via `gameObject.SetActive`, `OnShow`/`OnHide`
- `ProductionScreen : BaseScreen` — C9 (CTS OnEnable/OnDisable + souscription clicked balancée),
  C3 (ServiceLocator), liste slots sawmill, bouton « Produire Logs » (idle) / label « Logs en cours »
  (actif), bouton global « Collecter » (visible si ≥1 slot actif, CollectAsync miroir ProduceSlotAsync)
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
- unity-mobile-gameplay-engineer
- mobile-mmorpg-economy-systems-designer

Ces skills sont dans le repo sous `docs/skills/`.
Plugin officiel `unity@unity-agent-plugin` en complément : `unity:unity-cli` pour piloter
l'Éditeur, `unity:ui-uitk` pour la syntaxe UXML/USS. **Hors doctrine (Firebase only)** :
`unity:build-live-game`, `unity:setup-multiplayer-services`, `unity:setup-vivox-voice-chat`.

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

⚠️ Depuis D-REPRISE-003, le mode autonome supervisé décrit dans CLAUDE.md prime sur
les règles de validation ci-dessous. Le founder n'intervient que sur escalade.

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
- Fail loudly (ÉTAPE 14, révisé TD-018) : marketState absent → throw Error (D-TD018-001, remplace
  le log+return de D-ETAPE14c). marketState corrompu (struct incomplète) → throw Error (D-ETAPE14c).

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

## Prochaine étape (2026-11-02)

ÉTAPE 18 (marché) FERMÉE le 11-01 : TD-018 marché close, écran Marché complet (D-ETAPE18-001 à 006).
Vente de test en prod autorisée par le founder pour cette validation seulement (1 log, D-ETAPE18-004).

1. **Prérequis bloquant — TD-020** (D-TD020-001 amendée par D-TD020-002, complétée par D-TD020-003, founder, 11-02) :
   corriger `computeMarketPrice` — prix d'event ABSOLU `round(basePrice × multiplicateur)` = 9 (Logs) / 22 (Planks)
   à chaque tick actif, quel que soit le prix de départ ; prix de référence hors event suivi à part ; decay
   interpolé vers lui ; tests déterministes chiffrés (TD-020) ; amender D-ETAPE14b. **3 arbitrages figés
   (D-TD020-003)**, plus aucun point de design ouvert :
   - A : `referencePrices.{ressource}` créé à la volée par `updateMarketPrices` (même transaction), sans migration
     ni `schemaVersion` modifié ; champ absent avec un event en cours → erreur, document inchangé ;
   - B : un seul event en cours (`active`/`decaying`) par ressource — activation refusée dans
     `processWorldEventLifecycle`, et toute la relecture en échec dans `updateMarketPrices` si doublon ; l'event
     refusé attend (`pending`), **un seul en attente par ressource** (décision founder) : un 3e est refusé et
     journalisé, rien n'est écrit, refus définitif (jamais recréé) ;
   - C : redescente **60 min** exactes (à valider au playtest), constante `EVENT_DECAY_DURATION_MS` à créer dans
     `shared/marketPrices.ts` ; `decayEndsAt` calculé par le serveur à l'activation.
   Première sous-étape de l'étape contrats / world events, avant toute ligne de `processWorldEventLifecycle`.
   **Jalons** : TD-020 se ferme sur `computeMarketPrice` / `updateMarketPrices` (A + garde secondaire B). Ordre
   de déploiement imposé : `updateMarketPrices` corrigée, puis `referencePrices` constaté en prod, AVANT
   `processWorldEventLifecycle`. La garde principale B, la file d'attente bornée, la constante, le contrat `decayEndsAt` et leurs tests
   (activation refusée, file d'attente bornée, durée) sont des critères d'acceptation obligatoires de la sous-étape `processWorldEventLifecycle`.
2. Contrats impériaux : `processWorldEventLifecycle` + alimentation de `contractPool` (backend, tests émulateur),
   puis service client et écran (`acceptContract`, `deliverToContract`).
3. Résorber TD-015 dès qu'un fichier de parsing est touché.
