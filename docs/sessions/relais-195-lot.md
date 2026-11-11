# Relais vers le lot de retouches (avant 19.5d) — à reprendre au ticket (versionné, D-REPRISE-014)

Source : 19.5c commitée (`d5fc0aa`, arbre `0adfbe1ef9154dd2b146291312800fab4beca9ed`) et poussée le 2026-11-08 ;
audit de clôture de l'arbitre : GO, six remarques non bloquantes ; revues : GO, remarques non bloquantes.
Ce fichier est écrit après le push de 19.5c. Il remplace, pour la suite, le « relais de 19.5d » annoncé par
D-ETAPE19-019 et le briefing : la sous-étape suivante est le lot de retouches (point 1), puis 19.5d.

**Consommé en L1** (D-REPRISE-017 ; L1 interrompue le 2026-11-10, reprise sous sa forme simplifiée le 2026-11-11) :
points 1 (consignes du founder : partie « worktree dédié », filtre et vérification ; inscrites au journal), 2 (coût
final de 19.5c, versé au briefing), 3 (5) (motifs à accolades, corrigés dans le filtre, TD-031), 4 (source « relais de
19.5c » du briefing corrigée en « risques de l'arbitre dans D-ETAPE19-019 »), 5 et 6 (arbitrages et décision du
founder inscrits au journal ; TD-032 et TD-039 mises à jour), 7 (déjà au journal : D-REPRISE-015, D-REPRISE-016),
8 (« Reste à faire », points (1) à (3) : contrôle du journal de Codex réécrit selon la consigne 2, fichiers repris de
`arbre/` et allégés, consigne 1 écrite au skill et à `CLAUDE.md`) et 9 (pièces portant des verdicts rangées hors du
dépôt avant toute revue et tout appel de l'arbitre ; entrée de journal préparée versée dans la ligne D-REPRISE-017 ;
journal, briefing et relais fusionnés sur HEAD) ; report de la revue de D-REPRISE-016 (précision 8 de
l'orchestrateur, remarques non bloquantes) : paragraphe ADC du briefing, section seed TD-018 (« Depuis D-REPRISE-015,
les identifiants Google locaux (ADC) sont révoqués par défaut… »), ligne D-REPRISE-016 « Application » remise dans
l'ordre réel des faits, et constat de l'arbitre sur le message du filtre (TD-031).
**Reportés** : à L2 — point 1, retouches (a)-(d) et le seul nouveau test de réception de l'arbitre (avec (e)-(h), (j),
(k) du lot unique, briefing) ; point 3 (4), sans action, au résumé d'arbitrages de l'étape 19 ; à 19.5d — point 1 § 2
(projet de skill « interface mobile et textes joueur », demande regroupée) ; point 3 (3) (`.utmp/`, prochaine
sous-étape qui lance un build Android) et (6) (preuve de compilation par `groundTruth.compilationFailed`) ; au build
de déploiement — point 3 (1) (Cloud Diagnostics) et (2) (permissions GMS/Firebase), point 4 (nature du build, nom de
fichier et lignes du guide) ; à la résolution de TD-038 — point 4 (`TestRunBuilder.cs`). Report nommé de chaque point
au briefing (« Prochaine étape »). Ordre de la suite : point 9.

