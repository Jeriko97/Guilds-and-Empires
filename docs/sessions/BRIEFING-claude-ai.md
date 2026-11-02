# Briefing pour Claude (claude.ai) — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle conversation
claude.ai concernant GAE.

## Mon rôle dans le projet

Je suis l'auditeur stratégique et le rédacteur de tickets pour
Claude Code. Je ne code pas directement. Mes responsabilités :

1. Auditer les outputs de Claude Code (handlers, tests, schemas)
2. Cross-checker les retours de GPT sur les mêmes outputs
3. Rédiger les tickets précis envoyés à Claude Code (avec contraintes
   explicites et règles strictes)
4. Identifier la dette technique (TD-N) et la documenter
5. Trancher les arbitrages design/tech quand les deux skills
   divergent

Je ne suis PAS le développeur. Le founder reste maître des décisions
de design (gameplay, valeurs économiques, scope Phase 1 vs Phase 2+).

## Méthode installée

- Validation étape par étape (pas de "tant qu'à faire")
- Tickets ultra-précis avec règles strictes et livrables numérotés
- Commits atomiques par responsabilité
- TD log systématique pour toute dette consciente
- Decisions log pour les choix stratégiques tranchés
- Pattern handler/wrapper + types Request/Response (TD-005)
- Tests d'intégration contre Firebase Emulator

## Reprise du 2026-11-01 — à lire en premier

- Audit v2 : `docs/architecture/audit-v2-2026-11-01.md`.
- Log : `docs/sessions/2026-11-01-reprise-audit-p0.md`.
- **Changement de méthode (D-REPRISE-001)** : Claude Code pilote désormais l'Éditeur Unity
  (Unity CLI + `com.unity.pipeline`). Les tickets n'ont plus besoin d'une étape « wiring manuel »
  ni d'une « validation Play par le founder » : Claude Code câble la scène, entre en Play, lit la console
  et fournit une capture comme preuve. Le founder reste maître de la direction artistique et des arbitrages.
- **Mode autonome supervisé (D-REPRISE-003)** : Claude Code orchestre ; deux relecteurs read-only
  (sous-agent `auditeur` + Codex) relisent chaque ticket puis chaque diff ; le founder n'intervient que sur
  escalade (9 cas, `CLAUDE.md` ; cas 9 ajouté le 11-02, D-REPRISE-005). **Règle du founder (D-REPRISE-004,
  2026-11-02, remplace D-ETAPE18-006 sur ce point)** : « Ce qui est commité doit être identique à ce qui a reçu en dernier un GO des deux relecteurs. Ce GO peut venir de la revue du diff, d'une passe courte ou d'une passe après correction. Toute modification après ce GO, même de forme, déclenche une passe courte avant le commit. Aucune exception. »
  Inscrite dans `CLAUDE.md` §a.6 et le skill `revue-croisee` §5.
- État (fin de journée 2026-11-01) :
  - backend 9 CF déployées en **Node 22**, `claimDailyBonus` supprimé, 222/222 tests ; `marketState/state`
    seedé en prod (TD-018 marché close) ;
  - client : boucle produire → collecter → **vendre au marché** (écran Marché complet, ligne or/inventaire) ;
  - **ÉTAPE 18 (marché) FERMÉE** — log : `docs/sessions/2026-11-01-etape-18-marche.md`, décisions D-ETAPE18-001 à 006.
- Dette ouverte : TD-015 (parsing, 4 foyers), TD-016 (région), TD-017 (App Check), TD-018 (`contractPool` vide),
  TD-019 (firebase-functions 7.2.5 → 7.4.0), **TD-020 (multiplicateur d'event cumulatif : ≈ 16 au lieu de 9 ;
  correction ACTÉE le 11-02, D-TD020-001/002 : prix d'event ABSOLU 9 / 22, prérequis bloquant de l'étape world events)**.
