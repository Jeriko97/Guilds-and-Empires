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
- Revue croisée — **règle du founder (D-REPRISE-004, 2026-11-02, remplace D-ETAPE18-006 sur ce point)** :
  « Ce qui est commité doit être identique à ce qui a reçu en dernier un GO des deux relecteurs. Ce GO peut venir de la revue du diff, d'une passe courte ou d'une passe après correction. Toute modification après ce GO, même de forme, déclenche une passe courte avant le commit. Aucune exception. »
  Inscrite dans `CLAUDE.md` §a.6 et le skill `revue-croisee` §5.
- Escalade : les 9 cas de `CLAUDE.md` §b (cas 9 ajouté le 11-02, D-REPRISE-005) sont **remplacés le 11-03 par
  F1–F4** (D-REPRISE-007, ci-dessous). TD-021 ouverte le 11-02 (D-TD021-001) : alerte sur les erreurs des CF
  planifiées, prérequis du déploiement de `processWorldEventLifecycle`.
- **Arbitre stratégique et escalade F1–F4 (D-REPRISE-007, D-REPRISE-008, 2026-11-03)** : le rôle d'auditeur
  stratégique et d'arbitre, tenu jusqu'ici dans Claude.ai, est l'agent `.claude/agents/arbitre-strategique.md`
  (Read, Grep, Glob seulement ; sorties git jointes par Claude Code ; filtre du projet `.claude/settings.json` →
  `.claude/hooks/arbitre-lecture.js` qui lui interdit `.revue-croisee/` ; TD-031). La consigne commence par le type
  d'appel : « arbitrage d'une question » (ni diff ni tests) ou « audit de clôture / proposition de modification »
  (diff de l'index, tests, rapport, décisions). Le founder n'est sollicité que pour **F1** (game
  design et gameplay, règle d'effet indirect), **F2** (direction artistique, textes affichés), **F3** (actions
  irréversibles en production), **F4** (garde-fous, skills, désaccord persistant) ; tout le reste est tranché par
  l'arbitre (`CLAUDE.md` §b, avec la correspondance des 9 anciens cas, qui sert à lire les renvois « cas N »
  historiques). Dernier GO de D-REPRISE-004 = GO de Codex, de l'auditeur **et** de l'arbitre (audit de clôture sur
  `git diff --cached`) sur le même arbre ; l'arbitre peut dire NO-GO seul ; toute modification de l'index après un GO
  → passe courte des deux relecteurs puis nouvel audit de clôture ; après le commit, arbre du commit = arbre audité,
  avant tout push (`CLAUDE.md` §d, skill §6). Résumé d'arbitrages à chaque clôture d'étape :
  `docs/sessions/<date>-etape-N-arbitrages.md` (pièce de l'audit indépendant dans Claude.ai). Une modification de
  l'agent n'est pas toujours rechargée dans la session en cours : vérifier l'empreinte de son prompt (`CLAUDE.md`
  §d) avant de s'appuyer sur son verdict.
- **Push (D-REPRISE-009, 2026-11-03)** : push normal sur la branche de travail (branche courante de la sous-étape,
  jamais `main`) autorisé après les trois GO et la vérification de l'arbre ; restent en F3 : merge vers `main`,
  force-push ou réécriture d'historique, suppression de branche distante (`CLAUDE.md` §g).
- Runtime CF : **Node 22**, déployé le 11-01 (TD-013 résolue).
- `claimDailyBonus` retiré du code (D-REPRISE-001/002).
- Tests : **365/365** verts le 11-03 après l'ÉTAPE 19.4a (dont 18 du script de données de test ; 347 après 19.2b ; 318 après 19.2 ; 260 après 19.1 ; 222 au 11-01, dont 13 du seed marché TD-018).
- Tests client : **55/55** EditMode verts le 11-03 (46 de caractérisation du parsing, ÉTAPE 19.3 ; 9 de la garde
  du mode émulateur, ÉTAPE 19.4a ; `Assets/_Project/Tests/Editor/`) : `unity test . --mode EditMode --output <rapport.xml>`, Éditeur fermé (mode batch).
- Facturation Firebase réactivée le 11-01 (elle était coupée : toutes les CF renvoyaient `INTERNAL`).

### Pilotage de l'Éditeur Unity (D-REPRISE-001) — l'agent câble et valide lui-même