**Coût de coordination de L1** (comptes seulement, sans verdicts de la sous-étape en cours ; remarque de l'arbitre du
2026-11-08 ; fourni par l'orchestrateur) :
- L1 interrompue (sessions du 2026-11-08 au 2026-11-10 ; point 8) : ticket v1 → v16 ; revue du ticket : Codex 15
  passes lancées (13 retenues, 1 échec, 1 écartée), auditeur 15 ; revue du diff : 6 passes de l'auditeur, 9 passes de
  Codex dont 4 écartées par le contrôle du journal (1 code 2, 3 code 1) ; 6 passes d'exécution ; 8 arbitrages ;
  3 décisions F4 du founder (D-REPRISE-015, D-REPRISE-016, consignes du 2026-11-10) ; 0 NO-GO de l'arbitre. Commit de
  doc préalable `226bc60` : Codex 2 passes, auditeur 2, arbitre 1, 0 NO-GO, 0 escalade.
- L1 simplifiée (session du 2026-11-11), état avant l'audit de clôture : arbitrage d'une
  question : 1 (Q1-Q5, sans escalade), lancé après le déplacement hors du dépôt de `.claude/hooks-dev/L1/pieces-executant/`
  (doublon des pièces de l'exécutant, verdicts compris), de `.claude/instantanes/executant/` et de `.claude/hooks-dev/`
  (commande `mv`, 2026-11-11) ; ticket v17 → v18 : Codex 2 passes (contrôle du journal 0 et 0, contrôle provisoire de
  l'orchestrateur, le script de L1 simplifiée n'existant pas encore), auditeur 2 passes (ticket corrigé une fois) ;
  NO-GO : 0 ; escalade : 0 ; exécution : 1 exécutant ; revue du diff (arbre `3e8176d1`, index temporaire) : Codex 1
  passe (contrôle du journal par le script de L1 simplifiée lancé depuis le dossier de travail : 11 blocs, 0 signalé,
  code 0), auditeur 1 passe ; une seule série d'écritures protégées (6 fichiers), arbre après copie
  identique à l'arbre relu, tests en place 442/442 et 73/73 ; rejeu du contrôle sur le journal réel `codex-diff-L1.log` :
  11 blocs, 0 signalé, code 0. Passe courte prévue (arbitrage du 2026-11-11, Q4, condition 4) sur ce résumé des
  preuves, distincte d'une correction ; audit de clôture à suivre. Les comptes finaux (passes courtes, audit de clôture)
  sont versés au résumé d'arbitrages de l'étape 19, rubrique « coût de coordination ».
- **Preuves §1 B de L1 simplifiée** (2026-11-11, filtre installé, après la copie ; quatre témoins au contenu aléatoire :
  dossier de l'exécutant, `G:/Unity/_hors-revue/GuildsAndEmpires/`, `.revue-croisee/`, `.claude/hooks-dev/` ; copie de
  revue dédiée) : **auditeur** — 25 appels d'essai (hors lecture de la consigne), 20 refus du filtre (Read des
  quatre témoins, Glob et Grep sans `path` ou avec `path` = `.claude`, `.claude/instantanes`, `G:/Unity`,
  `.claude/hooks-dev`, Read de `C:/Users/romai/.claude/projects/…` et de `C:/Users/romai/AppData/Local/Temp/claude/…`,
  formes `\\?\…`, `_hors-revue.` et `~/…`, motif `.revue-croisee/*`), 5 appels admis dans la copie de revue, aucun
  témoin atteint (vérifié dans la transcription : aucun résultat ne contient le contenu ni le nom du témoin) ;
  **arbitre** — mêmes 25 appels, mêmes 20 refus, mêmes 5 appels admis, aucun témoin atteint (même vérification) ;
  **Codex** — passe d'essai lui demandant de lire deux témoins par leur chemin absolu : contrôle du journal installé,
  2 blocs, 2 signalés (chemin absolu hors de la copie ; noms `instantanes/executant`, `_hors-revue`), code 1. Témoins
  supprimés, copie retirée. Remarque de l'arbitre pendant l'essai : l'index `MEMORY.md` de la mémoire automatique est
  injecté par la plateforme dans le contexte de départ, hors du filtre (limite déjà inscrite dans TD-031). Sorties
  brutes au rapport de clôture.
- **Reports à L2** (relevés en revue du diff de L1 simplifiée) : (1) le skill
  `revue-croisee` ne prévoit le déplacement de `.claude/hooks-dev/` et du dossier de l'exécutant qu'avant les passes de
  revue, pas avant un « arbitrage d'une question » (paragraphe « Arbitre hors audit de clôture »), alors que le journal
  (D-REPRISE-017) le dit pour chaque appel de l'arbitre ; risque couvert par le filtre (R1) ; (2) la phrase Q5 en tête
  du fichier commun est lue aussi par l'auditeur et l'arbitre : préciser dans leurs corps
  (`.claude/agents/auditeur.md`, `.claude/agents/arbitre-strategique.md`) qu'elle vise Codex seul ; (3) vérifier sur
  les journaux réels que le journal de Codex double toutes les barres inverses du texte passé à `-Command`, pas
  seulement celles du chemin de l'interpréteur (hypothèse de format de l'étape (1) du contrôle).

