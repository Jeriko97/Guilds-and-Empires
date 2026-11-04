# CLAUDE.md — Guilds & Empires

Briefing et conventions verrouillées : `docs/sessions/BRIEFING-claude-code.md` (à lire en début de session).
Décisions : `docs/architecture/phase-1-decisions-log.md` · Dette : `docs/architecture/technical-debt.md`.

## Mode autonome supervisé (D-REPRISE-003, D-REPRISE-007, D-REPRISE-008, D-REPRISE-009, D-REPRISE-011, D-REPRISE-012, D-REPRISE-013, D-REPRISE-014)

La session principale de Claude Code orchestre ; chaque sous-étape est implémentée par un sous-agent exécutant
neuf (§h). Deux relecteurs read-only indépendants contrôlent chaque ticket et chaque diff : le
sous-agent `auditeur` (`.claude/agents/auditeur.md`) et Codex (`AGENTS.md`), via le skill `revue-croisee`.
L'**arbitre stratégique** (`.claude/agents/arbitre-strategique.md`, read-only) tranche tout ce qui ne relève pas du
founder et rend l'audit de clôture de chaque sous-étape. Le founder (non technique) n'est sollicité que pour
**F1–F4** (§b). Ce mode remplace, pour chaque sous-étape, la « validation par étape » du briefing.

### a. Cycle d'une sous-étape
1. **Ticket** : objectif, fichiers du périmètre, hors périmètre, critères d'acceptation, valeurs économiques touchées.
   Clause STOP — règle du founder (escalade 19.2b, 2026-11-02) : « Une clause STOP renvoie à une décision du journal attribuée au founder, jamais à un texte de spec rédigé par un agent. »
   Une clause STOP déclenchée va à l'arbitre, sauf si son objet relève de F1–F4 (§b).
2. **Revue croisée — mode ticket** (skill `revue-croisee`).
3. **Implémentation** dans le périmètre du ticket.
4. **Tests** : `npm run test:emulator` pour le backend ; compilation Unity sans erreur pour le client.
5. **Play via le plugin Unity** (`unity:unity-cli`) : capture Game view + console brute.
   Sous-étape sans effet en jeu (doc, outillage) : écrire « Play : non applicable » dans le rapport.
6. **Revue croisée — mode diff**. Règle du founder (D-REPRISE-004, 2026-11-02) :
   « Ce qui est commité doit être identique à ce qui a reçu en dernier un GO des deux relecteurs. Ce GO peut venir de la revue du diff, d'une passe courte ou d'une passe après correction. Toute modification après ce GO, même de forme, déclenche une passe courte avant le commit. Aucune exception. »
   La passe courte relit, par les deux relecteurs, ce delta uniquement : depuis la version qui a reçu le dernier GO
   des deux ; tant qu'aucun GO des deux n'existe dans la sous-étape, depuis la version de la passe précédente
   (`prev.tree`). Détail dans le skill `revue-croisee` §5.
7. **Audit de clôture de l'arbitre** (§c) sur l'index exact du futur commit.
8. **Commit atomique**, contrôle de l'arbre (§d), puis rapport de clôture (§f).

### b. Escalade — le founder n'est sollicité QUE pour F1–F4 (D-REPRISE-007, D-REPRISE-012, D-REPRISE-013)
Texte du founder (ticket du 2026-11-03), tel quel :
- **F1 — Game design et gameplay** : règles, valeurs économiques, bornes, durées, rythme. **Règle d'effet indirect** : toute décision technique susceptible de modifier un comportement visible par le joueur, une valeur économique ou une règle de gameplay relève de F1, **même présentée comme une correction ou une optimisation**.
- **F2 — Direction artistique et textes affichés au joueur.**
- **F3 — Actions irréversibles en production** : déploiement, écriture, seed. Question oui / non, regroupée quand c'est possible.
- **F4 — Désaccord persistant** entre l'arbitre et un relecteur sur un point bloquant, **modification des garde-fous** (cette liste, D-REPRISE-004/005, conventions non négociables), ou **création ou modification d'un skill**.

Règle du founder (D-REPRISE-013, 2026-11-04), citée telle quelle : « Toute modification de CLAUDE.md ou de la définition d'un agent déclenche le contrôle de la plateforme : c'est attendu, et c'est l'application de F4. Ne jamais le contourner. »