Unity CLI + `com.unity.pipeline` (skill `unity:unity-cli`). Plus de « wiring manuel requis » ni de
« validé en Play par le founder » : l'agent fait le câblage scène/prefab et valide en Play.
La direction artistique reste au founder.
- `unity status` → attendre `ready`. Si `PIPELINE_LOAD_PENDING`, donner le focus à la fenêtre Unity.
- Syntaxe : `unity command <groupe.commande> --param valeur --result-only --no-banner`
  (catalogue : `unity list --format json`).
- **Installation obligatoire (D-REPRISE-006)** : consigne complète dans `CLAUDE.md`, section « Pilotage de
  l'Éditeur Unity — installation obligatoire » (seule version de référence).
- Mode Play : `editor.playmode.start|stop`. Le réglage ci-dessus force Run In Background pendant le mode Play
  seulement (sinon le jeu se fige quand Unity n'a pas le focus) et remet 0 en sortie. Ne jamais relancer
  `set_run_in_background --enable true` : `runInBackground` reste à 0 dans `ProjectSettings.asset`.
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

### Jouer le client sur les émulateurs (ÉTAPE 19.4a, D-ETAPE19-011) — mode d'emploi

Éditeur Windows seulement ; aucun code émulateur dans un build. Zéro appel en production : instance nommée
`gae-emulator` (projet `demo-guilds-empires`, clés factices), sorties HTTPS/gRPC de Firebase envoyées dans un puits
local (`127.0.0.1:18999`), garde tout ou rien avant tout appel.
1. **Émulateurs** (depuis `firebase/`) : `npm --prefix functions run build`, puis
   `firebase emulators:start --only functions,firestore,auth --project demo-guilds-empires`. Ils tournent sous
   `demo-guilds-empires` : le préfixe `demo-` interdit tout accès à la production.
2. **Marché** : `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm --prefix functions run seed:market -- --project
   demo-guilds-empires` (essai à blanc : vérifier « (emulator) »), puis la même commande avec `--apply`.
   `npm run test:emulator` utilise les mêmes émulateurs et modifie leurs données : avant un Play de preuve, purger
   Firestore de l'émulateur (`DELETE http://127.0.0.1:8080/emulator/v1/projects/demo-guilds-empires/databases/(default)/documents`)
   et re-seeder.
3. **Activer l'interrupteur** : menu « GuildsAndEmpires/Firebase/Utiliser les émulateurs » (coché, hors Play ;
   `EditorPrefs` `GAE.Firebase.UseEmulators`, propre au poste). Une session de l'Éditeur = un seul environnement :
   après un Play en production (ou une lecture de la session de production), fermer et rouvrir l'Éditeur avant un
   Play émulateur, et inversement ; sinon le démarrage est refusé (« Redémarrer l'Éditeur »).
4. **Play** sur `Boot.unity` : la console affiche « Mode émulateur actif — instance « gae-emulator » … » ; le compte
   de test de l'émulateur est créé au besoin et connecté à chaque Play. Play émulateur ≤ 1 h (TD-029 : le jeton ne
   se renouvelle pas).
5. **Données de test** : `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm --prefix functions run emulator:testdata --
   --project demo-guilds-empires <commande>` : `set-inventory [--logs N] [--planks N] [--kits N]`,
   `start-logs-slot --slot S`, `rewind-slot --slot S --minutes M`, `corrupt-slot --slot S` (`--uid U` s'il y a
   plusieurs joueurs, `--building B` par défaut `sawmill_0`). `ProductionScreen` ne relit pas l'état serveur après
   son chargement : préparer le slot avant la Play (`start-logs-slot`), reculer le temps pendant (`rewind-slot`).
6. **Revenir à la production** : décocher « GuildsAndEmpires/Firebase/Utiliser les émulateurs » (hors Play), fermer
   et rouvrir l'Éditeur, puis Play. Interrupteur absent ou décoché = production, comportement inchangé.
7. **Test de la garde** : `EditorPrefs` `GAE.Firebase.GuardTestSkip` = `auth` | `proxy` | `firestore` | `functions`
   saute ce réglage ; le démarrage doit s'arrêter avant tout appel. `firestore` en première Play d'une session neuve
   de l'Éditeur. Retirer par le menu « GuildsAndEmpires/Firebase/Retirer le test de la garde ».