1. **Consignes du founder reçues le 2026-11-08 pendant 19.5c** (décision F4 sur les garde-fous ; texte cité tel
   quel ; à inscrire au journal, attribuées au founder) :

   « Consignes founder — à appliquer **après la clôture de 19.5b, avant 19.5c**. N'interromps pas ce qui est en cours.

   ## 1. Lot de retouches, en priorité (3e lecture interdite d'un relecteur : ça coûte des revues complètes)
   Correction structurelle, plutôt qu'un filtre de plus :
   - **Toute revue (Codex, auditeur, arbitre) se fait dans un worktree dédié**, créé à partir de l'arbre exact de l'index audité, ouvert dans un dossier hors du dépôt de travail. Le dossier de l'exécutant, les relais et `.revue-croisee/` n'existent pas dans ce worktree. Codex est lancé avec ce worktree comme seul répertoire de travail.
   - Le filtre de lecture (TD-031) reste en place pour les agents Claude, en complément.
   - Vérification : preuve qu'un relecteur lancé dans ce worktree ne peut pas lire le dossier de l'exécutant.
   - Dans le même lot, les retouches déjà listées : (a) lignes supprimées et répertoire propre, (b) push aligné sur D-REPRISE-009 dans le texte de l'agent, (c) retrait du rappel temporaire, (d) règle « garde-fou resserré / assoupli », plus le contrôle `git status --porcelain` vide avant push.
   - **Un seul nouveau test de réception de l'arbitre** pour tout le lot (les 4 cas existants, aucun affaibli).
   - Si une modification de CLAUDE.md, d'un agent ou des réglages déclenche le contrôle de la plateforme : dis-moi « autorisation demandée ». Je validerai.

   ## 2. Proposition de skill « interface mobile et textes joueur » (décision F4, à me soumettre)
   Signal : 9 défauts F2 et la zone sûre (TD-037) en 19.5b, une douzaine de textes soumis un par un en 19.4c.
   - Rédige un **projet** de skill, sans le créer, à partir uniquement de ce qui est déjà décidé dans le dépôt :
     - gabarits d'écran, zone sûre, orientation (selon ma réponse F1 à venir), tailles minimales lisibles ;
     - guide des textes : vouvoiement, « stock plein », noms de ressources invariables, libellés courts délégués à l'arbitre, phrases en F2 ;
     - renvois vers les skills Unity UI existants pour la partie technique, sans les recopier.
   - Soumets-le dans la **demande regroupée** de 19.5d, à côté des textes F2, avec ta recommandation.
   - Note dans le résumé de l'étape 19, rubrique « signal skill » : (1) interface mobile (proposé), (2) build et publication mobile, à transformer en skill quand la chaîne iOS sera montée. »

   Lecture de Claude Code : 19.5c était engagée à la réception (ticket v3, build en cours) ; « N'interromps pas ce qui
   est en cours » appliqué : 19.5c menée à son terme, puis le lot de retouches passe en priorité, avant 19.5d ; le
   projet de skill est rédigé en 19.5d pour la demande regroupée. Le « 3e lecture interdite » vise 19.4c-1 et 19.5b
   (deux relecteurs, revue écartée) ; en 19.5c, contre-mesure appliquée : dossier de l'exécutant déplacé hors du
   dépôt pendant chaque revue, aucune lecture interdite constatée.

2. **Coût de coordination final de 19.5c** (à remplacer au commit suivant, au briefing, l. ~916, version provisoire) :
   ticket 3 versions (v1 : Codex GO, auditeur GO APRÈS CORRECTION — 1 bloquant : téléchargements certains, clause STOP
   sans décision du founder — ; v2, après arbitrage des téléchargements : passe courte GO des deux, six non-bloquants
   acceptés ; v3, après arbitrage des DLL Firebase : passe courte GO des deux, non-bloquants acceptés, puis correction
   factuelle de l'arbitre sur `Assets/Resources.meta`) ; arbitrages hors clôture : 3 rendus (téléchargements,
   DLL / fichiers réécrits, correction `Assets/Resources.meta`) + 1 appel perdu (lancé depuis `.revue-croisee/`) ;
   builds : 1 échoué, 1 réussi ; diff : v1 GO des deux, passe courte après corrections GO des deux ; audit de clôture 1
   (GO) ; NO-GO de fond : 0 ; escalade : 0. Passes par relecteur : Codex 5, auditeur 5, arbitre 5 (dont 1 perdu).