**Tout le reste est tranché par l'arbitre.** Claude Code ne pose jamais lui-même une question au founder :
l'arbitre la formule (§c). Seule exception : arbitre indisponible (§d) ; Claude Code formule alors la question F4
selon §e, et le dit.

Décision F4 du founder (D-REPRISE-012, 2026-11-03), citée telle quelle : « Les libellés courts (boutons, noms d'états, formats de durée et de quantité) sont délégués à l'arbitre, à condition d'être listés dans le résumé d'étape. Les phrases (avertissements, confirmations, résumés, messages d'erreur, textes de maintenance) restent F2. Le vouvoiement est la règle pour tous les textes affichés au joueur. »
Précision de Claude Code (relue en revue croisée) : un libellé court décidé par l'arbitre entre au journal,
attribué à « arbitre », et au résumé d'arbitrages d'étape (§f) ; au doute entre libellé court et phrase → F2.

Précisions d'application (Claude Code, relues en revue croisée ; au doute, vers le founder — D-REPRISE-007) :
- **F3** couvre le déploiement des Cloud Functions et des Security Rules, et toute écriture sur les données de
  production (seed, migration, correction manuelle). Y restent, pour git (D-REPRISE-009) : merge vers `main`,
  force-push ou réécriture d'historique, suppression de branche distante ; push direct sur `main` (assimilé au merge) ;
  push qui déclencherait un déploiement. Push normal sur la branche de travail : sans question (§g).
- **Garde-fous (F4)** : cette liste d'escalade et sa correspondance ; la boucle de revue et de commit
  (D-REPRISE-003/004/005/007/008, §a, §d, skill `revue-croisee`) ; les relecteurs et l'arbitre, leurs grilles et
  leurs outils (`AGENTS.md`, `.claude/agents/*.md`, `.claude/settings.json`, `.claude/hooks/`) ; les conventions non
  négociables
  (`BRIEFING-claude-code.md`) ; les doctrines (`docs/skills/**` : C1–C9, doctrines backend) ; la règle du push (§g).
  **Skill** : `.claude/skills/**` et `docs/skills/**`. Une modification de garde-fou **déjà décidée par le founder
  au journal** (ex. : `data-loss` en 19.4b, D-ETAPE19-010) s'applique sans nouvelle escalade.

Correspondance avec les 9 cas de D-REPRISE-003/005 (remplacés) ; elle sert aussi à lire les renvois historiques
« escalade cas N » du journal, de la dette et des briefings. Fixés par le founder : cas 1 et 2 → F3 ; cas 4 → F1 ;
cas 9 → arbitre, puis F4 si le désaccord persiste. Les autres : précisions d'application de Claude Code, au doute
vers le founder (D-REPRISE-007).

| Ancien cas | Nouveau |
|---|---|
| 1. Écriture sur les données de production | F3 |
| 2. Déploiement de Cloud Functions ou de Security Rules | F3 |
| 3. Action irréversible : push, merge sur main, suppression de branche, réécriture d'historique | push normal sur la branche de travail : sans question, après les trois GO et la vérification de l'arbre (§g) ; merge vers `main`, force-push ou réécriture d'historique, suppression de branche distante : F3 (D-REPRISE-009) |
| 4. Valeur économique ou de game design | F1 |
| 5. Doctrine ou convention verrouillée | F4 (garde-fou) |
| 6. Bloquant non résoluble sans sortir du ticket | arbitre ; F1–F4 si la sortie de périmètre en relève |
| 7. Relecteurs contradictoires sur un bloquant | arbitre, puis F4 si le désaccord persiste |
| 8. Tests rouges après deux corrections | arbitre ; F1 si la correction change le comportement de jeu |
| 9. Relecteur indisponible ou bloquant non résolu | arbitre, puis F4 si le désaccord persiste |

### c. Arbitre stratégique — points d'appel
Toujours dans un contexte neuf (`subagent_type: "arbitre-strategique"`), sans le raisonnement ni la recommandation
de Claude Code, lancé depuis la racine du dépôt (jamais depuis `.revue-croisee/`, que son filtre refuse). La consigne
commence par le **type d'appel** ; les pièces requises en dépendent (D-REPRISE-008, définition de l'agent) :
- **arbitrage d'une question** (code pas encore écrit) : la question (faits, sans recommandation), les options, les
  décisions applicables (ID et texte), les extraits de doc ou de code concernés ; s'il y a désaccord, les verdicts
  bruts concernés. Ni diff ni tests ;
- **audit de clôture, ou proposition de modification de code ou de comportement** : le rapport (ou l'exposé de la
  proposition), le diff complet de l'index (`git diff --cached`), les résultats des tests, les décisions applicables.
  En audit de clôture, **pas** les verdicts des autres relecteurs (ancrage).
  En audit de clôture, en plus : la sortie brute de `git status --porcelain`, prise sur l'index préparé. Règle du
  founder (D-REPRISE-014, 2026-11-04), citée telle quelle : « Ajoute à l'audit de clôture de l'arbitre et à la vérification avant push un contrôle obligatoire : `git status --porcelain` doit être vide, en dehors des dossiers ignorés. Sinon, NO-GO. »
  Règle unique de l'arbitre (arbitrage du 2026-11-04, D-REPRISE-014), citée telle quelle :
  « Application avant le commit (arbitre, 2026-11-04, précision d'application de D-REPRISE-014 ; contestable par le founder au résumé d'arbitrages de l'étape 19) : à l'audit de clôture, l'index préparé est par construction non vide ; le contrôle se lit donc « en dehors des fichiers de l'index préparé (`git diff --cached --name-only`) et des dossiers ignorés, `git status --porcelain` doit être vide » : aucune ligne `??` (`git ls-files --others --exclude-standard` vide), aucune ligne dont la 2ᵉ colonne est non vide (`git diff --name-only` vide) ; chaque ligne restante est un fichier de `git diff --cached --name-only`. Pièce absente ou contrôle échoué → NO-GO. Après le commit, avant le push : sortie vide, à la lettre (§d, §g). »
Pièce requise absente → NO-GO, avec la liste. En cas de doute sur le type, l'arbitre applique la règle la plus
exigeante et le dit. Pièce trop longue pour être collée : écrite dans `.claude/instantanes/cloture/` (non versionné,
lisible par l'arbitre ; jamais `.revue-croisee/`), vidé avant chaque dépôt, et désignée par son chemin et son
empreinte sha1. Audit contaminé
(verdict d'un autre relecteur lu ou reçu en clôture) : invalidé, relancé dans un contexte neuf avec des pièces
nettoyées.

Points d'appel :
- **(a) Arbitrage** : chaque point qui aurait été escaladé et qui ne relève pas de F1–F4, et tout bloquant d'un
  relecteur que Claude Code ne corrige pas.
- **(b) Audit de clôture de chaque sous-étape**, après le GO des deux relecteurs, sur l'index une fois préparés tous
  les fichiers du commit.
- **(c) Avant toute question au founder**, l'arbitre la formule : français simple, options avec leur effet sur le
  jeu, une recommandation (§e).
L'arbitre lit le dépôt (Read, Grep, Glob) ; il n'a ni écriture ni terminal. Les sorties git utiles sont jointes par
Claude Code. Il ne lit jamais `.revue-croisee/` : le filtre du projet (`.claude/settings.json` →
`.claude/hooks/arbitre-lecture.js`, appliqué aux seuls appels de l'arbitre) le refuse ; les lectures de chaque appel
sont contrôlées dans sa transcription et consignées au rapport (TD-031).
Verdict binaire GO / NO-GO. Chaque arbitrage entre au journal, attribué à « arbitre ».

### d. Intégrité de l'index et boucle de commit (D-REPRISE-004 inchangée sur le fond)
- Le **dernier GO** de D-REPRISE-004 exige le GO de Codex, de l'auditeur **et** de l'arbitre (audit de clôture), sur
  le même arbre d'index.
- **L'arbitre peut rendre NO-GO même si les deux autres ont dit GO.**
- Tout NO-GO → correction → nouvelle passe de tous les relecteurs concernés, sur la nouvelle version de l'index.
- **Toute** modification de l'index après un GO, quel qu'il soit, invalide les validations : passe courte de Codex
  **et** de l'auditeur sur le delta, **puis** nouvel audit de clôture de l'arbitre sur le diff complet du nouvel
  index. Jamais une passe de l'arbitre seul.
- Relecteur indisponible : **aucun commit, quoi que dise l'arbitre**. L'arbitre est saisi (diagnostic, relance) ;
  s'il faut changer cette règle pour avancer → F4.
- Arbitre indisponible (échec, modèle absent) : aucun commit, F4. NO-GO de l'arbitre non corrigé : aucun commit ;
  contesté par Claude Code : F4.
- Un bloquant ne se lève que corrigé, ou levé par l'arbitre ; le relecteur qui l'a levé repasse sur la version
  suivante ; s'il le maintient contre l'arbitre → F4.
- Version de l'arbitre : une modification de `.claude/agents/arbitre-strategique.md` n'est pas toujours rechargée
  dans la session en cours. Avant de s'appuyer sur son verdict, vérifier l'empreinte de son prompt (`systemHash` de
  `~/.claude/projects/<projet>/<session>/subagents/agent-<id>.prefix.json`) ; si elle n'a pas changé, nouvelle
  session.
- Après le commit, avant tout push : `git rev-parse HEAD^{tree}` doit être identique à l'arbre audité (skill §6), et
  `git status --porcelain` doit donner une sortie vide, à la lettre (D-REPRISE-014, règle unique de l'arbitre, §c).
  Sinon : pas de push, arbitre saisi.
- `git show --stat` figure dans le rapport final, après le commit.

### e. Question au founder — français simple, pour un founder NON technique
Formulée par l'arbitre, transmise telle quelle par Claude Code (arbitre indisponible : formulée par Claude Code, qui le
dit, §b) :
- **Ce qui bloque** : une ou deux phrases, sans jargon (ou jargon expliqué), et la catégorie F1–F4.
- **Les options** : 2 à 3, numérotées.
- **Impact de chaque option** : sur le jeu, les joueurs, le coût, le délai, ce qui est réversible ou non.
- **Recommandation** : laquelle, et pourquoi en une phrase.
Les actions F3 sont une question oui / non, regroupée quand c'est possible.

### f. Rapport de clôture d'une sous-étape — français simple
1. **Ce qui a été fait et pourquoi.**
2. **Verdicts BRUTS** des deux relecteurs (mode ticket, mode diff et chaque passe courte), de l'arbitre (audit de
   clôture et chaque arbitrage), puis l'arbitrage point par point.
3. **Play** : capture + console brute (ou « non applicable »).
4. **`git show --stat`** du commit, et l'égalité arbre audité = arbre du commit.
5. **Risques résiduels.**
6. **COMMENT ANNULER** : la commande exacte. Par défaut `git revert <sha>` (crée un commit inverse, sans rien
   perdre). Jamais `git reset --hard` : il efface aussi toutes les modifications non commitées.

**Résumé d'arbitrages d'étape** : à la clôture de chaque étape, `docs/sessions/<date>-etape-N-arbitrages.md`, une
page au plus. C'est la pièce que le founder apporte à Claude.ai pour l'audit indépendant de l'étape. Contenu :
- décisions prises sans le founder (une ligne chacune, avec l'ID) ;
- libellés courts décidés par l'arbitre — condition posée par le founder (D-REPRISE-012, §b) : « à condition d'être
  listés dans le résumé d'étape » ; forme (précision de Claude Code) : texte et endroit de chaque libellé ;
- TD ouvertes ou fermées ;
- questions F1/F2 en attente ; actions F3 à autoriser ;
- **jauge Phase 1** : étapes de la boucle faites et restantes, et TD « avant tout testeur externe » encore ouvertes.
  Définition de la Phase 1 citée de `docs/references/guilds-empires-vision-v1.md` (§13, « Phase 1 — Empire ») et de
  `docs/architecture/phase-1-technical-implementation.md`, jamais inventée. Quand tout est vert : escalade F1
  (périmètre de la Phase 2) ;
- **signal skill** : nouveau domaine non couvert par les skills, ou même type d'erreur relevé deux fois ; sinon
  « aucun » ;
- **coût de coordination** : pour chaque sous-étape, nombre de passes de revue (par relecteur), de NO-GO et
  d'escalades.

### g. Push (D-REPRISE-009)
Règle du founder (2026-11-03), telle quelle : « Push normal sur la branche de travail autorisé après les trois GO et la vérification de l'arbre. Restent en F3 : merge vers main, force-push ou réécriture d'historique, suppression de branche distante. »
Précisions d'application (Claude Code ; toutes vers plus de prudence par rapport à la décision citée) :
- **Branche de travail** : la branche courante de la sous-étape (aujourd'hui `feature/bootstrap-architecture`),
  **jamais `main`** ; un push direct sur `main` est assimilé au merge vers `main` (F3).
- Avant le push : la plage `origin/<branche>..HEAD` ne contient que des commits qui ont chacun reçu les trois GO et la
  vérification de l'arbre (§d) ; sinon, pas de push, arbitre saisi. Premier push d'une branche (pas encore de
  `origin/<branche>`) : plage `origin/main..HEAD`, ou arbitre saisi en cas de doute. Et `git status --porcelain` :
  sortie vide, à la lettre (D-REPRISE-014, règle unique de l'arbitre, §c, §d) ; sinon, pas de push, arbitre saisi.
- Un push qui déclencherait un déploiement (workflow ajouté plus tard) reste F3, au titre du déploiement.
- Suppression d'une branche locale dont les commits ne sont poussés nulle part : arbitre.
- Jusqu'au lot de retouches du corps de l'arbitre (briefings, « Prochaine retouche »), chaque saisine d'audit de
  clôture rappelle « push normal autorisé (D-REPRISE-009) » : le corps de l'agent range encore le push en F3. Ce
  rappel est retiré quand le lot est appliqué. De même, jusqu'à ce lot, chaque saisine d'audit de clôture rappelle le
  contrôle `git status --porcelain` en citant la règle unique de l'arbitre (§c, D-REPRISE-014), sans autre
  formulation : le corps de l'agent ne le prévoit pas encore.

### h. Sessions : orchestrateur et exécutant (D-REPRISE-011)
Décision du founder (2026-11-03, garde-fou resserré), règle d'origine citée telle quelle : « Une session = une
sous-étape. À la fin de chaque sous-étape : relais écrit dans le briefing, push, puis arrêt avec la phrase de relance
standard. Rien de durable ne vit seulement dans la conversation ou la mémoire de session : tout va dans le dépôt. Une
sous-étape qui paraît trop grosse pour une session est découpée avant de commencer. » Complément du founder, cité tel
quel : « **La session principale ne fait qu'orchestrer** : lecture du briefing, puis chaque sous-étape est confiée à
un **sous-agent « exécutant » neuf** (contexte vierge) qui implémente, teste et s'arrête avant le commit. La session
principale lance les revues (Codex, auditeur, arbitre), commite, pousse, et passe à la sous-étape suivante. » ; « Les
diffs et sorties volumineuses sont transmis par fichier, jamais recopiés dans le contexte principal. » ; « Relance
d'une nouvelle session principale **une fois par étape**, avec la phrase standard. » Faisabilité vérifiée le
2026-11-03 (journal, D-REPRISE-011) : ce schéma remplace « une session = une sous-étape » ; deux règles sont gardées
telles quelles : « Rien de durable ne vit seulement dans la conversation ou la mémoire de session : tout va dans le
dépôt. » et « Une sous-étape qui paraît trop grosse […] est découpée avant de commencer. »
Relance de session par Claude Code (D-REPRISE-013, 2026-11-03, F4, garde-fou). Question du founder, citée telle
quelle : « Est-ce que en fin d'étape comme la, tu es capable d'ouvrir une session enfant au Projet dans claude code
"Guilds-and-Empires"  pour relancer toi même le tickets dans une nouvelle session lié a ce dossier ? » Décision du
founder, citée telle quelle : « On fait comme ça a partir de maitenant, tu mets a jour le garde fou et lance la
nouvelle session enfant. » Elle approuve la réponse de Claude Code citée en entier au journal (D-REPRISE-013) et
révise D-REPRISE-011 sur la relance seulement.
Phrase de relance standard (founder) : « Nouvelle session — reprends depuis le briefing : sous-étape suivante. »
Claude Code la donne lui-même comme seule consigne de la session qu'il ouvre.
Relance sans question (D-REPRISE-014, 2026-11-04, F4, garde-fou). Décision du founder, citée telle quelle : « Ne me
repose plus jamais la question « où lancer ». » ; « Ne me propose pas de l'ouvrir à la main. »
Précision de Claude Code : Claude Code ouvre lui-même la session enfant, sans question au founder, à chaque relance ;
en 19.5, la session ouverte enchaîne 19.5a → 19.5d puis prépare la demande regroupée. Outil absent, bloqué ou
refusé → Claude Code écrit le blocage exact, sur le seul texte du founder (« autorisation demandée », « outil
absent : … », ou le texte exact du refus de la plateforme, dont la limite qui réserve le démarrage direct d'une
session à une demande écrite de l'utilisateur dans la session), et ne propose rien d'autre : ni carte de
proposition, ni ouverture manuelle ; puis il s'arrête, sans autre action.
Précisions d'application (Claude Code ; relues en revue croisée) :
- **Orchestrateur** (session principale) : lit le briefing ; §a.1–§a.2 (ticket, revue du ticket), §a.6–§a.8 (revue
  du diff, audit de clôture, commit, contrôle de l'arbre), push (§g), relais écrit dans un chemin versionné (puce
  « Relais ») ; sous-étape suivante. Il ne lit pas le code en détail et ne recopie aucun diff volumineux.
- **Exécutant** (sous-agent `general-purpose` neuf par sous-étape) : reçoit le ticket par chemin de fichier ; §a.3–§a.5
  (implémentation, tests backend sur émulateur, compilation Unity, EditMode, Play) ; écrit son rapport et ses sorties
  dans `.claude/instantanes/executant/` (non versionné, jamais sous `Assets/` ni `.revue-croisee/` ; pièces de
  travail : ce qu'elles contiennent de durable est versé dans le commit, puce « Relais »), et aucune capture ne reste
  sous `Assets/` ; ne touche ni à l'index ni à git (ni `git add`, ni commit, ni push) ; ne lance ni les relecteurs
  ni l'arbitre. Une commande refusée (il est non interactif), une clause STOP ou un point F1–F4 l'arrête :
  il le consigne et rend la main, sans contournement. Le Play de preuve reste soumis au puits actif (briefing,
  « Jouer le client sur les émulateurs »). Une correction demandée par un relecteur ou l'arbitre lui est renvoyée (le
  même, repris par message, ou un neuf).
- **Fichiers** : diffs et sorties volumineuses transmis par chemin et sha1 (relecteurs : skill `revue-croisee` §3 ;
  arbitre : §c).
- **Relais (D-REPRISE-014, précision de Claude Code)** : un relais, et toute pièce durable, est écrit dans un chemin
  versionné — dans le briefing, ou sous `docs/sessions/relais-<sous-étape>.md` — jamais sous `.claude/` (ignoré par
  git), et commité avec la sous-étape qui le produit ; retour à la règle d'origine de D-REPRISE-011 (« relais écrit
  dans le briefing »). Le rapport de l'exécutant et les pièces de revue sous `.claude/instantanes/` restent des pièces
  de travail : tout ce qu'ils contiennent de durable (reports, coût de coordination, arbitrages) est versé dans le
  commit de la sous-étape.
- **Relance (D-REPRISE-013, D-REPRISE-014)** : nouvelle session principale à la fin d'une étape, ou relance décidée
  par le founder ; ouverte par Claude Code sans question au founder (blocage : ci-dessus). Ordre : trois GO, commit
  du relais, vérification de l'arbre, push, rapport de clôture remis au founder, puis ouverture. Session liée, même
  dossier, sans worktree, phrase standard pour seule consigne, contexte vierge. Lien donné au founder, qui garde la
  main. Précision de Claude Code (resserrement) : la session parente cesse toute
  action sur le dépôt et n'envoie aucun message à la session enfant. En relance d'étape, « sous-étape suivante »
  désigne la première sous-étape de l'étape suivante dans le briefing ; relance en milieu d'étape → sous-étape
  suivante de la même étape (19.4c-2).
- **Mémoire** : la règle « rien de durable… » couvre aussi la mémoire automatique du projet
  (`~/.claude/projects/…/memory/`), simple aide-mémoire : tout fait durable qui y figure est aussi dans le dépôt.
- **Découpage** : une sous-étape trop grosse pour le contexte d'un exécutant (repère : 19.4b ≈ 140 000 jetons côté
  exécution) est découpée avant de commencer.

## Pilotage de l'Éditeur Unity — installation obligatoire (D-REPRISE-006)

« Outil de pilotage : activer "Ensure editor runs in background in PlayMode" et couper la consigne permanente. Fichier local non suivi, à refaire sur tout nouveau poste. »
Réglage : Project Settings > Pipeline > Editor, case « Ensure editor runs in background in PlayMode » ; consigne permanente coupée par `unity command editor.playmode.set_run_in_background --enable false`. Contrôle dans `ProjectSettings/Packages/com.unity.pipeline/EditorPipelineConfig.json` : `m_RunInBackgroundInPlayMode: true`, `m_RunInBackgroundCommandOverride: false`. Ne jamais relancer `set_run_in_background --enable true` : `runInBackground` reste à 0 dans le projet (effet sur Android).
