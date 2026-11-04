# Briefing pour Claude Code — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle session Claude Code.

## Contexte projet rapide

Guilds & Empires (GAE) — MMORPG économique mobile médiéval-fantasy.
Phase 1 Vertical Slice en cours. Backend Firebase + Cloud Functions v2.
Plateformes de sortie : iOS et Android, priorité immédiate Android ; la chaîne iOS sera mise en place plus tard
(décision du founder, F1, 2026-11-04, D-PLATEFORMES-001) ; préparation seulement, rien créé ni payé :
`docs/architecture/note-chaine-ios.md`.

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
  (diff de l'index, tests, rapport, décisions). Décisions applicables d'une saisine : joindre leur texte, ou leur
  « chemin + ligne » (règle « ID et texte », `CLAUDE.md` §c ; remarque de l'audit de clôture de 19.4c-1). Joindre
  aussi le texte brut de tout arbitrage cité dans le diff d'une sous-étape doc (arbitre, audit de clôture de 19.5-0b,
  2026-11-04, remarque non bloquante). Le founder n'est sollicité que pour **F1** (game
  design et gameplay, règle d'effet indirect), **F2** (direction artistique, textes affichés ; révisé par
  D-REPRISE-012, ci-dessous), **F3** (actions
  irréversibles en production), **F4** (garde-fous, skills, désaccord persistant) ; tout le reste est tranché par
  l'arbitre (`CLAUDE.md` §b, avec la correspondance des 9 anciens cas, qui sert à lire les renvois « cas N »
  historiques). Dernier GO de D-REPRISE-004 = GO de Codex, de l'auditeur **et** de l'arbitre (audit de clôture sur
  `git diff --cached`) sur le même arbre ; l'arbitre peut dire NO-GO seul ; toute modification de l'index après un GO
  → passe courte des deux relecteurs puis nouvel audit de clôture ; après le commit, arbre du commit = arbre audité,
  avant tout push (`CLAUDE.md` §d, skill §6). Contrôle `git status --porcelain` (D-REPRISE-014, décision du
  founder) : sortie brute prise sur l'index préparé, pièce obligatoire de l'audit de clôture, appliquée selon la
  règle unique de l'arbitre citée dans `CLAUDE.md` §c (arbitrage du 2026-11-04 ; pièce absente ou contrôle échoué →
  NO-GO) ; après le commit, avant tout push, sortie vide, à la lettre (`CLAUDE.md` §d, §g ; sinon pas de push,
  arbitre saisi). Résumé d'arbitrages à chaque clôture
  d'étape : `docs/sessions/<date>-etape-N-arbitrages.md` (pièce de l'audit indépendant dans Claude.ai). Une
  modification de l'agent n'est pas toujours rechargée dans la session en cours : vérifier l'empreinte de son prompt
  (`CLAUDE.md` §d) avant de s'appuyer sur son verdict.
- **Sessions (D-REPRISE-011, 2026-11-03)** : la session principale orchestre ; chaque sous-étape est implémentée par
  un sous-agent exécutant neuf ; contenus volumineux par fichier ; une session principale par étape, terminée par la
  relance (D-REPRISE-013, ci-dessous ; `CLAUDE.md` §h) ; rien de durable ne vit seulement dans la conversation ou la
  mémoire de session.
  Contrôle de l'orchestrateur, dès 19.4c : noter `HEAD` avant de lancer l'exécutant, puis vérifier à la reprise de
  main que `HEAD` est inchangé et que `git diff --cached --name-only` est vide (item (g) du lot unique). Relance :
  depuis D-REPRISE-013 (ci-dessous), Claude Code ouvre lui-même la session suivante, sans question au founder
  (D-REPRISE-014) ; le reste de D-REPRISE-011 est inchangé. Relais (D-REPRISE-014, `CLAUDE.md` §h) : écrit dans un
  chemin versionné — dans le briefing, ou sous `docs/sessions/relais-<sous-étape>.md` — jamais sous `.claude/`
  (ignoré par git), et commité avec la sous-étape qui le produit ; ce que les pièces de travail de
  `.claude/instantanes/` (rapport de l'exécutant, pièces de revue) contiennent de durable est versé dans ce commit.
- **Relance de session par Claude Code (D-REPRISE-013, 2026-11-03, F4, décision du founder)** — question, réponse de
  Claude Code approuvée et décision citées au journal ; inscrite dans `CLAUDE.md` §h. À la fin d'une étape, ou sur
  relance décidée par le founder : trois GO, commit du relais, vérification de l'arbre, push, rapport de clôture
  remis au founder, puis ouverture d'une session liée, dans le même dossier `G:\Unity\GuildsAndEmpires` (sans
  worktree : l'Éditeur Unity et les émulateurs sont rattachés à ce dossier), contexte vierge, avec pour seule
  consigne la phrase standard ; lien donné au founder, qui garde la main. Depuis D-REPRISE-014 (décision du founder,
  F4, 2026-11-04 ; citée telle quelle : « Ne me repose plus jamais la question « où lancer ». ») : ouverture sans
  question au founder, à chaque relance ; outil absent, bloqué ou refusé → Claude Code écrit le blocage exact
  (« autorisation demandée », « outil absent : … », ou le texte exact du refus de la plateforme) et ne propose rien
  d'autre (ni carte de proposition, ni ouverture manuelle ; founder : « Ne me propose pas de l'ouvrir à la main. »),
  puis s'arrête (`CLAUDE.md` §h). Précision de Claude Code (resserrement) : la session parente cesse toute action
  sur le dépôt et n'envoie aucun message à la session enfant. Par renvoi, règle F4 du founder (D-REPRISE-013, 2026-11-04),
  inscrite dans `CLAUDE.md` §b, citée telle quelle : « Toute modification de CLAUDE.md ou de la définition d'un agent déclenche le contrôle de la plateforme : c'est attendu, et c'est l'application de F4. Ne jamais le contourner. »
  Filtre de lecture étendu à l'auditeur (et à Codex si c'est possible) : lot unique, item (i) ; condition (d) du
  déploiement de 19.5 : ci-dessous (19.5) ; révisée le 11-04 par D-ETAPE19-016 (décision du founder, F4).