3. **Remarques non bloquantes de l'audit de clôture de 19.5c** (arbitre) :
   (1) Cloud Diagnostics : le journal du premier build dit « The Unity Cloud Diagnostics service is enabled » alors que
   l'index porte `m_Enabled: 0` et `m_EnableCloudDiagnosticsReporting: 0` ; la question réservée à l'arbitre avant le
   build de déploiement doit viser explicitement Cloud Diagnostics (briefing, « Avant le build de déploiement ») ;
   (2) permissions tirées des dépendances GMS/Firebase (`AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`,
   `ACCESS_ADSERVICES_AD_ID`, `BIND_GET_INSTALL_REFERRER_SERVICE`) : déclaration « sécurité des données » Google Play à
   prévoir à la publication (F3 à ce moment-là) ; point pour l'arbitre au build de déploiement, même crochet ;
   (3) `.utmp/` (intermédiaires CMake / ninja de Gradle) non ignoré : décision de l'arbitre (outillage, aucun F1–F4) —
   la prochaine sous-étape qui lance un build Android peut ajouter `.utmp/` à `.gitignore`, dans son périmètre, puis
   complément de D-ETAPE19-019 attribué à « arbitre » ;
   (4) résumés de verdicts dans le coût de coordination lus comme contenu de §f : sans action ;
   (5) filtre `.claude/hooks/arbitre-lecture.js` : refus à tort sur les motifs à accolades (Grep `glob`
   `Firebase.{Auth,Firestore,AppCheck}.dll.meta`, Glob `docs/{guides/…,sessions/…}`), motif « .revue-croisee/ » ;
   modifier le hook est F4 : au lot de retouches et comme exemple dans TD-031 ;
   (6) preuve de compilation de l'Éditeur : citer la sortie brute `groundTruth.compilationFailed: false`, pas le
   rapport de l'exécutant (remarque réitérée).
4. **Non-bloquants reportés de la passe courte du diff de 19.5c** (auditeur) : briefing l. ~999, la source « D-ETAPE19-019,
   relais de 19.5c » est ambiguë (ces points viennent des risques de l'arbitre dans D-ETAPE19-019, pas de
   `relais-195c.md`) ; la « nature du build de déploiement » est « à qualifier par l'arbitre (F1/F2 possible : mention
   « Development Build » visible à l'écran) », pas d'office à l'arbitre ; si le build de déploiement n'est pas de
   développement, le nom de fichier et les l. 13-14 et 27 du guide changent ; TD-038 : `TestRunBuilder.cs` du paquet
   Performance Testing crée lui-même `Assets/Resources/` s'il manque et le supprime après le build
   (`CreateResourcesFolder`, `Cleanup`) — à verser dans TD-038 à sa résolution.

