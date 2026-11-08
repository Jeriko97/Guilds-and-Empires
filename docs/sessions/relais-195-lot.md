# Relais vers le lot de retouches (avant 19.5d) — à reprendre au ticket (versionné, D-REPRISE-014)

Source : 19.5c commitée (`d5fc0aa`, arbre `0adfbe1ef9154dd2b146291312800fab4beca9ed`) et poussée le 2026-11-08 ;
audit de clôture de l'arbitre : GO, six remarques non bloquantes ; revues : GO, remarques non bloquantes.
Ce fichier est écrit après le push de 19.5c. Il remplace, pour la suite, le « relais de 19.5d » annoncé par
D-ETAPE19-019 et le briefing : la sous-étape suivante est le lot de retouches (point 1), puis 19.5d.

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
   par série) ; les règles `ask` ne s'appliquent que dans les sessions ouvertes après leur écriture. Consigne d'intérim de
   l'arbitre : aucune commande `firebase` hors `firebase emulators:*` avec `--project demo-guilds-empires` jusqu'à la
   réponse du founder à la question F4 sur des règles supplémentaires (journal, D-REPRISE-015).