- **Libellés courts et vouvoiement (D-REPRISE-012, 2026-11-03, F4, décision du founder)**, citée telle quelle : « Les libellés courts (boutons, noms d'états, formats de durée et de quantité) sont délégués à l'arbitre, à condition d'être listés dans le résumé d'étape. Les phrases (avertissements, confirmations, résumés, messages d'erreur, textes de maintenance) restent F2. Le vouvoiement est la règle pour tous les textes affichés au joueur. »
  Inscrite dans `CLAUDE.md` §b et §f. Précisions de Claude Code : un libellé court décidé par l'arbitre entre au
  journal (attribué à « arbitre ») et au résumé d'arbitrages d'étape ; au doute entre libellé court et phrase → F2 ;
  corps de l'arbitre non encore aligné : lot unique, item (h) ; d'ici là, toute saisine de l'arbitre sur un libellé
  court cite D-REPRISE-012.
- **Push (D-REPRISE-009, 2026-11-03)** : push normal sur la branche de travail (branche courante de la sous-étape,
  jamais `main`) autorisé après les trois GO et la vérification de l'arbre ; restent en F3 : merge vers `main`,
  force-push ou réécriture d'historique, suppression de branche distante (`CLAUDE.md` §g).
- Runtime CF : **Node 22**, déployé le 11-01 (TD-013 résolue).
- `claimDailyBonus` retiré du code (D-REPRISE-001/002).
- Tests : **366/366** verts le 11-03 après l'ÉTAPE 19.4b (365 après 19.4a, dont 18 du script de données de test ; 347 après 19.2b ; 318 après 19.2 ; 260 après 19.1 ; 222 au 11-01, dont 13 du seed marché TD-018).
- Tests client : **170/170** EditMode verts le 11-04 après 19.4d (46 de caractérisation du parsing, ÉTAPE 19.3 ; 9
  de la garde du mode émulateur, ÉTAPE 19.4a ; 18 des parsings et utilitaires de production, ÉTAPE 19.4b ; 43 du
  panneau de lancement, du registre et du store, ÉTAPE 19.4c-1 ; 30 de l'estimation du slot actif, des résumés et de
  l'arrêt, ÉTAPE 19.4c-2 ; 24 de l'état de maintenance et de la décision de chargement, ÉTAPE 19.4d ;
  `Assets/_Project/Tests/Editor/`) : `unity test . --mode EditMode --output <rapport.xml>`, Éditeur fermé (mode batch),
  ou `unity command test.run --mode EditMode` dans l'Éditeur ouvert.
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
- Pont en `PIPELINE_LOAD_PENDING` : donner le focus par PowerShell (`(New-Object -ComObject WScript.Shell).AppActivate(<pid>)`).
  Tests EditMode dans l'Éditeur ouvert : `unity command test.run --mode EditMode`. Constat 19.4b : l'Éditeur peut se
  fermer pendant le rechargement de domaine d'un Play ; relance `G:/Unity/6000.2.2f1/Editor/Unity.exe -projectPath
  G:/Unity/GuildsAndEmpires` ; si la boîte « Recovering Scene Backups » bloque, copier `Temp/__Backupscenes` hors du
  dépôt, le retirer, relancer. Fermeture propre : `editor.invoke_menu --path "File/Exit"` (scène non modifiée).
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
   `firebase emulators:start --only functions,firestore,auth --project demo-guilds-empires`. Un `build` fait pendant
   que l'émulateur tourne peut le laisser en échec (« Failed to load function », écran bloqué sur « Chargement… ») :
   le redémarrer (constat 19.4b). Ils tournent sous
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
nouveau test de réception. » Une seule retouche de `.claude/agents/arbitre-strategique.md` (et, pour (d), de
`CLAUDE.md` §b et §f), revue croisée, puis un seul test de réception (4 cas, instantanés, empreinte vérifiée),
modification d'un garde-fou → F4. Contenu du lot :
- (a) contrôle du diff contre le dépôt limité aux lignes ajoutées : vérifier aussi que les lignes retirées sont
  absentes, et exiger avant l'audit de clôture que `git diff --name-only -- <FICHIERS>` soit vide, ou joindre ce diff
  non indexé (auditeur, revue du diff de D-REPRISE-007) ;
- (b) F3 du corps : « push, merge sur `main`, suppression de branche, réécriture d'historique non autorisés par le
  ticket » à aligner sur `CLAUDE.md` §b-§g et D-REPRISE-009 (remarque non bloquante de l'arbitre, audits de clôture
  du commit `8cd670c`, rapportée au founder). D'ici là, chaque saisine d'audit de clôture rappelle « push normal
  autorisé (D-REPRISE-009) » ;
- (c) une fois (a) et (b) appliqués et le test de réception réussi : retirer ce rappel de la consigne d'audit de
  clôture (`CLAUDE.md` §g, D-REPRISE-009) ;
- (d) règle des garde-fous resserrés — décision du founder (2026-11-03, D-REPRISE-010), citée telle quelle :
  « Règle : un garde-fou peut être **resserré** par les agents, à condition d'être listé dans le résumé d'étape,
  rubrique « garde-fous resserrés », pour validation a posteriori par le founder. Un garde-fou **assoupli** reste F4,
  avant toute application. » Décidée par le founder au journal : s'applique avec le lot sans nouvelle escalade
  (`CLAUDE.md` §b) ; d'ici là, `CLAUDE.md` §b reste la règle (modification d'un garde-fou → F4). Touche aussi
  `CLAUDE.md` §b (garde-fous) et §f (résumé d'arbitrages d'étape, rubrique « garde-fous resserrés »), en plus du corps
  de l'arbitre. Portée du test de réception pour (d) : à fixer au ticket du lot.
- (e) points à reprendre au ticket du lot (remarques de l'arbitre, audit de clôture de D-REPRISE-010) : titre de
  D-REPRISE-009 à préciser « (4 précisions, voir D-REPRISE-010) » ; le test de réception du lot ne peut qu'ajouter un
  cas pour (d), jamais retirer ni affaiblir les 4 cas ; en-tête du lot « modification d'un garde-fou → F4 » à nuancer
  « sauf règle déjà décidée par le founder au journal » ;
- (f) proposition de l'arbitre (D-REPRISE-011) : mode unique « toujours par fichier » pour l'auditeur, quelle que
  soit la taille, et extension du filtre de lecture à l'auditeur (TD-032) — resserrements au-delà de la décision du
  founder : règle (d) une fois appliquée, sinon F4. Annotation (D-REPRISE-013) : l'extension du filtre de lecture à
  l'auditeur relève désormais de l'item (i) (décision du founder) ; seul le mode « toujours par fichier » reste
  soumis à la règle (d) de D-REPRISE-010 une fois appliquée, sinon à F4.
- (g) points à reprendre au ticket du lot (remarques des relecteurs et de l'arbitre sur D-REPRISE-011) : ajouter §h
  et D-REPRISE-011 à la liste des garde-fous de `CLAUDE.md` §b ; skill `revue-croisee` §3 : écrire la règle
  d'invalidation (contrôle de lecture de l'auditeur en échec → verdict invalidé, relance dans un contexte neuf, comme
  pour l'arbitre) et nommer « ce dossier » (`.claude/instantanes/executant/`) dans la puce du contrôle de Codex ;
  `CLAUDE.md` §h, exécutant : préciser que « le même » exécutant n'est repris que dans la même sous-étape ; si (f)
  est retenu, aligner aussi `.claude/agents/auditeur.md` l. 13 (« joint à ta consigne »). Remarques de l'arbitre à
  la clôture de `ac61717` : skill `revue-croisee` §3, écrire l'étape de nettoyage de `.claude/instantanes/revue/`
  avant chaque dépôt (commande explicite, à traiter de la même façon pour `cloture/`) ; `CLAUDE.md` §h, contrôle de
  l'orchestrateur : noter `HEAD` (`git rev-parse HEAD`) avant de lancer l'exécutant puis, à la reprise de main,
  vérifier que `HEAD` est inchangé et que `git diff --cached --name-only` est vide avant de préparer l'index ; ce
  contrôle est une pratique de l'orchestrateur, appliquée dès 19.4c sans attendre le lot.
- (h) aligner le corps de l'arbitre (`.claude/agents/arbitre-strategique.md`, définition de F2) sur D-REPRISE-012
  (libellés courts délégués à l'arbitre, listés au résumé d'étape ; phrases restant F2 ; vouvoiement). Précision de
  Claude Code : décision du founder au journal, appliquée avec le lot sans nouvelle escalade (`CLAUDE.md` §b), au
  doute → F4 ; d'ici là, toute saisine de l'arbitre sur un libellé court cite D-REPRISE-012.
- (i) filtre de lecture étendu — décision du founder (2026-11-03, message de clôture de 19.4c-1, point 1 ;
  D-REPRISE-013), citée telle quelle : « 1. Lot de retouches : étendre le filtre de lecture de TD-031 à l'auditeur (et à Codex si c'est possible), suite à l'incident de 19.4c-1 où un auditeur a lu les fichiers de l'exécutant. Le filtre ne doit plus reposer seulement sur la consigne. »
  Décidée par le founder au journal : s'applique avec le lot sans nouvelle escalade (`CLAUDE.md` §b). Touche le
  filtre du projet (`.claude/settings.json`, `.claude/hooks/`), aujourd'hui appliqué à l'arbitre seul (TD-031) ;
  aucune modification du filtre avant le lot. Précision de Claude Code : pour Codex (« si c'est possible »), le lot
  vérifie si un filtre peut s'appliquer à un processus lancé hors Claude Code et le dit ; la conclusion, surtout en
  cas d'impossibilité, est rapportée au founder au résumé d'arbitrages d'étape. Résolution de TD-032.
- (j) `CLAUDE.md` §h, puce « Relance (D-REPRISE-013) » : « (19.4c-2) » y est inscrit en dur comme exemple de
  relance en milieu d'étape ; à remplacer par un exemple daté ou à retirer (modification d'un garde-fou → F4, avec
  le lot ; remarque des relecteurs, sous-étape doc D-REPRISE-013).
- (k) corps de l'arbitre (`.claude/agents/arbitre-strategique.md`) : contrôle `git status --porcelain` à l'audit de
  clôture, le corps reprenant la règle unique de l'arbitre citée dans `CLAUDE.md` §c (arbitrage du 2026-11-04, une
  seule formulation ; remarque 2 de l'arbitre) — décision du founder (2026-11-04, D-REPRISE-014), citée telle quelle :
  « Ajoute à l'audit de clôture de l'arbitre et à la vérification avant push un contrôle obligatoire : `git status --porcelain` doit être vide, en dehors des dossiers ignorés. Sinon, NO-GO. »
  Précision de Claude Code : décision du founder au journal, appliquée avec le lot sans nouvelle escalade
  (`CLAUDE.md` §b), au doute → F4 ; report (d) de D-REPRISE-014 : corps de l'arbitre non modifié en 19.5-0b ; le
  contrôle est écrit dans `CLAUDE.md` §c et rappelé dans chaque saisine d'audit de clôture jusqu'au lot, par la
  citation de la règle unique (`CLAUDE.md` §g), comme le rappel du push ; ce rappel est retiré quand le lot est
  appliqué.

Fait : l'identification par Claude Code des « 4 précisions ajoutées au cas 3 » (les 4 premières puces de
`CLAUDE.md` §g) a été confirmée par le founder le 2026-11-03 (D-REPRISE-010) ; plus rien à reporter au résumé
d'arbitrages d'étape sur ce point.

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
- test d'arrêt avec un slot voisin occupé sans date de début (`startedAt`) : fait en 19.4b (code `data-loss`,
  D-ETAPE19-010 Q1) ; prochain ticket backend, à ajouter : les messages « introuvable » recopient encore
  l'identifiant reçu (≤ 128 octets), correction reportée (D-ETAPE19-007, annotation 19.3) ; défaut reporté de 19.4a,
  côté script de données de test (backend) : cast manquant avant `hasOwnProperty` dans `runEmulatorTestData` ;
  prochain ticket qui touche l'outillage émulateur du client (C#, `FirebaseEmulatorMode.cs`), défaut reporté de 19.4a :
  `ClearEmulatorEnvironment` retire un `no_proxy` du poste s'il vaut exactement la boucle locale ;
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
  - 19.4b — fait le 11-03 (D-ETAPE19-013) : commit A `85cb1e8` (backend `data-loss` pour tout état de slot
    corrompu, grille de l'auditeur alignée, TD-021 et spécification annotées) ; commit B (client : lancement avec N
    et clé d'idempotence, `StopProductionSlotAsync`, `AlreadyApplied`, compteurs de lot, `DataLoss` → texte Q5,
    copie des recettes pour l'affichage, registre `PendingIntentKeys`, logs lancés avec clé ; 73 tests EditMode) ;
    Play sur émulateurs : lancement réussi, `data-loss` à la collecte et à la connexion → texte Q5 ;
  - 19.4c — interface, découpée en deux sous-étapes (D-ETAPE19-014) ; clause STOP des tickets sur les textes
    (précision de Claude Code) : la réponse F2 du founder citée dans D-ETAPE19-014, et D-REPRISE-012 :
    - 19.4c-1 — **fait le 11-03** (D-ETAPE19-014 ; TD-033 ouverte ; clôture vue par le founder, D-ETAPE19-014).
      Report : la vente a le même défaut d'annulation que
      la production avant 19.4c-1 (`FirebaseMarketService.cs:121`, `ThrowIfCancellationRequested` après `CallAsync` ;
      écriture dans le store, `MarketScreen.cs:311`, jamais atteinte après annulation), à traiter au prochain ticket
      qui touche le marché ; au même ticket, numéroter les ventes comme les réponses de production (depuis 19.4c-1, le
      store sérialise le chargement, le lancement et la collecte — un seul appel à la fois, quel que soit l'écran — et
      n'applique une réponse que si son numéro d'envoi dépasse le dernier appliqué ; une réponse de production arrivée après une vente peut encore rétablir un inventaire antérieur
      à cette vente, jusqu'à la réponse suivante ; les ventes ne sont pas non plus sérialisées avec les appels de
      production ; même défaut de fraîcheur que TD-034, à résoudre avec elle). Au même ticket (report de 19.4d,
      arbitrage de l'arbitre du 2026-11-04, D-ETAPE19-015) : TD-035 (maintenance non lue par `MarketScreen` : ventes
      possibles jusqu'au retour à l'écran de production ; F1 et F2 du founder avant toute résolution), et remarque de
      l'arbitrage, citée telle qu'au ticket de 19.4d : « `MarketScreen` ne passe pas par `TryBeginServerCall` : une
      vente peut partir pendant une collecte, et sa réponse (`ApplyServerState`, non numérotée,
      `PlayerEconomyStateStore.cs:93-100`) s'écrit sans le filet de numéro […] à rapprocher de TD-034 ».
      Contenu — lancement : choix de recette, N par 1 / 10 / Max, aperçu, avertissement de saturation, store mis à
      jour après un lancement (bâtiment et inventaire), recette réelle affichée sur un slot actif, reports de 19.4b
      sur le registre `PendingIntentKeys` (clé ancrée sur le store, purge, en-tête) et les recettes (test
      d'immuabilité) ; règle de « Lancer » et précisions 1a-1f de l'arbitrage du 11-03 (D-ETAPE19-014) ; textes 1 à
      6 validés par le founder (D-ETAPE19-014, version finale). 19.4c-1 ne touche pas le message de limite d'appels
      (« Trop d'actions récentes, réessaie dans 2s. ») : son délai réel par action et son vouvoiement passent
      ensemble au prochain lot de textes F2 (ci-dessous) ;
    - 19.4c-2 — **fait le 11-04** (D-ETAPE19-014, « Fait » ; arbitrage de l'arbitre du 2026-11-04 sur « 1 min
      restante ») : estimation du slot actif dans une classe pure `ProductionSlotProgress` (référence = `lastProcessedAt`,
      sinon `startedAt`, comme le serveur ; compteurs incohérents → pas d'estimation, parsing inchangé), tick ~1 s,
      bouton « Arrêter » et confirmation, résumés de collecte et d'arrêt (zéros filtrés, ordre fixe, « stock plein »,
      une ligne par catégorie), reports 1 et 2 du relais de 19.4c-1 faits, « Erreur inattendue, consulte la console. »
      en une constante ; 146/146 tests EditMode ; Play sur émulateurs, puits actif. Contenu prévu, pour mémoire :
      slot actif (lot « k/N » estimé, temps restant rafraîchi ~1 s, « Lot terminé — collecter »,
      contraintes D-ETAPE19-013), arrêt (bouton, confirmation sans chiffres, résumé du serveur, rejeu), entrées à 0
      filtrées partout (collecte et arrêt), « stock plein » (texte 8), traitement de `ParseOptionalInt` avant
      l'affichage « lot k/N ». Textes validés par le founder (D-ETAPE19-014) : 7. « Arrêter » ; 8. « Récolté : … »,
      « Perdu (stock plein) : … », « Rendu : … », « Intrants perdus (stock plein) : … », « cap plein » → « stock
      plein » aussi dans le texte de collecte existant ; 9. « 4 h 10 restantes », « 25 min restantes », « < 1 min » ;
      noms de ressources invariables. Réponse du founder sur le texte 8, citée telle quelle : « Texte 8 : « cap plein » devient « stock plein » partout, y compris dans le texte de collecte existant. Majuscule harmonisée : « Perdu (stock plein) : … », « Rendu : … », « Intrants perdus (stock plein) : … ». »
      Précision de Claude Code : la forme de la ligne de collecte existante (aujourd'hui « Récolté : … — perdu (cap
      plein) : … », sur une ligne avec un tiret, `Assets/_Project/Scripts/UI/Screens/ProductionScreen.cs` vers la
      l. 384) se tranche au ticket de 19.4c-2, en partant de ce texte ; toute forme qui va au-delà de la consigne
      du founder (« stock plein », majuscule harmonisée) part en F2 (D-REPRISE-012 range les résumés parmi les
      phrases). Reports de 19.4c-1 (relais : audit de clôture de l'arbitre et passes courtes de l'auditeur, remarques
      non bloquantes) : (1) `ProductionLaunchPlanner.RemainingOutputOfOtherSlots`, en-tête à compléter —
      `cyclesProcessed` = dernier règlement serveur ; restant surestimé entre deux appels, avertissement
      conservateur — **fait en 19.4c-2** ; (2) lancement et collecte : `catch (OperationCanceledException) { }` — une
      annulation levée par le SDK (jeton intact) reste muette ; aligner sur `LoadAsync` (19.4c-1 v4) — **fait en
      19.4c-2**. Pour mémoire, sans action (relais de l'audit de clôture de 19.4c-2, point 3) : `RefreshStopConfirm`
      rappelle `RenderSlots()` sur une notification déjà rendue (double rendu cosmétique) ; la clé d'arrêt est créée
      avant `TryBeginServerCall` (sans effet) ; `FormatRemaining` renvoie « Lot terminé — collecter » pour minutes < 0,
      chemin non affiché par l'écran (commentaire à préciser si l'on y touche) ;
  - 19.4d — **fait le 11-04** (D-ETAPE19-015 ; D-ETAPE19-010 Q5 mise en œuvre ; arbitrage de l'arbitre du
    2026-11-04 « Marché et maintenance » ; TD-035 ouverte) : un `data-loss` (connexion, collecte, arrêt ; lancement :
    même traitement) pose l'état de maintenance dans le store (filtre de numéro d'envoi, écrit avant tout contrôle
    d'annulation, store non amorcé admis) ; seule une connexion réussie le lève ; écran de production : panneau
    (texte Q5, « Réessayer ») à la place des slots, toutes les actions bloquées, « Marché » compris en maintenance
    seulement, ligne d'état vidée, aucun appel sans action du joueur (`ProductionLoadDecision`) ; « Réessayer »
    relance la connexion (appel sérialisé) ; `DebugScreenController` aligné (texte Q5 sans « Erreur : », C9 dans
    chaque `catch`) ; 170/170 tests EditMode (24 nouveaux) ; Play sur émulateurs, puits actif : panneau au
    chargement, réessai encore corrompu puis réparé (purge et re-seed), `data-loss` à la collecte et à l'arrêt,
    séquence Collecter → Marché pendant l'appel → `data-loss` → retour → panneau sans nouvel appel obtenue. Fin des
    sous-étapes de 19.4 ; commit `8d8782a`, poussé.
    Relais de 19.4d (audit de clôture de l'arbitre, GO, et revues, remarques non bloquantes ; versé en 19.5-0) :
    (1) pour mémoire, sans action : en maintenance, sur un écran recréé, le titre revient au texte par défaut de
    l'UXML « Sawmill » au lieu de « sawmill lv1 » (`RenderSlots` sort avant d'écrire `_titleLabel`,
    `ProductionScreen.cs` l. ~361-368) ; texte existant, pas F2 ; à corriger au premier ticket qui retouche
    l'en-tête de `ProductionScreen` (remarque 1 de l'audit) ; (2) `Assets/_Project/Tests/Editor/
    ProductionMaintenanceTests.cs`, test `Ecran_RetourDuMarcheAvantLaReponse_DataLoss_EntreeEnMaintenance_LigneVidee` :
    le commentaire nomme un relecteur (« Relecture du diff (Codex) ») ; un commentaire de test décrit le cas, pas sa
    provenance — à reprendre au prochain passage sur ce fichier (remarque 2 de l'audit ; non modifié en 19.5-0) ;
    (3) pratique : voir « Coût de coordination » ci-dessous ; (4) la correction faite après la revue du diff de 19.4d
    (ligne d'état vidée à l'entrée en maintenance) n'a pas été rejouée en Play ; couverte par les tests EditMode ; la
    Play de bout en bout de 19.5 la couvrira si un `data-loss` y est provoqué (remarque 4 de l'audit) ; (5) coût de
    coordination : ci-dessous ; (6) remarques non bloquantes des revues de 19.4d non appliquées, consignées au rapport
    de clôture (risques résiduels) : classe `status--error` sur une ligne d'état vide ; erreur non `data-loss` d'un
    « Réessayer » lancé par un écran précédent non réaffichée ; `data-loss` écarté hors séquence → rien dans l'UI ;
    câblage de `OnStoreChanged` (décision lue avant le rendu) non couvert par un test d'écran ; (7) 19.5 : voir
    ci-dessous (conditions à vérifier avant toute question au founder) ;
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
      aucune action bloquée ou débloquée selon cette estimation, le serveur tranche ; en-tête de
      `ProductionScreen.cs:20`, cité mot pour mot : « Aucun calcul économique/temporel local — état brut depuis la CF.
      Doctrine server-auth. », annoté en 19.4b après arbitrage (D-ETAPE19-013) : l'interdit « économique » reste
      entier, « temporel » admet l'estimation d'affichage) ; maintenance : panneau à la place des slots, actions
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
    19.4c (découpée en 19.4c-1 / 19.4c-2, ci-dessus) : interface (options A, store mis à jour après un lancement,
    entrées à 0 filtrées ; message 6 s retiré de 19.4c, au prochain lot de textes F2 avec le vouvoiement,
    D-ETAPE19-014) ;
    contraintes de l'arbitrage du 11-03 (D-ETAPE19-013) : estimation recalculée à chaque tick depuis le
    `SlotSnapshot` du store, jamais un compteur local ; aucune valeur estimée dans une requête ni dans le store ;
    tick arrêté en `OnDisable` ; pas d'allocation de chaîne par tick ; après toute réponse serveur, l'affichage
    repart de la réponse ; écoulé ancré sur l'instant de réception (`Time.realtimeSinceStartup`) ; risque « Lot
    terminé » affiché trop tôt (horloge en avance) aux risques résiduels. Reports de 19.4b (D-REPRISE-011) : clé
    anti-doublon ancrée sur une référence qui survit à l'écran (store), pas `_currentBuilding`, pour qu'un écran
    rouvert réutilise la clé d'un réessai ; purge des intentions périmées du registre `PendingIntentKeys` ; test
    EditMode de l'immuabilité de `RecipeInfo.InputsPerCycle` et `ProductionRecipes.All` ; en-tête de
    `PendingIntentKeys` à préciser (la réutilisation dépend de la référence passée par l'appelant) ;
    `ParseOptionalInt` : un compteur présent mais non numérique donne 0, à traiter avant l'affichage « lot k/N »
    (changer le comportement numérique du parsing relève de TD-025 et D-ETAPE19-009 → décision du founder).
    19.4d : panneau de maintenance (Q5), dont le blocage de toutes les actions après un `data-loss` (en 19.4b, les
    boutons restent actifs) ; `DebugScreenController` affiche « Erreur : » + texte Q5 (aligner ou retirer). Report de
    19.4c-1 (auditeur) : depuis que `FirebasePlayerService` rend une réponse reçue malgré l'annulation, un échec de
    parsing après annulation atteint le `catch` de `DebugScreenController` (l. ~80-83), qui écrit dans l'UI d'un écran
    désactivé : appliquer C9 (aucune écriture d'UI après annulation) dans ce `catch`. [Fait en 19.4d,
    D-ETAPE19-015.]
  - **À soumettre au founder au résumé d'arbitrages de l'ÉTAPE 19** (garde-fous, F4) — signal skill proposé par l'arbitre
    (19.4c-1, trois bloquants successifs de Codex sur l'ordre puis la fraîcheur des réponses) : la doctrine C7 ne dit
    rien de l'ordre ni de la version des réponses ; proposition d'y ajouter « le serveur sert une version monotone de
    l'état dans chaque réponse ; le store n'applique qu'une version strictement supérieure » (F4, doctrine ; TD-034).
    Garde demandée par le founder le 2026-11-03 (D-REPRISE-011) : modification de `.claude/agents/auditeur.md`
    (grille 5, `data-loss`, décidée par D-ETAPE19-010 Q1) ; proposition d'ajouter à la
    doctrine C6 (`docs/skills/unity-mobile-gameplay-engineer/SKILL.md`) une ligne `DataLoss` → maintenance et de
    mettre à jour C5 (`startProductionSlot` et `stopProductionSlot` ont une clé d'idempotence, D-ETAPE19-003) :
    non modifiées. Pour information (fondement distinct : arbitrage du 2026-11-03 appliquant la phrase du founder
    « Les diffs et sorties volumineuses sont transmis par fichier, jamais recopiés dans le contexte principal ») :
    modification du skill `revue-croisee` §3 — un contenu volumineux est désigné à l'auditeur par chemin et sha1
    (copie dans `.claude/instantanes/revue/`, lecture complète contrôlée) au lieu d'être collé ; contestable par le
    founder. Écarts de procédure de la sous-étape D-REPRISE-011, à signaler : deux contenus qui tenaient en un seul
    `Read` ont été désignés par fichier, et la consigne commune a une fois dit « désigné » au lieu de « joint » ;
    le skill §3 aligné ajoute aussi un contrôle du journal de Codex (garde-fou resserré). Pour information, garde-fou
    resserré (pratique de l'orchestrateur, remarque de l'arbitre à la clôture de `ac61717`) : contrôle de `HEAD` et de
    l'index à la reprise de main après l'exécutant. Libellés courts décidés par l'arbitre (D-REPRISE-012, condition
    posée par le founder : « à condition d'être listés dans le résumé d'étape ») : les lister au résumé ; forme
    (précision de Claude Code) : texte et endroit ; pour information (précision de Claude Code), y joindre les textes
    jugés couverts sans question par l'arbitre le 11-03, avant D-REPRISE-012 (D-ETAPE19-014, question 2).
    Proposition de Claude Code (F4) : une ligne « vouvoiement » dans les grilles des relecteurs et de l'arbitre
    (`AGENTS.md`, `.claude/agents/*.md`), non modifiées. Discordance à signaler (précision de Claude Code ; F4,
    doctrine) : la table de la doctrine C6
    (`docs/skills/unity-mobile-gameplay-engineer/SKILL.md`) donne des textes d'exemple au tutoiement (ex. « Une
    erreur est survenue, réessaie. »), contraires à la règle de vouvoiement de D-REPRISE-012 ; skill non modifié.
    Écarts de procédure de la sous-étape D-REPRISE-013, à signaler (journal, D-REPRISE-013) : (1) la question au
    founder qui a précédé son autorisation du 2026-11-04 (texte C) a été formulée par Claude Code directement, sans
    passer par l'arbitre, alors que l'arbitre était disponible (écart à `CLAUDE.md` §b et §c) ; (2) `CLAUDE.md` écrit
    par l'orchestrateur au lieu de l'exécutant, et avant le GO du ticket (ordre §a.2 → §a.3 inversé) — écart de
    procédure, avec pour justification le texte C du founder (2026-11-04) ; (3) ajouts de Claude Code hors texte C,
    que le founder peut contester : renvois D-REPRISE-013 (simples renvois) à l'en-tête « Mode autonome supervisé
    (…) » et au titre de §b ; préfixe d'attribution de la phrase F4, « Règle du founder (D-REPRISE-013, 2026-11-04),
    citée telle quelle : ». Le renvoi D-REPRISE-013 ajouté un temps au titre de §h a été retiré après la revue du diff
    (bloquant de Codex : contraire à la phrase du texte C « Écris dans §h le texte prêt (rapport-doc013.md), sans rien
    y ajouter. ») ; le titre de §h est revenu à « ### h. Sessions : orchestrateur et exécutant (D-REPRISE-011) » ;
    la réponse de Claude Code (décision A) est citée de la transcription de la session, non versionnée : le founder
    peut contrôler la citation. Pour information : la conclusion du lot unique sur le filtre de lecture de Codex
    (item (i)), surtout en cas d'impossibilité, est rapportée ici.
  - **À soumettre au founder au résumé d'arbitrages de l'ÉTAPE 19 — F2 en attente** (classement de Claude Code) :
    mise en page du panneau de lancement de 19.4c-1 — le panneau comprime la liste des slots (Game view) (remarque de
    l'audit de clôture de 19.4c-1). Précision de Claude Code : à juger sur le rendu sur appareil, lié à la condition
    (d) du déploiement de 19.5 (lisibilité des écrans sur petit format). [Annotation (19.5-0, D-ETAPE19-016) :
    condition (d) révisée ; ce point se juge d'abord en 19.5b (simulateur d'appareils de Unity, petit écran Android
    et iPhone à encoche ; tout changement de mise en page de direction artistique → F2, dans la demande regroupée),
    puis sur le rendu sur un vrai appareil, exigé avant tout testeur externe (TD-036).] Aussi (relais de 19.4c-2,
    point 1) : arrêt
    dont toutes les catégories sont vides (slot de logs sans cycle fini) — texte d'état vidé, aucun retour écrit
    (point (6) du prochain lot de textes, ci-dessous).
  - **Pour le résumé d'arbitrages de l'ÉTAPE 19, 19.4d** — risque résiduel inscrit mot pour mot (arbitrage de l'arbitre
    du 2026-11-04, (2d), D-ETAPE19-015 ; le founder le voit) : « Un `data-loss` reçu pendant que le marché est ouvert
    laisse les ventes possibles jusqu'au retour à l'écran de production. Le serveur reste l'autorité : `sellToMarket`
    ne lit pas les slots, la vente est légitime et n'a aucun effet sur l'état corrompu. Fenêtre : un appui sur
    « Marché » pendant un appel de production, et ce même appel revenu `data-loss`. » TD-035 (décision possible du
    founder au résumé : F1, maintenance étendue au marché ; F2, la phrase affichée). Libellé « Réessayer » : nommé par
    le founder dans Q5 (D-ETAPE19-010), pas un libellé décidé par l'arbitre.
  - **Incident de procédure de 19.4c-2, à signaler au résumé d'arbitrages de l'ÉTAPE 19** (relais de l'audit de
    clôture, point 6) : le shell de l'orchestrateur restait dans `.revue-croisee/` ou `.claude/instantanes/cloture/`
    après un `cd` ; un arbitrage a été lancé depuis `.revue-croisee/` (écarté, relancé depuis la racine). Pratique :
    toujours `cd G:/Unity/GuildsAndEmpires` avant de lancer un agent.
  - **Coût de coordination, pour le résumé d'arbitrages de l'ÉTAPE 19** (`CLAUDE.md` §f) — 19.4c-1 (relais) : ticket
    7 versions (Codex 6 passes, auditeur 6 passes), arbitre 2 arbitrages ; diff 4 versions (Codex 4 passes, auditeur
    5 passes dont 1 écartée), arbitre 1 arbitrage + 1 clôture ; nombres de NO-GO et d'escalades : donnée absente du
    relais. Sous-étape doc D-REPRISE-012 (relais) : ticket 2 versions, diff 3 passes par relecteur, 1 clôture ;
    passes du ticket par relecteur, NO-GO et escalades : donnée absente du relais. Sous-étape doc D-REPRISE-013
    (données de l'orchestrateur à la préparation de l'index) : mode ticket, 6 passes de Codex et 6 de l'auditeur (v1
    à v6), aucun NO-GO de l'arbitre, une question au founder (posée sans l'arbitre ; réponse : texte C) ; limite :
    les passes du mode diff et l'audit de clôture ne sont pas comptés, faute d'être connus à la préparation de
    l'index. 19.4c-2 (données de l'orchestrateur à la préparation de l'index) : ticket 4 versions (Codex 4 passes,
    auditeur 4 passes, un « GO APRÈS CORRECTION » de l'auditeur en v1, aucun NO-GO), arbitre 1 arbitrage (« 1 min
    restante ») plus 1 écarté (lancé depuis `.revue-croisee/`, lectures refusées par son filtre, relancé depuis la
    racine : incident à consigner, TD-031 ; « signal skill » s'il se répète) ; aucune escalade ; même limite pour le
    mode diff et l'audit de clôture. Complément 19.4c-2 (relais de l'audit de clôture, point 5) : diff 1 version
    (Codex 1 passe GO, auditeur 1 passe GO), audit de clôture 1 (GO), aucun NO-GO, aucune escalade. 19.4d (données
    de l'orchestrateur à la préparation de l'index) : ticket 4 versions (Codex 4 passes, auditeur 4 passes ; GO APRÈS
    CORRECTION des deux en v1, de l'auditeur en v2), arbitre 1 arbitrage (NO-GO sur v2, option 2) ; aucune
    escalade ; même limite que 19.4c-2 : les passes du mode diff et l'audit de clôture ne sont pas comptés, faute
    d'être connus à la préparation de l'index. Complément 19.4d (relais de l'audit de clôture, point 5) : diff 2
    versions (revue initiale puis 1 passe courte après correction de remarques non bloquantes ; Codex 2 passes GO,
    auditeur 2 passes GO), audit de clôture 1 (GO), aucun NO-GO en mode diff, aucune escalade ; mode ticket (au
    commit) : 4 versions, 1 arbitrage (NO-GO sur v2, option 2). Pratique (relais de 19.4d, point 3, remarque 3 de
    l'audit) : les comptes de passes du coût de coordination versés au briefing dans le diff audité ne sont pas une
    contamination de l'audit de clôture.
  - **Pour le résumé d'arbitrages de l'ÉTAPE 19, 19.4c-2** — libellé court décidé par l'arbitre (D-REPRISE-012,
    condition du founder : « à condition d'être listés dans le résumé d'étape ») : « 1 min restante » (texte), temps
    restant d'un slot actif de planks ou de kits, écran de production (`PlayerMessages.RemainingOneMinute`) (endroit).
    Changements visibles de la collecte (application de la réponse F2 du founder, texte 8, et de Q4) : noms de
    ressource invariables (« kits » au lieu de la clé `reconstructionKits`), lignes à zéro masquées, une ligne par
    catégorie (« Récolté : … », « Perdu (stock plein) : … ») au lieu de « Récolté : … — perdu (cap plein) : … ».
  - **Pour le résumé d'arbitrages de l'ÉTAPE 19, 19.5-0b (D-REPRISE-014)** — **signal skill** (`CLAUDE.md` §f :
    « même type d'erreur relevé deux fois ») : fichiers de relais non versionnés, deuxième occurrence
    (`relais-195.md`, puis `relais-195a.md`) ; décision du founder, citée telle quelle : « Note-le comme « signal skill » pour le résumé de l'étape 19. »
    Limite du contrôle (remarque 1 de l'arbitre, arbitrage du 2026-11-04 ; résumé fidèle) : le contrôle
    `git status --porcelain` n'aurait détecté ni `relais-195.md` ni `relais-195a.md` (sous `.claude/instantanes/`,
    ignoré) ; c'est la règle « Relais » de `CLAUDE.md` §h (chemin versionné) qui couvre l'incident. Arbitrage de
    l'arbitre (2026-11-04, bloquant de Codex en revue du diff de 19.5-0b ; journal, D-REPRISE-014), **contestable
    par le founder** : application du contrôle avant le commit par une règle unique, citée dans `CLAUDE.md` §c et le
    skill `revue-croisee` §6 (à l'audit de clôture, en dehors des fichiers de l'index préparé et des dossiers
    ignorés, sortie vide ; après le commit, avant le push, sortie vide, à la lettre). Point en attente (précision de
    Claude Code, contestable) : le report (d) (corps de l'arbitre non modifié, contrôle écrit dans `CLAUDE.md` §c et
    rappelé dans chaque saisine par la citation de la règle unique jusqu'au lot unique, item (k)). Coût de
    coordination de 19.5-0b (provisoire, mis à jour à chaque correction de l'index) : ticket 3 versions (1 relecture
    complète et 2 passes courtes, par chacun des deux relecteurs) ; 3 bloquants, corrigés ; diff 3 passes (revue,
    passe courte après correction, passe courte après la remarque de l'audit de clôture) ; 2 bloquants, l'un corrigé,
    l'autre tranché par l'arbitre ; arbitrages hors clôture : 1 ; audits de clôture : 2 (le premier GO avec une
    remarque versée au dépôt) ; escalade : aucune.
  - **Prochain lot de textes à soumettre au founder (F2)** — report du founder (2026-11-03, D-ETAPE19-014), cité tel quel : « Le message d'erreur inexact relevé par l'arbitre (« Action impossible : vérifiez l'état du slot. » pour un refus faute de ressources) est une phrase, donc F2 : inscris-le dans le briefing, pour qu'il me soit soumis dans le prochain lot de textes. »
    Contenu du lot (précision de Claude Code) : (1) ce message (`FirebaseProductionService.cs`,
    `FailedPrecondition`) — cas d'usage concret signalé par l'arbitre : c'est le message vu dans le scénario de
    TD-034 (slot affiché libre, refusé occupé) ; ajout de Claude Code : le même message s'affiche aussi pour un refus faute de place
    (« Place insuffisante », même code, constat a.6 du diagnostic ci-dessus) ; (2) le message de limite d'appels
    « Trop d'actions récentes, réessaie dans 2s. » (`FirebaseProductionService.cs`, `ResourceExhausted`), avec ses
    deux changements ensemble : délai réel par action (6 s pour la collecte, constat a.7) et vouvoiement ; (3) le
    passage au vouvoiement (D-REPRISE-012) des autres phrases existantes encore tutoyées, par exemple « Une erreur
    est survenue, réessaie. », « Erreur inattendue, consulte la console. » ; leur liste exacte est relevée dans ce
    lot, non avant ; (4) remarque non bloquante de l'arbitre (arbitrage du 2026-11-04, 19.4c-2) : « 1 h 00 restantes »
    (temps restant d'un slot actif), livré tel que décidé (texte 9 du founder), à faire confirmer ou corriger par le
    founder ; (5) risque relevé en revue du ticket 19.4c-2 : le texte Q4 de confirmation d'arrêt s'affiche aussi pour
    un slot de logs, qui n'a pas d'intrants (texte inchangé, aucune variante créée) ; (6) relais de l'audit de
    clôture de 19.4c-2, point 1 : arrêt dont toutes les catégories sont vides (slot de logs sans cycle fini) — texte
    d'état vidé, aucun retour écrit (règle « aucun texte nouveau » de 19.4c-2), à lister au résumé d'arbitrages de
    l'étape 19 (questions F2 en attente). La question est formulée par l'arbitre (`CLAUDE.md` §c) ; conversion des
    textes après la réponse du founder seulement. Le lot est soumis au founder avant le déploiement de 19.5, pour
    qu'aucun texte au tutoiement n'arrive aux joueurs.
- 19.5 — déploiement backend (escalade cas 2), puis Play de bout en bout
  logs → planks → kits → vente d'un kit.
  Décision du founder (2026-11-04, D-ETAPE19-016), citée telle quelle : « Le reste de la préparation de 19.5 continue comme prévu, avec une seule demande regroupée à la fin (F2 textes, F3 alerte TD-021 et déploiement). »
  Découpage de la préparation de 19.5 (proposé en 19.5-0 ; ordre ajustable par l'arbitre ; D-ETAPE19-016) :
  - 19.5-0 — documentation : décisions du founder du 2026-11-04 (D-PLATEFORMES-001, D-ETAPE19-016), TD-036, note
    de la chaîne iOS (`docs/architecture/note-chaine-ios.md`), relais de 19.4d versé — fait le 11-04 ;
  - 19.5-0b — documentation et garde-fous (D-REPRISE-014, décision du founder) : relais de 19.5a versionné
    (`docs/sessions/relais-195a.md`), contrôle `git status --porcelain` à l'audit de clôture et avant le push, relais
    écrit dans un chemin versionné, relance ouverte par Claude Code sans question au founder — fait le 11-04 ;
  - 19.5a — **sous-étape suivante** — TD-021 : alerte sur les erreurs des CF planifiées et les erreurs
    `data-loss`, préparée et testée hors production ; son activation en production fait partie de la demande
    regroupée (F3) ; entrée du ticket : le relais `docs/sessions/relais-195a.md` ; rappel : les deux arbitrages de
    son point 1 (arbitre, audit de clôture de 19.5-0) entrent au journal en 19.5a, attribués à « arbitre » ;
  - 19.5b — lisibilité dans le simulateur d'appareils de Unity (au moins un petit écran Android et un iPhone récent
    à encoche) et boucle complète produire → lancer un lot → arrêter → collecter → vendre jouée sur l'émulateur ;
    tout changement de mise en page qui relève de la direction artistique → F2 (dans la demande regroupée) ;
  - 19.5c — build Android jusqu'à l'installation (aucune publication) et instructions exactes pour le founder
    (réglages à activer sur le téléphone, branchement), prêtes pour le jour où il aura un appareil (TD-036) ; rien
    n'est créé en dehors d'un build de développement : toute clé de publication (keystore) ou action sur une
    console (Firebase, Google Play) relève de F3, à poser au ticket de 19.5c ;
  - 19.5d — lot de textes F2 (« Prochain lot de textes à soumettre au founder », ci-dessus) : question préparée par
    l'arbitre, non soumise ; elle part seulement dans la demande regroupée ;
  - demande regroupée au founder (F2 textes, F3 activation de l'alerte TD-021 et déploiement), formulée par
    l'arbitre, une fois 19.5a à 19.5d faites ; après la réponse : conversion des textes, activation de l'alerte
    TD-021, revérification (b) en lecture seule juste avant le déploiement, déploiement, Play de bout en bout.
  Enchaînement (D-REPRISE-014, décision du founder, citée telle quelle : « crée toi-même la session enfant pour 19.5a,
  et enchaîne 19.5a → 19.5d sans me demander. ») : la session ouverte pour 19.5a enchaîne 19.5a → 19.5d sans
  question au founder, puis prépare la demande regroupée (précision de Claude Code ; `CLAUDE.md` §h).
  Relais de 19.4d, point 7 (audit de clôture) : les conditions (a)-(d) de D-ETAPE19-008 — dont TD-021 en prérequis,
  le build Android joué sur appareil réel [annotation (19.5-0) : condition (d) révisée par D-ETAPE19-016, ci-dessous]
  et le lot de textes F2 soumis avant le déploiement — doivent être vérifiées avant toute question au founder.
  [Annotation (19.5-0), lecture du point 7 avec D-ETAPE19-016 et la demande regroupée : (i) vérifié **avant** la
  demande regroupée : alerte TD-021 préparée et testée hors production (19.5a) ; lisibilité au simulateur
  d'appareils et boucle sur l'émulateur (19.5b, condition (d) révisée) ; build Android préparé (19.5c) ; question
  F2 prête (19.5d) ; (ii) réglé **dans** la demande regroupée : réponse F2 du founder sur les textes, autorisation
  F3 d'activer l'alerte TD-021 et de déployer ; (iii) **après** la réponse : conversion des textes, activation de
  l'alerte TD-021, revérification (b) en lecture seule juste avant le déploiement, déploiement, Play de bout en
  bout. La condition (c) (TD-021) et le lot F2 sont donc préparés avant la question, et remplis après la
  réponse, avant le déploiement.]
  Conditions écrites de déploiement (founder, ticket 19.2 ; D-ETAPE19-008) :
  (a) backend et client 19.4 déployés ensemble : le client actuel n'envoie ni N ni la clé d'idempotence ;
  (b) juste avant le déploiement, revérifier en lecture seule l'absence de slots de planks ou de kits, étendue à tous
  les états de slot corrompus (D-ETAPE19-006 : slot occupé sans `startedAt`, logs compris ; compteurs de lot
  invalides ou épuisés) ;
  (c) TD-021 (alertes) en prérequis, comme pour `processWorldEventLifecycle`, puisqu'un état corrompu bloque la
  connexion du compte. TD-021 étendue par décision du founder (ticket 19.2b, D-ETAPE19-008) : « TD-021 couvre
  aussi les erreurs "slot corrompu" (failed-precondition journalisées à la connexion, à la collecte et à
  l'arrêt), prérequis du déploiement 19.5. » [Annotation : depuis 19.4b, ces erreurs portent le code
  `data-loss`, D-ETAPE19-010 Q1 ; citation conservée telle quelle.]
  (d) — décision du founder (2026-11-03, message de clôture de 19.4c-1, point 2 ; D-REPRISE-013), citée telle quelle : « Build Android installé et joué sur un appareil réel avant le déploiement 19.5 : boucle produire → lancer un lot → arrêter → collecter → vendre, et lisibilité des écrans sur petit format. » Phrase du founder sur F3, même message, citée telle quelle : « Si un appareil ou un outil manque, ce sera une question F3 pour le founder au moment de 19.5. »
  [Annotation (19.5-0) : condition (d) ci-dessus **remplacée par D-ETAPE19-016** (décision du founder, F4,
  2026-11-04), ci-dessous ; texte d'origine conservé. Phrase F3 (précision de Claude Code) : l'appareil manque, et
  la décision du 2026-11-04 y répond — le test sur un appareil réel passe avant tout testeur externe (TD-036) ; il
  n'est plus une question F3 du déploiement de 19.5.]
  (d) révisée — décision du founder (2026-11-04, message après la clôture de 19.4d, point 2 ; D-ETAPE19-016 ; mise en forme aplatie, mots inchangés), citée telle quelle : « 2. **F4 : assouplissement de la condition 19.5 (d).** - Pour 19.5 : lisibilité vérifiée dans le simulateur d'appareils de Unity (au moins un petit écran Android, un format iPhone récent, avec encoche), et boucle complète jouée sur l'émulateur. - Le test sur un vrai téléphone Android devient une condition **avant tout testeur externe**, ajoutée à la jauge Phase 1. Le founder n'a pas d'Android aujourd'hui : prépare le build Android jusqu'à l'installation, et quand j'aurai un appareil, donne-moi les instructions exactes (réglages à activer, branchement). »
  Pour 19.5 : 19.5b (simulateur d'appareils, émulateur) ; avant tout testeur externe : TD-036 (vrai téléphone
  Android ; instructions préparées en 19.5c).
  Renvoi (précision de Claude Code) : le prochain lot de textes (F2) est soumis au founder avant le déploiement de
  19.5, pour qu'aucun texte au tutoiement n'arrive aux joueurs (19.4, « Prochain lot de textes à soumettre au
  founder », D-ETAPE19-014).

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