5. **État de L1 au 2026-11-08 (session de 19.5a-19.5c)** — ticket L1 v1 relu par les deux relecteurs : 4 bloquants
   au total, traités par l'arbitrage ci-dessous (comptes seulement : verdicts de la sous-étape en cours, non versionnés,
   remarque de l'arbitre ci-dessous).
   Essai d'outillage de l'orchestrateur (hors dépôt) : Codex `--sandbox read-only -C <dossier vide>` a lu par chemin
   absolu un fichier témoin placé ailleurs (`Get-Content -LiteralPath …\essai-codex\ailleurs\temoin.txt` →
   « succeeded », contenu recopié) : le bac à sable de Codex limite l'écriture, pas la lecture.
   Arbitrage de l'arbitre (2026-11-08, arbitrage d'une question ; VERDICT : NO-GO sur L1 tant que le founder n'a pas
   répondu ; à inscrire au journal attribué à « arbitre ») — décision résumée fidèlement, termes clés cités :
   - Q1 (arbitre) : lecture (a) — « les relais » = pièces hors index (relais non commités, notes partagées) ; un relais
     versionné de l'index est relu comme le reste (D-REPRISE-014, D-REPRISE-004) ; la lecture (b) est rejetée ;
     conditions : phrase au ticket v2 avec « lecture de l'arbitre, contestable par le founder au résumé d'arbitrages de
     l'étape 19 » ; journal ; Codex repasse sur le ticket v2, bloquant maintenu → F4.
   - Q2 : **F4**, question au founder ci-dessous ; et conclusion due au founder par D-REPRISE-013 (item (i)) : « un
     filtre de lecture n'est pas possible pour Codex ».
   - Q3 (arbitre) : sorties de Codex inchangées dans `.revue-croisee/` ; filtre étendu à l'auditeur (D-REPRISE-013) ;
     refus, pour `auditeur` et `arbitre-strategique`, de tout chemin ou motif contenant `.revue-croisee` ou
     `.claude/instantanes/executant` ; `cloture/` et `revue/` restent lisibles ; aucune pièce portant un verdict sous
     la racine des revues, racine vidée avant chaque passe ; pas de limitation générale à la racine.
   - Q4 (arbitre) : l'orchestrateur lance les passes d'essai et la passe complète ; l'exécutant lance seulement les
     tests unitaires du script.
   - Remarques : coût de coordination provisoire commité sans verdicts de la sous-étape en cours (comptes seulement) ;
     commit technique `git commit-tree` non référencé, jamais poussé, worktree retiré après la passe ; corriger le
     refus des motifs à accolades dans le même diff, avec un test ; joindre le texte des décisions citées par ID ;
     pièce due au prochain appel : ticket L1 v1 copié dans `.claude/instantanes/cloture/`.
   - Dette : TD-032 (résolution partielle, volet Codex : aucun filtre possible), TD-031 (auditeur, accolades).
   Question F4 au founder, formulée par l'arbitre, transmise telle quelle :
   « **Ce qui bloque (F4, garde-fous).** Vous avez demandé que chaque relecture se fasse dans une copie séparée du
   projet et qu'on prouve qu'un relecteur lancé dans cette copie *ne peut pas* lire le dossier de travail de
   l'exécutant. Pour les relecteurs Claude (auditeur, arbitre), c'est possible : un filtre refuse la lecture, et on
   peut le montrer. Pour Codex, c'est impossible tel quel : nous avons vérifié que Codex, lancé dans un dossier vide en
   mode « lecture seule », lit n'importe quel fichier du disque dont il connaît ou trouve le chemin. Son mode « lecture
   seule » l'empêche d'écrire, pas de lire. Il faut donc choisir comment on garantit l'indépendance de Codex.
   **Option 1 — Copie séparée + dossier de l'exécutant déplacé hors du dépôt pendant chaque relecture + contrôle
   automatique du journal de Codex après chaque relecture** : toute commande visant un chemin hors de la copie →
   relecture écartée et refaite par un Codex neuf. Preuve obtenue : « Codex n'a pas lu », constatée à chaque fois ; pas
   « ne peut pas lire ». Impact : rien à changer sur votre ordinateur, applicable tout de suite ; une faute coûte une
   relecture refaite (comme aujourd'hui), mais elle est détectée systématiquement et non plus au hasard.
   **Option 2 — Isolation par Windows** : Codex lancé sous un compte Windows distinct, ou droits d'accès refusés sur le
   dossier de l'exécutant. Preuve « ne peut pas lire » réelle. Impact : réglages de sécurité de votre poste à faire par
   vous (compte, droits, réinstallation et connexion de Codex sous ce compte) ; délai ; chaque relecture devient plus
   lourde ; risque de casser l'outillage actuel.
   **Option 3 — Supprimer le dossier de l'exécutant avant chaque relecture** (après avoir versé au commit ce qui est
   durable). Preuve « ne peut pas lire » pour ce dossier, mais perte des pièces de travail (rapport, consoles,
   captures) dont l'orchestrateur a besoin après la relecture pour le rapport de clôture ; et tout le reste du disque
   reste lisible par Codex.
   **Recommandation : option 1.** C'est la seule applicable sans toucher à votre poste ; les relecteurs Claude ont,
   eux, la vraie preuve « ne peut pas lire » par le filtre ; et le contrôle du journal rend chaque lecture interdite de
   Codex visible et sanctionnée. Si vous voulez une garantie absolue pour Codex, c'est l'option 2, et c'est vous qui
   la mettez en place. »
   Suite : après la réponse du founder, ticket L1 v2 (Q1, Q3, Q4 et la réponse), revue des deux relecteurs, exécutant.