8. **Puits et preuves** : en usage normal rien n'écoute sur 18999 (connexion refusée = sortie bloquée). Pour une
   preuve, y faire écouter un journaliseur qui répond 403 sans rien relayer. **Règle écrite (founder, 2026-11-03)** :
   « lire la session de production réveille le SDK et provoque un renouvellement de jeton vers
   securetoken.googleapis.com ; toute lecture de preuve se fait puits actif ». « **Puits réseau actif** pendant tout
   Play qui sert de preuve, et pour toute lecture de la session de production. » Pendant une session émulateur, le
   puits bloque aussi la télémétrie de l'Éditeur (`*.unity3d.com`) jusqu'au redémarrage de l'Éditeur.

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
- **TD-015 RÉSOLUE** le 11-02 (ÉTAPE 19.3, `5b13b09`, D-ETAPE19-009) : un seul foyer par primitive de parsing.
- **TD-025** (11-02) : parsing numérique client permissif (arrondi, valeur par défaut au lieu d'une erreur) —
  décision du founder avant tout testeur externe ; les tests de caractérisation de 19.3 servent de référence.
- **TD-024** (11-02) : format de la clé d'idempotence non validé hors production — prochain ticket qui touche
  ces fonctions, au plus tard avant tout testeur externe.
- **TD-020** : multiplicateur d'event cumulatif (prix event Logs ≈ 16 au lieu de 9) — correction actée le 11-02
  (D-TD020-001/002 : prix d'event absolu 9 / 22), **prérequis bloquant** de l'étape qui activera `processWorldEventLifecycle`.
  Arbitrages figés le 11-02 (D-TD020-003) : création à la volée, un seul event par ressource, redescente 60 min.
- **TD-023** (11-02) : production infinie de planks et de kits par appel direct de `startProductionSlot` — à
  résoudre avant tout testeur externe ; fermeture au déploiement 19.5 (19.1, 19.2 et 19.2b implémentés, non
  déployés).
- **TD-021** (11-02) : erreurs des Cloud Functions planifiées sans alerte — à résoudre avant le premier event en
  production, prérequis du déploiement de `processWorldEventLifecycle` (ordre imposé dans TD-020). Étendue aux
  erreurs « slot corrompu » (connexion, collecte, arrêt) et prérequis du déploiement 19.5 (D-ETAPE19-008) : à
  résoudre au premier des deux déploiements.
- **TO_PLAYTEST** (economy-values §4) : prix des Logs immobile hors event (points fixes 3-6).

### Prochaine retouche de CLAUDE.md

**Traités le 2026-11-03 dans la retouche D-REPRISE-007** (arbitre stratégique, F1–F4) : `CLAUDE.md` §a.6 aligné
sur le départ `prev.tree` ; skill `revue-croisee` §1 (staging antérieur non vide hors FICHIERS → arrêt et
signalement) et §5 (delta vide → pas de passe courte, commit seulement si l'arbre a déjà toutes les validations) ;
phrase « Ne jamais relancer… » de `CLAUDE.md` sur une seule ligne ; consigne d'installation de l'outil de pilotage
gardée en entier dans `CLAUDE.md` seul (le briefing Claude Code y renvoie) ; règle du founder sur la clause STOP
inscrite dans `CLAUDE.md` §a.1.

Restent en attente (remarques secondaires de l'auditeur, reportées par le founder le 2026-11-02 ; à traiter dans la
prochaine retouche de `CLAUDE.md` ou du briefing ; modification d'un garde-fou → F4, `CLAUDE.md` §b) :
- `BRIEFING-claude-code.md`, pilotage de l'Éditeur : regrouper en une seule vérification de début de session de pilotage les trois clés de `EditorPipelineConfig.json` (`m_RunInBackgroundInPlayMode: true`, `m_RunInBackgroundCommandOverride: false`, `m_AllowBrowserClients: false`), et dire si le réglage d'installation survit à la réécriture du fichier « à chaque session ».
- Sur `263d3da` : le bloc des remarques sur `559f188` mêlait `CLAUDE.md` et le briefing sans dire quand le traiter — réglé par la phrase ci-dessus ; la puce « constat » de ce bloc est sortie de la liste (constat ci-dessous).

**Lot unique « retouches du corps de l'arbitre »** — décision du founder (2026-11-03, D-REPRISE-009), citée telle
quelle : « Les remarques mineures reportées sur le texte de l'agent seront traitées en un seul lot, avec un seul
nouveau test de réception. » Une seule retouche de `.claude/agents/arbitre-strategique.md`, revue croisée, puis un
seul test de réception (4 cas, instantanés, empreinte vérifiée), modification d'un garde-fou → F4. Contenu du lot :
- (a) contrôle du diff contre le dépôt limité aux lignes ajoutées : vérifier aussi que les lignes retirées sont
  absentes, et exiger avant l'audit de clôture que `git diff --name-only -- <FICHIERS>` soit vide, ou joindre ce diff
  non indexé (auditeur, revue du diff de D-REPRISE-007) ;
- (b) F3 du corps : « push, merge sur `main`, suppression de branche, réécriture d'historique non autorisés par le
  ticket » à aligner sur `CLAUDE.md` §b-§g et D-REPRISE-009 (remarque non bloquante de l'arbitre, audits de clôture
  du commit `8cd670c`, rapportée au founder). D'ici là, chaque saisine d'audit de clôture rappelle « push normal
  autorisé (D-REPRISE-009) » ;
- (c) une fois (a) et (b) appliqués et le test de réception réussi : retirer ce rappel de la consigne d'audit de
  clôture (`CLAUDE.md` §g, D-REPRISE-009).

Constat, rien à faire : D-REPRISE-006 s'appuie sur des sources Unity extérieures au dépôt (UnityCsReference 6000.2,
ScriptReference), non vérifiables en lecture seule ; les valeurs du dépôt sont cohérentes (`ProjectSettings.asset` :
`runInBackground: 0`, `scriptingDefineSymbols: {}`).

### Couche client Unity (Assets/_Project/)

- `ServiceLocator` (static) — Register/Resolve/TryResolve
- `MainThreadDispatcher` — ConcurrentQueue<Action> drainé dans Update
- `FirebaseBootstrap` — CheckAndFixDependencies + PersistenceEnabled = true ; expose l'instance choisie (`App` :
  instance par défaut, ou `gae-emulator` dans l'Éditeur en mode émulateur, D-ETAPE19-011), passée aux services
- `AppBootstrap` — pipeline 7 steps (Firebase + anon auth + services + ScreenManager.SetRoot)
  Step 5 : enregistre `IPlayerService` + `IProductionService`. Step 7 : `ScreenManager.SetRoot(_productionScreen)`.
- `IPlayerService` + `FirebasePlayerService` — appel resolveLoginState, parsing, C6
- `IProductionService` + `FirebaseProductionService` — appel startProductionSlot, parsing, C6
  Patron identique à FirebasePlayerService (GetHttpsCallable → CallAsync → Parse → exceptions).
- `PlayerStateSnapshot` — modèle C# complet (gold, favor, inventory, favorRank, etc.)
- `ProductionParsingHelpers` (internal static) — `ParseBuilding`/`ParseSlot`, foyer unique depuis 19.3 (primitives :
  `Core/FirebaseParsingHelpers` ; inventaire : `InventoryParsingHelpers`). Délégués par ProductionResult,
  CollectProductionResult et PlayerStateSnapshot.
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
   Complétée à partir de 19.4b par D-ETAPE19-010 (Q1, décision du founder) : `data-loss` pour un état de slot
   corrompu.

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
les règles de validation ci-dessous. Le founder n'est sollicité que pour F1–F4 (D-REPRISE-007) ; tout le reste est
tranché par l'arbitre stratégique.

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

**ÉTAPE 19 — chaîne Planks / Kits (en cours ; feuille de route : 18 Marché → 19 → 20 Contrats → 21 Charte)** :
production par lot des transformations, décidée le 11-02 (D-ETAPE19-001 à 004) : le joueur lance N cycles, les
intrants des N cycles sont débités au lancement, le slot produit `min(cycles écoulés, N)` puis se libère ; logs
inchangés (production continue, D3.1 révisée pour les seules transformations) ; N max planks 24, kits 10 ; N ≤
place libre au lancement ; arrêt d'un slot (cycles terminés crédités, cycle en cours perdu, intrants non commencés
rendus) ; kits à la Sawmill ; idempotence sur lancement et arrêt. Corrige TD-023 (production infinie). Découpage :
- 19.0 — documentation (fait le 11-02) ;
- 19.1 — backend : lot et consommation (`startProductionSlot`, `processBuildingSlots`, collecte et login), traces
  d'idempotence, Security Rules ; vérification des slots de transformation en production — fait le 11-02 (`fcaa47a`, non
  déployé ; aucun slot de transformation en prod) ;
- 19.2 — backend : arrêt d'un slot (`stopProductionSlot`, remboursement limité au plafond) et règle unique des
  états de slot corrompus (`failed-precondition`, journalisés) — fait le 11-02 (`ba8f108`, non déployé ; D-ETAPE19-006) ;
- 19.2b — backend : l'arrêt règle d'abord tous les slots du bâtiment, comme une collecte ; un slot voisin corrompu
  refuse l'arrêt ; validation commune de `buildingId` (lancement, collecte, arrêt ; 128 octets max) — fait le 11-02
  (non déployé ; D-ETAPE19-007) ; conditions 19.5 et extension de TD-021 consignées (D-ETAPE19-008) ;
- 19.3 — client : consolidation TD-015 — fait le 11-02 (`3d17770` tests de caractérisation et ligne
  `InternalsVisibleTo`, `5b13b09` consolidation ; D-ETAPE19-009) : une seule implémentation par primitive de
  parsing, messages d'erreur identiques au caractère près ; 46 tests EditMode verts avant et après fusion ;
  TD-024 (format de clé d'idempotence hors production) et TD-025 (parsing numérique permissif) ouvertes ;
- prochain ticket backend, à ajouter : test d'arrêt avec un slot voisin occupé sans date de début (`startedAt`)
  → `failed-precondition` ; les messages « introuvable » recopient encore l'identifiant reçu (≤ 128 octets),
  correction reportée (D-ETAPE19-007, annotation 19.3) ;
- 19.4 — client : `ProductionScreen` (choix de recette, N, arrêt, recette réelle affichée, risque de saturation
  parallèle affiché). Diagnostic validé le 11-03 (D-ETAPE19-010) : options A (N par 1 / 10 / Max, arrêt confirmé
  sans chiffres puis résumé tiré de la réponse du serveur, panneau de maintenance qui bloque toutes les actions).
  État de slot corrompu (à la connexion, à la collecte ou à l'arrêt) : code `data-loss` à partir de 19.4b, au lieu
  de `failed-precondition` (décision du founder, Q1) ; l'écran affiche « compte en maintenance », pas le texte
  technique (ticket 19.2b du founder). Résultat de l'arrêt : `collected` et `discarded` couvrent tout le bâtiment,
  affichés comme une collecte, et `refundDiscarded` (intrants perdus au plafond) est affiché (D-ETAPE19-007).
  Découpage :
  - 19.4a — outillage émulateur du client — fait le 11-03 (D-ETAPE19-011) : Play sur les émulateurs, aucun appel
    en production pendant les Plays (toute tentative bloquée par le puits ; une lecture de l'uid de production faite
    sans puits avant les Plays a très probablement renouvelé le jeton du compte de production : correction inscrite
    dans D-ETAPE19-011) ; mode d'emploi : briefing Claude Code, « Jouer le client sur les émulateurs » ; correctif
    backend préalable `fa4a88a` (imports modulaires pour l'émulateur Functions, D-ETAPE19-012, non déployé) ;
    nettoyage CS0168 fait ; TD-026 à TD-030 ouvertes ; TD-024 reportée, déclencheur reformulé ;
  - 19.4b — services et modèles, `data-loss` en tête ; 19.4c — interface ; 19.4d — panneau de maintenance ;
  - **Diagnostic 19.4 (Tâche 0, 2026-11-03) — constats pour rédiger 19.4b à 19.4d** (lignes relevées au commit
    `eb3b4d4` ; décisions du founder : D-ETAPE19-010) :
    - a.1 Lancement : le serveur attend `buildingId`, `slotIndex`, `recipeId`, `cycles?`, `idempotencyKey` (UUID
      strict, `validators.ts:125`) ; `cycles` obligatoire (1 à `maxBatchCycles`) pour planks et kits, refusé pour les
      logs même à `null` ; réponse `building`, `inventory`, `alreadyApplied` (`startProductionSlot.ts:46`). Le client
      n'envoie que 3 champs (`FirebaseProductionService.cs:37-42`), recette figée à `"logs"`
      (`ProductionScreen.cs:217`), pas d'`AlreadyApplied` dans `ProductionResult`. Sans clé, tout lancement est refusé
      (`invalid-argument`, constaté au Play 19.4a). **Écart** : après un lancement, l'inventaire renvoyé n'est pas
      recopié dans le store (`ProductionScreen.cs:221` ; la collecte le fait, `:282-283`) : faux pour planks et kits.
      Clé par intention : patron `PendingSales` de `MarketScreen.cs:76`, à reproduire pour le lancement et l'arrêt.
    - a.2 Arrêt : requête `buildingId`, `slotIndex`, `idempotencyKey` ; réponse `collected`, `discarded` (tout le
      bâtiment), `refunded`, `refundDiscarded`, `building`, `inventory`, `alreadyApplied` ; au rejeu, les quatre maps
      sont vides. Côté client : ni méthode, ni modèle, ni bouton.
    - a.3 Collecte : interface inchangée ; un lot se libère à la fin ; un état corrompu est refusé. **Écart** : le
      serveur écrit `discarded[clé]` même à 0 (`shared/production.ts:159`), le client affiche « perdu (cap plein) »
      dès que la map n'est pas vide (`ProductionScreen.cs:360`) — constaté au Play 19.4a : « Récolté : 1 logs — perdu
      (cap plein) : 0 logs ». `collected` peut aussi valoir 0 (inventaire plein, `shared/production.ts:158`), et les
      quatre maps de l'arrêt (`collected`, `discarded`, `refunded`, `refundDiscarded`) aussi : filtrer les entrées à 0
      partout.
    - a.4 État corrompu : aujourd'hui `failed-precondition` + `details.reason = "corrupt-slot"` (`corruptSlotError`,
      `shared/production.ts:29`), à la connexion, à la collecte et à l'arrêt, jamais au lancement. Le SDK Unity 13.1
      n'expose que `FunctionsException.ErrorCode` (pas `details`) ; `failed-precondition` couvre plusieurs autres
      refus ; doctrine C6 : pas de lecture du texte → décision Q1 : `data-loss`. À la connexion, le client ne traite
      pas ce code (`FirebasePlayerService.cs:77`, « Une erreur est survenue »).
    - a.5 Recette réelle : le serveur envoie `recipeId`, `startedAt`, `lastProcessedAt`, `cyclesPlanned`,
      `cyclesProcessed` ; le `SlotSnapshot` client n'a pas les deux compteurs ; l'écran affiche « Logs en cours »
      quelle que soit la recette (`ProductionScreen.cs:176`) ; le client ne connaît aucune durée de recette.
    - a.6 Intrants manquants : refus serveur « Ressources insuffisantes » / « Place insuffisante »
      (`failed-precondition`) ; le client ne vérifie rien ; « Max » calculable pour l'affichage seulement (copie des
      recettes, Q2, TD-027).
    - a.7 Message de limite d'appels : « réessaie dans 2s » (`FirebaseProductionService.cs:125`) alors que la collecte
      impose 6 s (`collectProduction.ts:30`).
    - b. Modèles et services. À modifier : `IProductionService` / `FirebaseProductionService` (lancement avec `int?
      cycles` et clé ; `StopProductionSlotAsync` ; erreurs classées selon l'action, dont `data-loss`) ;
      `ProductionResult` (+ `AlreadyApplied`, par `FirebaseParsingHelpers.GetBool`) ; `SlotSnapshot` + `ParseSlot` (+
      `int? CyclesPlanned`, `int? CyclesProcessed` : distinguer `null` (logs) de 0, `GetLong` ne le fait pas → test
      `GetValue == null` dans `ParseSlot`, sans nouvelle primitive) ; `FirebasePlayerService` (état corrompu à la
      connexion). À créer : `StopProductionResult` (`Services/Production`) ; copie client des recettes pour
      l'affichage (coût, `outputQty`, borne, durée, clé d'inventaire — les ids de recette `reconstruction_kits` ne
      sont pas les clés d'inventaire `reconstructionKits`), commentaire « à modifier avec recipes.ts » (Q2) ; registre
      des intentions en attente (clés) ; tests EditMode des nouveaux parsings. **`ParseResourceMap`** est `private`
      dans `CollectProductionResult.cs:58` : la DÉPLACER dans `ProductionParsingHelpers` (l'arrêt en lit 4 maps), sans
      copie.
    - Options A retenues (détail du rapport de la Tâche 0) : N par boutons 1 / 10 / Max, grisés au-delà de Max =
      min(borne, intrants ÷ coût, place libre ÷ `outputQty`), aperçu (ex. « 10 planks : 20 logs, 4 h 10 ») ;
      avertissement de saturation non bloquant si la production restante des autres slots de la même ressource + N ×
      sortie dépasse la place libre ; arrêt : confirmation sans chiffres (« Le cycle en cours sera perdu. Les intrants
      des cycles non commencés seront rendus dans la limite de la place libre. »), puis résumé du serveur (crédité,
      perdu à saturation, rendu, intrants perdus), lignes à zéro masquées, rejeu → « Arrêt déjà enregistré » ; slot
      actif : recette réelle, « lot 3/10 » estimé (`cyclesProcessed` + cycles écoulés, plafonné à `cyclesPlanned`),
      temps restant rafraîchi ~1 s, « Lot terminé — collecter » (horloge locale, falsifiable : affichage seulement,
      aucune action bloquée ou débloquée selon cette estimation, le serveur tranche ; mettre à jour l'en-tête de
      `ProductionScreen.cs:20`, « aucun calcul temporel local ») ; maintenance : panneau à la place des slots, actions
      bloquées, « Réessayer » relance la connexion, texte fixé par Q5 — ne pas écrire « l'équipe est prévenue » tant
      que TD-021 n'est pas faite.
    - `ProductionScreen` ne relit pas l'état serveur après son premier chargement (`_hasLoadedOnce`,
      `ProductionScreen.cs:74,131`) : préparer les données de test avant le Play (mode d'emploi des émulateurs
      ci-dessus).
  - **Ordre de 19.4b** (consigne du founder à la clôture de 19.4a, citée telle quelle : « passage au code `data-loss`
    en premier (avec le filtre TD-021), puis services et modèles » ; à inscrire au journal à la clôture de 19.4b) :
    (1) d'abord, backend : code `data-loss` pour tout état de slot corrompu (connexion, collecte, arrêt) avec ses
    tests, et TD-021 alignée dans la doc (son filtre d'alerte vise `data-loss`, D-ETAPE19-010 Q1 ; l'alerte elle-même
    reste soumise à son déclencheur, « Rien à implémenter avant le déclencheur ») ; aligner les grilles des relecteurs
    et la convention n° 8 ; (2) puis services et modèles (point b), adaptation minimale de l'écran (logs avec clé).
    19.4c : interface (options A, store mis à jour après un lancement, entrées à 0 filtrées, message 6 s). 19.4d :
    panneau de maintenance (Q5).
- 19.5 — déploiement backend (escalade cas 2), puis Play de bout en bout logs → planks → kits → vente d'un kit.
  Conditions écrites de déploiement (founder, ticket 19.2 ; D-ETAPE19-008) :
  (a) backend et client 19.4 déployés ensemble : le client actuel n'envoie ni N ni la clé d'idempotence ;
  (b) juste avant le déploiement, revérifier en lecture seule l'absence de slots de planks ou de kits, étendue à tous
  les états de slot corrompus (D-ETAPE19-006 : slot occupé sans `startedAt`, logs compris ; compteurs de lot
  invalides ou épuisés) ;
  (c) TD-021 (alertes) en prérequis, comme pour `processWorldEventLifecycle`, puisqu'un état corrompu bloque la
  connexion du compte. TD-021 étendue par décision du founder (ticket 19.2b, D-ETAPE19-008) : « TD-021 couvre
  aussi les erreurs "slot corrompu" (failed-precondition journalisées à la connexion, à la collecte et à
  l'arrêt), prérequis du déploiement 19.5. »

**ÉTAPE 20 — Contrats** :

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
   de déploiement imposé : `updateMarketPrices` corrigée, puis `referencePrices` constaté en prod, et TD-021
   résolue (alerte sur les erreurs des CF planifiées), AVANT `processWorldEventLifecycle`. La garde principale B, la file d'attente bornée, la constante, le contrat `decayEndsAt` et leurs tests
   (activation refusée, file d'attente bornée, durée) sont des critères d'acceptation obligatoires de la sous-étape `processWorldEventLifecycle`.
2. Contrats impériaux : `processWorldEventLifecycle` + alimentation de `contractPool` (backend, tests émulateur),
   puis service client et écran (`acceptContract`, `deliverToContract`).
3. TD-015 : résolue en 19.3 (`5b13b09`).