- TO_PLAYTEST : prix des Logs immobile hors event (bruit ±5 % absorbé par l'arrondi, points fixes 3-6).
- Prochaine étape : contrats impériaux (`processWorldEventLifecycle` + `contractPool`, puis UI), précédés de la
  correction TD-020 (prérequis bloquant, D-TD020-001/002). Ses 3 arbitrages sont figés (D-TD020-003, 11-02) :
  prix de référence créé à la volée sans migration ; un seul event en cours par ressource (activation refusée,
  relecture des prix en échec si doublon) ; redescente 60 min exactes, à valider au playtest
  (`EVENT_DECAY_DURATION_MS`, à créer).

## État du projet (mise à jour : 2026-06-18 — historique)

- Phase : Phase 1 Vertical Slice — **backend CF TERMINÉ + boucle production câblée client (produce + collect)**
- Backend : Firebase + Cloud Functions v2 (TypeScript strict)
- Client : **Unity 6 — ÉTAPE 17.B fermée** (17.0 + 17.A-1 + 17.A-2 + 17.A-3 + 17.B fermés)
- Cloud Functions : **9/9 déployées sur guildsandempires-ca543** + Security Rules Phase 1
- Tests : 207/207 verts (backend ; client = 0 test automatisé)
- Projet Firebase : **unique** — `guildsandempires-ca543` (pas de dev/staging/prod séparés)
- Branche : feature/bootstrap-architecture

### Sous-étapes ÉTAPE 17 fermées

**17.0 — Nettoyage legacy client** : suppression stack POC auth/profile/economy
(7 fichiers .cs + metas), Canvas uGUI retiré de Boot.unity, AppBootstrap allégé.

**17.A-1 — buildingId server-authoritative** : `PlayerStateBuilding = BuildingDocument & { id: string }`
côté CF. `STARTER_SAWMILL_ID` constant partagé entre write et réponse. Déployé sur
`guildsandempires-ca543`.

**17.A-2 — Parsing BuildingSnapshot/SlotSnapshot + DebugScreen** : chaîne complète
CF → buildingId → slots → timestamps → DebugScreen prouvée live en Play.
DebugScreen affiche `Building — sawmill_0 (sawmill lv1)` + `slot[0/1/2] idle`.

**17.A-3 — ProductionScreen via ScreenManager.SetRoot** : `startProductionSlot` retourne
`{ building: BuildingDocument; inventory: InventoryState }` (pas void). `IProductionService` /
`FirebaseProductionService` sur patron `FirebasePlayerService`. `recipeId` figé `"logs"`.
`ParseTimestampMs` passé `internal` pour réutilisation. DebugScreen désormais inactif en
runtime (remplacé par ProductionScreen via SetRoot). Validé en Play : 3 slots idle → slot 0
"Logs en cours", 0 erreur console.

### Sous-étapes ÉTAPE 17.B fermées

**17.B-0 — Enrichissement collectProduction** : `{ collected, discarded }` → `{ collected, discarded, building, inventory }`.
Aligné sur `startProductionSlot` (doctrine 17.A-3). Commits : `7f3d41b` (code) + `8e19fdb` (docs).

**TD-004 — Résiduel préservé** : `lastProcessedAt = reference + completedCycles × durationMs`.
Factory `createTimestamp` injectée comme 4e param (helper pur). Flag `hasProcessedCycles`
remplace le détecteur `=== now`. 3 tests dédiés. Commit : `4b7d66a`.

**17.B-1 — Couche service collectProduction client** : `CollectProductionAsync(buildingId, ct)` →
`CollectProductionResult { Building, Inventory, Collected, Discarded }`. Extraction de
`ProductionParsingHelpers` (helpers partagés). `ParseTimestampMs` single-source préservée.
TD-015 ouverte. Commits : `1d1f1e9` (refactor) + `3af4212` (feat) + `c5d9d14` (docs).

**17.B-2 — Bouton « Collecter »** : bouton global au bâtiment dans ProductionScreen,
visible si ≥1 slot actif, C9 (souscription balancée OnEnable/OnDisable), CollectAsync
miroir de ProduceSlotAsync. Commit : `24467cd`.

### Reste sur ÉTAPE 17

Slice production complète câblée. ÉTAPE 17 full closure éventuelle après arbitrage prochaine slice.

### Client Unity

- `IPlayerService` + `FirebasePlayerService` : appel resolveLoginState, parsing C#, doctrine C3
- `IProductionService` + `FirebaseProductionService` : appel startProductionSlot, parsing C#,
  patron identique à FirebasePlayerService (GetHttpsCallable → CallAsync → Parse → exceptions)
- `PlayerStateSnapshot` : modèle complet avec `IReadOnlyList<BuildingSnapshot> Buildings`
- `BuildingSnapshot` / `SlotSnapshot` : id Firestore, buildingType, level, slots (recipeId, timestamps)
- `ProductionResult` : `{ BuildingSnapshot Building; InventoryState Inventory }` + `Parse(data, buildingId)`
- `CollectProductionResult` : `{ Building, Inventory, Collected, Discarded }` + `Parse(data, buildingId)`
- `ProductionParsingHelpers` : helpers de parsing partagés (`internal`), délégués par ProductionResult et CollectProductionResult
- `ParseTimestampMs` : helper canonique Timestamp Firebase, `internal`, source unique (voir « Doctrine Timestamp »)
- `ProductionScreen : BaseScreen` : C9, C3, liste slots sawmill, bouton "Produire Logs" + bouton global "Collecter"
- `DebugScreenController` : UI Toolkit, C9, inactif en runtime (remplacé par ProductionScreen)
- `AppBootstrap` : auth anonyme + enregistrement IPlayerService + IProductionService + SetRoot(ProductionScreen)

### Backend Firebase

- `collectProduction` : renvoie `{ collected, discarded, building, inventory }` (17.B-0)
- `processBuildingSlots` : helper pur, 4 params (`building, inventory, now, createTimestamp`),
  retourne `hasProcessedCycles: boolean`. `lastProcessedAt = reference + N×durationMs` (TD-004).
- Helper partagé : firebase/functions/src/shared/production.ts
- Helper partagé : firebase/functions/src/shared/inventoryUpgrades.ts
  (INVENTORY_UPGRADE_COSTS, INVENTORY_UPGRADE_AMOUNTS — TD-012)
- Helper partagé : firebase/functions/src/shared/favorRank.ts
  (FAVOR_THRESHOLDS as const — 50/200/350)
- Helper partagé : firebase/functions/src/shared/guildCharter.ts
  (GUILD_CHARTER_COST=500, GUILD_CHARTER_FAVOR_THRESHOLD — TD-012 étendue)
- Helper partagé : firebase/functions/src/shared/marketPrices.ts
  (MARKET_PRICE_BOUNDS — basePrices 5/12/20, fourchettes — TD-011 résolu)
- Helper partagé : firebase/functions/src/shared/computeMarketPrice.ts
  (computeMarketPrice, computeTrend, EventMultiplier — helper pur)

### Doctrine Timestamp wire Unity (réf. D-ETAPE17.A-2)

Les `Timestamp` Firestore arrivent dans `HttpsCallableResult.Data` avec les clés
**`"_seconds"` / `"_nanoseconds"` AVEC underscore** (champs internes de
`@google-cloud/firestore`, sérialisés via `Object.entries` sans `toJSON()`).

**`ParseTimestampMs(object raw)`** dans `PlayerStateSnapshot.cs` est la SOURCE DE
VÉRITÉ unique : `null → 0L` ; formule `_seconds * 1000L + _nanoseconds / 1_000_000L`.
Ne jamais créer un second parser pour les CFs futures (contrats, marché, upgrades).

## Documents de référence à demander au founder

Au début de chaque session, demander que ces docs soient attachés :

1. docs/architecture/phase-1-decisions-log.md
2. docs/architecture/phase-1-technical-implementation.md
3. docs/design/phase-1-economy-values.md
4. docs/architecture/technical-debt.md
5. docs/architecture/schema-migrations.md
6. docs/references/guilds-empires-vision-v1.md
7. Le dernier docs/sessions/*.md disponible

## Conventions projet à respecter dans mes recommandations

- Server-authoritative absolu (aucun calcul économique côté client)
- Aucun paramètre temporel reçu du client
- TD-005 : pattern handler extrait + types Request/Response
- TD-007 : Timestamp.now() dans les arrays Firestore (pas
  serverTimestamp)
- --runInBand pour les tests multi-suites
- check-then-mutate (validate everything, then modify)
- Tests Emulator avec namespace UIDs distinct par fonction
- HttpsError typé selon le cas, jamais throw Error générique

## Rythme de session optimal

- Quand le plan Anthropic est sous 50% : réponses pédagogiques OK
- Au-dessus de 70% : réponses courtes et opérationnelles uniquement
- Le founder a le droit de me dire "court uniquement" si je dérive

## Points d'attention actifs

- **App Check** : CF publiquement appelables (D-ETAPE16-005). Acceptable pré-alpha.
  À implémenter avant déploiement non-solo.
- **TD-013** : RÉSOLUE le 2026-11-01 (Node 22 déployé).
- **TD-015** (requalifiée 11-01) : primitives de parsing dans 4 foyers — FAIBLE. Cible `Core/FirebaseParsingHelpers`, au plus tard à l'étape contrats.
- **TD-020** : multiplicateur d'event cumulatif — correction actée (D-TD020-001/002 : prix d'event absolu 9 / 22, decay vers un prix de référence suivi à part),
  **prérequis bloquant** :
  première sous-étape de l'étape qui activera `processWorldEventLifecycle`. 3 arbitrages figés (D-TD020-003 :
  création à la volée, un seul event par ressource, redescente 60 min).
- **TD-021** (11-02) : erreurs des Cloud Functions planifiées sans alerte — à résoudre avant le premier event en
  production, prérequis du déploiement de `processWorldEventLifecycle` (ordre imposé dans TD-020).
- **Canvas pré-alpha** dans Boot.unity : supprimé (ÉTAPE 17.0).

### Prochaine retouche de CLAUDE.md

Remarques secondaires de l'auditeur (dernière passe de `ae6b40d`), reportées sans être appliquées (demande du
founder du 2026-11-02, après l'ajout du cas 9, D-REPRISE-005, qui ne les traite pas) ; à traiter
dans la prochaine retouche de `CLAUDE.md` et du skill `revue-croisee` (revue croisée, cas 5 si une convention
change). Aussi listées dans TD-020, « Points ouverts pour la sous-étape `processWorldEventLifecycle` ».
- `CLAUDE.md` §a.6 ne cite que le delta depuis le dernier GO ; le départ depuis la passe précédente (`prev.tree`) tant qu'aucun GO des deux n'existe n'est que dans le skill §5 et D-REPRISE-004 : aligner la formulation.
- Skill `revue-croisee` §1 : `git diff --cached --name-only` montre le staging antérieur, mais rien ne dit quoi faire s'il n'est pas vide (proposition : non vide et hors FICHIERS → s'arrêter et le signaler dans le rapport).
- Skill `revue-croisee` §5 : « non vide : liste les fichiers modifiés » ne dit pas quoi faire si le delta est vide (proposition : vide → pas de passe courte, l'arbre est déjà celui du dernier GO).

## Prochaine étape attendue

Contrats impériaux : backend `processWorldEventLifecycle` + alimentation de `contractPool`, puis service et écran
(`acceptContract`, `deliverToContract`). **Première sous-étape, bloquante : corriger TD-020** (prix d'event absolu 9 / 22,
tests déterministes, D-TD020-002) avant d'implémenter `processWorldEventLifecycle`. Arbitrages figés (D-TD020-003) :
A — `referencePrices` créé à la volée par `updateMarketPrices`, sans migration (champ absent avec event en cours →
erreur) ; B — un seul event en cours par ressource (garde à l'activation + échec de toute la relecture si doublon), et un seul
event en attente par ressource (décision founder : un 3e est refusé et journalisé,
définitivement) ;
C — redescente 60 min exactes, à valider au playtest (`EVENT_DECAY_DURATION_MS`, à créer, `decayEndsAt` calculé
par le serveur à l'activation). Plus aucun point de design ouvert. Jalons : TD-020 se ferme côté prix
(`updateMarketPrices`), déployée et constatée avant `processWorldEventLifecycle`, comme la résolution de TD-021
(alerte sur les erreurs des CF planifiées) ; la garde à l'activation, la file d'attente
bornée et la durée de 60 min sont des critères obligatoires de la sous-étape `processWorldEventLifecycle`.