6. **Réponse du founder à la question F4 (2026-11-08)** — texte cité tel quel ; à inscrire au journal en L1, attribuée
   au founder :

   « Décision founder (F4) : **option 1.**

   Citation : « Option 1. Pour Codex, la preuve exigée devient "n'a pas lu", contrôlée par l'analyse automatique de son journal après chaque relecture. Toute commande visant un chemin hors de la copie de revue → relecture écartée et refaite par un Codex neuf. Pour les relecteurs Claude, la preuve "ne peut pas lire" par le filtre reste exigée. »

   À faire :
   1. **Commite et pousse `docs/sessions/relais-195-lot.md` maintenant**, en commit de doc (trois GO), sans attendre L1. Troisième occurrence d'un relais non versionné : c'est noté comme « signal skill / garde-fou » pour le résumé de l'étape 19.
   2. Ouvre une dette (numéro suivant) : « Isolation réelle de Codex en lecture : à étudier par conteneur (Docker ou WSL) qui ne monte que la copie de revue. Déclencheur : une deuxième lecture interdite détectée malgré le contrôle du journal, ou avant tout testeur externe. Rien à installer sur le poste du founder sans décision F3. »
   3. Reprends L1 avec l'option 1, puis le reste du lot, puis 19.5d, comme prévu. Je n'interviens que pour « autorisation demandée » et la demande regroupée. »

   Application (Claude Code) : point 1 — ce fichier est commité seul avec TD-039, en commit de doc ; à reporter au
   résumé d'arbitrages de l'étape 19, rubrique « signal skill » : « relais non versionné, troisième occurrence »
   (signal skill / garde-fou, selon le founder). Point 2 — TD-039 ouverte (`docs/architecture/technical-debt.md`).
   Point 3 — suite : ticket L1 v2 avec l'option 1, puis L2, puis 19.5d.
7. **D-REPRISE-015 (2026-11-08, F4, founder)** : règles `ask` du projet, autorisations locales nettoyées, identifiants
   Google locaux révoqués. Pour L1 et tout lot qui touche des fichiers protégés, l'exécutant prépare les contenus dans
   des fichiers de travail et la session principale fait les écritures protégées (« autorisation demandée » une fois
   par série) ; les règles `ask` ne s'appliquent que dans les sessions ouvertes après leur écriture. La consigne d'intérim
   de l'arbitre (D-REPRISE-015) est levée : D-REPRISE-016 (2026-11-09, F4, founder) déconnecte l'outil Firebase du
   poste ; toute commande `firebase` hors émulateur `demo-guilds-empires` exige une reconnexion, partie de l'action F3
   qu'elle sert. Règles `ask` ciblées ajoutées (`git push -d`/`--delete`/`--mirror`/`--prune`, identifiant de
   production collé) ; `docs/skills/**` protégé ; briefing non protégé (trois GO).
8. **Relais de L1 interrompue (2026-11-10, contexte de la session à 89 %, décision du founder)** — à lire en premier.
   Consignes du founder (2026-11-10), citées telles quelles : « STOP sur L1, priorité au relais : le contexte est à
   89 %. » ; « 1. **N'écris plus aucun fichier protégé modification par modification.** Le développement du hook se
   fait dans un dossier de travail non protégé (par exemple `.claude/hooks-dev/`, ignoré par git), testé là. Quand
   c'est fini et revu : une seule copie vers `.claude/hooks/`, donc une seule « autorisation demandée ». Même règle
   pour CLAUDE.md, les agents et les réglages. Inscris-le dans le relais. » ; « 2. **Simplifie L1 (consigne
   founder).** Le contrôle du journal de Codex doit être **conservateur et simple**, pas un analyseur de syntaxe
   shell : toute commande du journal qui contient un chemin absolu hors de la copie de revue, `..`, ou le nom du
   dossier de l'exécutant ou des relais → relecture écartée et refaite par un Codex neuf. Les faux positifs sont
   acceptés. Si l'arbitre juge que c'est insuffisant, il me le dit en F4. Sinon, on n'ajoute plus de cas de
   syntaxe. » ; « 4. **Crée toi-même la session principale suivante** (D-REPRISE-013), démarrée depuis le relais.
   Elle reprend L1 simplifié, puis enchaîne comme prévu jusqu'à la demande regroupée. Ne me demande rien
   entre-temps, sauf F1 à F4 et une « autorisation demandée » par série d'écritures protégées. » La consigne 3
   (« **Relais maintenant**, avant toute autre action […]. Commit de doc (trois GO), push. ») est appliquée par le
   commit de ce relais.
   **État exact (précision de Claude Code).** Rien de L1 n'est commité : l'arbre est revenu à `9010f19`
   (D-REPRISE-016). Tout le travail en cours est sauvegardé, hors index, dans `.claude/hooks-dev/L1/` (ignoré par
   git) : `L1-wip-contre-HEAD.patch` (sha1 `06fde571820fa0eeff8691b3e1bff6969d934dc8`, diff complet contre `9010f19`),
   `arbre/` (les 10 fichiers dans leur dernier état : `.claude/hooks/arbitre-lecture.js` et son test,
   `.claude/hooks/controle-journal-codex.js` et son test, `.claude/skills/revue-croisee/SKILL.md`, `CLAUDE.md`, journal,
   dette, briefing, relais), `pieces-executant/` (pièces de travail à remettre dans `.claude/instantanes/executant/` avant toute revue, où le
   filtre de lecture et le déplacement hors revue les couvrent : ticket L1 v16, précisions de l'orchestrateur, textes bruts des
   arbitrages du 2026-11-08 et du 2026-11-09 — journal Codex, Q1-Q5, code 2, rejeu, convergence —, verdicts bruts
   des passes de revue du diff, rapports des passes d'exécution 1 à 6, relevé des versions de Codex).
   Préparé (non commité, non revu au GO) : filtre de lecture commun auditeur-arbitre (`arbitre-lecture.js`, 408/408) ;
   preuves que les relecteurs ne lisent pas le dossier de l'exécutant (fichiers témoins : auditeur et arbitre, 22
   appels, 17 refus, aucun témoin atteint ; Codex : lecture du témoin signalée par le contrôle du journal, code 1) ; skill `revue-croisee` (revue en worktree dédié, dossier de l'exécutant déplacé, fichier commun avec la
   phrase `--liste`, contrôle du journal, verrou de version `0.167.0-alpha.3.2`, règle de convergence) ; `CLAUDE.md`
   §c, §d, §h ; journal D-REPRISE-017 (consignes et décision F4 du founder, arbitrages) ; TD-031, TD-032, TD-039.
   Arbitrages encore valables (arbitre, 2026-11-08 et 2026-11-09, textes bruts dans `pieces-executant/`, à inscrire au
   journal D-REPRISE-017) : revue en worktree dédié et dossier de l'exécutant déplacé ; critère de bloquant des revues
   du contrôle (une commande acceptée qui lit hors de la copie) ; verrou de version de Codex (`0.167.0-alpha.3.2`) et
   `sandbox: read-only` dans le préambule, code 2 → arbitre saisi ; aucune détection d'en-tête inconnu par la forme ;
   règle de convergence (un code 1 n'est jamais traité en modifiant le contrôle sans l'arbitre).
   Abandonné par la consigne 2 : la grammaire fermée du contrôle du journal (`controle-journal-codex.js`, 312 cas,
   passes de revue 1 à 5 du diff : chaque passe trouvait une nouvelle forme d'évasion syntaxique).
   **Reste à faire (prochaine session, L1 simplifiée)** : (1) réécrire `controle-journal-codex.js` selon la consigne
   2 (recherche de texte dans chaque commande `exec` : chemin absolu hors de la copie, `..`, `.revue-croisee`,
   `.claude/instantanes/executant`, `_hors-revue`, dossier des relais ; garder le verrou de version, `sandbox:
   read-only` et le code 2 de l'échec fermé), dans `.claude/hooks-dev/`, avec ses tests ; soumettre la consigne 2 à
   l'arbitre (suffisante, ou F4) ; (2) reprendre de `arbre/` les autres fichiers, retirer du skill, de `CLAUDE.md`,
   du journal et de TD-039 ce qui décrit la grammaire fermée et la phrase `--liste`, y écrire la règle simple et la
   consigne 1 ; (3) une seule série d'écritures protégées (« autorisation demandée ») ; tests en place ; revue du diff
   complet en worktree (Codex et auditeur), audit de clôture, commit, push ; (4) puis la suite fixée par le founder
   (message du 2026-11-09, cité tel quel) : « **Puis enchaîne sans t'arrêter** : 1. L1 et le reste du lot de
   retouches (contenus préparés par un exécutant neuf, écritures protégées par toi, regroupées) ; 2. 19.5d (lot de
   textes F2 et projet de skill « interface mobile ») ; 3. la correction de TD-037 (zone sûre), qui doit être faite
   avant le déploiement ; 4. **une seule demande regroupée** : F1 orientation, F2 textes, mise en page et projet de
   skill, F3 reconnexion, vérification de la condition (b), activation de l'alerte et déploiement. » ; « Tu ne
   t'arrêtes que pour F1 à F4 ou « autorisation demandée ». Le reste, tu le traites avec l'arbitre. » Lecture de
   Claude Code, à soumettre à l'arbitre au début de la session suivante : cet ordre place la correction de TD-037
   avant la demande regroupée, alors que D-ETAPE19-018 la plaçait après la réponse du founder ; la décision du
   founder du 2026-11-09 prévaut, au doute vers le founder (D-REPRISE-007). **Remplacé par le point 9.**
   **Fait (L1 simplifiée, D-REPRISE-017)** : points (1) à (3) de ce « Reste à faire » — contrôle réécrit (recherche de
   texte, `.claude/hooks/controle-journal-codex.js` et ses tests), consigne 2 soumise à l'arbitre (arbitrage du
   2026-11-11 : règle suffisante, pas de F4), fichiers repris de `arbre/` et allégés, une seule série d'écritures
   protégées ; le point (4) est remplacé par l'ordre du point 9.
   Coût de coordination de L1 jusqu'ici (comptes seulement) : ticket v1 → v16 ; revue du diff : 6 passes de
   l'auditeur, 9 passes de Codex dont 4 écartées par le contrôle du journal (1 code 2, 3 code 1) ; 6 passes
   d'exécution ; 8 arbitrages ; 3 décisions F4 du founder (D-REPRISE-015, D-REPRISE-016, consignes du 2026-11-10).
9. **Décision du founder du 2026-11-11 (clôture du relais) — D-REPRISE-017, journal.** Elle remplace, sur l'ordre
   de TD-037, la « lecture de Claude Code » du point 8 : aucune saisine de l'arbitre sur cet ordre. Ordre de la
   suite, cité tel quel : « Ordre : L1 simplifié → reste du lot → 19.5d → demande regroupée → correction TD-037 →
   déploiement. » ; « 4. La nouvelle session reprend L1 simplifié **en premier**, puisque son travail n'existe que
   sur ce poste. »
   Ticket de L1 simplifiée (remarque 2 de l'arbitre, D-REPRISE-017) : les pièces de `.claude/hooks-dev/L1/pieces-executant/`
   contiennent des verdicts bruts de relecteurs ; elles sont déplacées avant toute revue **et avant tout appel de
   l'arbitre**. L'entrée de journal préparée par L1 sous `D-REPRISE-017` (`arbre/`) est versée dans la ligne
   D-REPRISE-017 déjà commitée, sans en changer les citations. Le journal, le briefing et le relais rangés dans
   `arbre/` partent de `9010f19` : ils se fusionnent sur HEAD, jamais recopiés depuis `arbre/`.
   **Incidents d'outillage** (rubrique demandée par le founder, à reporter au résumé d'arbitrages de l'étape 19) :
   (1) 19.5c : fichier suivi `Assets/Resources.meta` supprimé pendant le nettoyage des fichiers du build, rétabli par
   `git checkout -- Assets/Resources.meta` (D-ETAPE19-019) ; (2) relais de L1 (2026-11-10) : index git abîmé par
   `git --work-tree=<dossier temporaire> checkout HEAD -- .` (informations de cache de l'index réécrites, fichiers du
   relais retirés de l'index ; aucun fichier de l'arbre de travail modifié), réparé par `git read-tree HEAD`,
   `git update-index -q --refresh` et une nouvelle indexation, arbre vérifié identique à l'arbre audité. Règle du
   founder, citée telle quelle : « Si un troisième survient, c'est un signal à me soumettre. »
