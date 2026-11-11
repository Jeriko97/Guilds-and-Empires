---
name: revue-croisee
description: Revue croisée indépendante de Guilds & Empires par deux relecteurs read-only (sous-agent `auditeur` + Codex CLI), puis audit de clôture par l'arbitre stratégique. Mode "ticket" avant d'implémenter une sous-étape, mode "diff" avant le commit. Utiliser à chaque sous-étape du mode autonome supervisé (CLAUDE.md).
---

# Revue croisée — auditeur (Claude) + Codex, clôture par l'arbitre

Deux relecteurs relisent **le même contenu**, **en parallèle**, **sans voir l'avis l'un de l'autre**
ni le raisonnement de l'exécutant. Claude Code trie ensuite leurs remarques (§5) ; l'arbitre stratégique
(`.claude/agents/arbitre-strategique.md`) tranche les bloquants que Claude Code ne corrige pas et les désaccords,
puis rend l'audit de clôture sur l'index exact du commit (§6). Une seule passe par mode, sauf la
« passe courte » sur toute modification faite après le dernier GO (§5).

**Toute revue se fait dans un worktree dédié** — décision du founder (2026-11-08, F4, garde-fous ; journal,
D-REPRISE-017), citée telle quelle : « **Toute revue (Codex, auditeur, arbitre) se fait dans un worktree dédié**, créé à partir de l'arbre exact de l'index audité, ouvert dans un dossier hors du dépôt de travail. Le dossier de l'exécutant, les relais et `.revue-croisee/` n'existent pas dans ce worktree. Codex est lancé avec ce worktree comme seul répertoire de travail. » ; « Le filtre de lecture (TD-031) reste en place pour les agents Claude, en complément. »
Décision du founder sur la preuve (2026-11-08, F4, option 1), citée telle quelle : « Option 1. Pour Codex, la preuve exigée devient "n'a pas lu", contrôlée par l'analyse automatique de son journal après chaque relecture. Toute commande visant un chemin hors de la copie de revue → relecture écartée et refaite par un Codex neuf. Pour les relecteurs Claude, la preuve "ne peut pas lire" par le filtre reste exigée. »
Lecture de l'arbitre (2026-11-08, Q1 ; contestable par le founder au résumé d'arbitrages de l'étape 19) : « les
relais » désigne les pièces hors index (relais non commités, dossier de notes partagé des sessions) ; un relais
versionné qui fait partie de l'index audité est dans le worktree et relu comme le reste du diff.

**Écritures protégées préparées hors des fichiers protégés** — consigne 1 du founder (2026-11-10, D-REPRISE-017),
citée telle quelle : « 1. **N'écris plus aucun fichier protégé modification par modification.** Le développement du hook se fait dans un dossier de travail non protégé (par exemple `.claude/hooks-dev/`, ignoré par git), testé là. Quand c'est fini et revu : une seule copie vers `.claude/hooks/`, donc une seule « autorisation demandée ». Même règle pour CLAUDE.md, les agents et les réglages. Inscris-le dans le relais. »
Application (arbitrage de l'arbitre du 2026-11-11, Q4) : l'exécutant prépare les fichiers protégés complets dans
`.claude/hooks-dev/<sous-étape>/<chemin du fichier>` et y lance les tests ; l'arbre relu est construit par
l'orchestrateur avec un index temporaire (`GIT_INDEX_FILE` distinct ; admis : `git read-tree HEAD` sans `-u`,
`git hash-object -w`, `git update-index --add --cacheinfo`, `git write-tree`, `git commit-tree` non référencé ;
interdits : `--work-tree=`, `checkout`, `read-tree -u`, `reset`) ; au GO des deux relecteurs, une seule série
d'écritures protégées (« autorisation demandée »), `git add`, puis `git write-tree` identique à l'arbre qui a reçu le
GO ; une retouche d'un fichier protégé exigée ensuite → nouvelle série, puis passe courte des deux (§5).
`.claude/hooks-dev/` fait partie du dossier de l'exécutant élargi : il est déplacé avec lui pendant chaque passe
(§1) et c'est un dossier interdit du filtre de lecture.

## Constantes
```bash
REPO="G:/Unity/GuildsAndEmpires"
OUT="$REPO/.revue-croisee"     # non versionné (.gitignore) : sorties de Codex (-o, journal), captures de l'index
REVUES="G:/Unity/_revues/GuildsAndEmpires"         # racine des worktrees de revue, hors du dépôt, non versionnée
HORS_REVUE="G:/Unity/_hors-revue/GuildsAndEmpires" # destination constante du dossier de l'exécutant pendant une passe
EXECUTANT="$REPO/.claude/instantanes/executant"
HOOKS_DEV="$REPO/.claude/hooks-dev"                         # fichiers protégés préparés (consigne 1), ignoré par git
CONTROLE="$REPO/.claude/hooks/controle-journal-codex.js"   # contrôle du journal de Codex (script, pas un hook)
# Codex n'est pas dans le PATH : chemin absolu du CLI fourni avec l'application Codex.
CODEX="/c/Users/romai/AppData/Local/OpenAI/Codex/bin/f71a721e0e6193a9/codex.exe"
```
Si `$CODEX` n'existe plus (mise à jour de l'application : le dossier haché change), prendre le plus récent
(`ls -t /c/Users/romai/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1`), l'utiliser, et le signaler
dans le rapport (« chemin Codex du skill à mettre à jour »).
`$REVUES` et `$HORS_REVUE` sont propres à ce poste ; `$HORS_REVUE` et les dossiers de sessions sont des dossiers
interdits du filtre de lecture (`.claude/hooks/arbitre-lecture.js`, TD-031). Jamais le dossier temporaire de la
session comme destination (son chemin est donné aux sous-agents).

## 1. Préparer le contenu (une seule source pour les deux relecteurs)
`mkdir -p "$OUT"`, puis selon le mode :

- **Mode ticket** — écrire le ticket dans `$OUT/ticket.md` : objectif, fichiers du périmètre, hors périmètre,
  critères d'acceptation, valeurs économiques touchées (« aucune » ou liste explicite). Arbre relu : `HEAD`.
- **Mode diff** — stager UNIQUEMENT les fichiers de la sous-étape (le working tree peut contenir autre chose),
  puis montrer aux relecteurs exactement cet index :
  ```bash
  FICHIERS=(chemin1 chemin2 ...)   # périmètre exact du futur commit
  rm -f "$OUT/tree" "$OUT/go.tree" "$OUT/prev.tree"   # au début du mode diff de CHAQUE sous-étape
  git -C "$REPO" diff --cached --name-only   # staging antérieur ? non vide et hors FICHIERS : s'arrêter et le
                                             # signaler dans le rapport (il serait perdu à la ligne suivante)
  git -C "$REPO" reset -q          # remet l'index à HEAD, working tree intact ; tout staging antérieur
                                   # (même partiel, `git add -p`) est perdu
  git -C "$REPO" add -- "${FICHIERS[@]}"
  git -C "$REPO" diff --cached --name-only   # doit lister FICHIERS, et rien d'autre
  git -C "$REPO" write-tree > "$OUT/tree"    # identifiant exact de la version relue
  git -C "$REPO" diff --cached --binary --no-textconv > "$OUT/diff.patch"
  ```
  `-C "$REPO"` sur CHAQUE commande git. Ne plus toucher l'index jusqu'aux verdicts. `diff.patch` reste la capture
  exacte de l'index ; il n'est pas le fichier envoyé aux relecteurs (fichier commun, ci-dessous).

**Fichier commun** (même fichier, même sha1 pour les deux relecteurs, dans les deux cas : collage et fichier
volumineux) : en tête, la phrase fixée par l'arbitrage de l'arbitre du 2026-11-11 (Q5, D-REPRISE-017), mot pour mot,
puis le contenu relu ; la consigne commune (§2) reste mot pour mot :
```bash
{ cat <<'PHRASE'
Pour lire l'arbre relu, utilise seulement des chemins relatifs à sa racine. Toute commande qui contient un chemin absolu hors de l'arbre relu, `~`, une variable d'environnement, `..`, ou l'un des noms `.revue-croisee`, `instantanes/executant`, `_hors-revue`, `hooks-dev`, `side-session-notes` écarte ta relecture, même à l'intérieur d'un motif de recherche.
PHRASE
  echo; cat "$OUT/<ticket.md|diff.patch|delta.patch>"; } > "$OUT/contenu-<mode>.md"
sha1sum "$OUT/contenu-<mode>.md"       # sha1 transmis aux relecteurs : celui du fichier commun
```
Cette phrase s'adresse à Codex seul. L'auditeur et l'arbitre, sans terminal, suivent la désignation du worktree
(« Lis les fichiers versionnés par leurs chemins absolus dans cet arbre », §3 et §6) et ne la prennent pas pour une
consigne de lecture. `diff.patch` reste distinct du fichier commun. Abandonné (consigne 2) : la phrase des commandes
admises produite par le script (`--liste`).

**Préparer la passe** (avant CHAQUE passe de revue : mode ticket, mode diff, passe courte, audit de clôture ;
ticket L1, arbitrages du 2026-11-08) :
```bash
SOUS_ETAPE="<sous-étape>"; ID="$SOUS_ETAPE-<mode>-<n>"     # identifiant de passe, unique
ls -A "$REVUES" 2>/dev/null           # racine des revues : doit être vide ; sinon, pour chaque worktree restant :
                                      # git -C "$REPO" worktree remove --force <chemin>, puis worktree prune
rm -rf "$REPO/.claude/instantanes/cloture/"* "$REPO/.claude/instantanes/revue/"*   # vidés avant chaque passe ;
                                      # les pièces de la passe (fichier volumineux, pièces de clôture) y sont copiées ensuite
git -C "$REPO" ls-files --others --exclude-standard   # doit être vide : aucun relais ni pièce non commitée
                                                      # lisible ; sinon, la pièce part avec le dossier de l'exécutant
mkdir -p "$HORS_REVUE/$SOUS_ETAPE"
ls -d "$HORS_REVUE/$SOUS_ETAPE/executant" "$HORS_REVUE/$SOUS_ETAPE/hooks-dev" 2>/dev/null   # doit être vide
                                      # (destinations absentes) ; sinon (passe précédente interrompue ?) STOP →
                                      # arbitre : le mv rangerait le dossier dedans
[ -d "$EXECUTANT" ] && mv "$EXECUTANT" "$HORS_REVUE/$SOUS_ETAPE/executant"   # dossier de l'exécutant hors du dépôt
[ -d "$HOOKS_DEV" ] && mv "$HOOKS_DEV" "$HORS_REVUE/$SOUS_ETAPE/hooks-dev"   # et son dossier de travail (consigne 1)
# Arbre relu : mode diff et passe courte → $OUT/tree ; audit de clôture → $OUT/go.tree ;
# mode ticket → ARBRE="$(git -C "$REPO" rev-parse 'HEAD^{tree}')"
ARBRE="$(cat "$OUT/tree")"
git -C "$REPO" ls-tree -r "$ARBRE" | grep '^120000' # doit être vide (aucun lien symbolique) ; sinon STOP → arbitre
COMMIT="$(git -C "$REPO" commit-tree "$ARBRE" -p HEAD -m revue)"   # commit technique : aucune branche ni
                                                                   # référence créée ou déplacée ; mode ticket : HEAD
WT="$REVUES/$ID"
git -C "$REPO" worktree add --detach "$WT" "$COMMIT"   # mode ticket : git -C "$REPO" worktree add --detach "$WT" HEAD
```
Les fichiers ignorés (`.claude/instantanes/`, `.revue-croisee/`, relais non commités) n'existent pas dans le worktree
par construction. Aucune pièce portant un verdict n'est écrite sous `$REVUES` : contenus et pièces restent dans
`$OUT`, `.claude/instantanes/revue/` ou `.claude/instantanes/cloture/` (dépôt principal), jamais dans le worktree.

**Après la passe** (verdicts reçus, contrôle du journal fait, §3) :
```bash
git -C "$REPO" worktree remove --force "$WT"; git -C "$REPO" worktree prune
ls -d "$EXECUTANT" "$HOOKS_DEV" 2>/dev/null   # doit être vide (dossiers absents du dépôt) ; sinon STOP → arbitre :
                                      # le mv rangerait le dossier remis à l'intérieur
[ -d "$HORS_REVUE/$SOUS_ETAPE/executant" ] && mv "$HORS_REVUE/$SOUS_ETAPE/executant" "$EXECUTANT"   # remis
[ -d "$HORS_REVUE/$SOUS_ETAPE/hooks-dev" ] && mv "$HORS_REVUE/$SOUS_ETAPE/hooks-dev" "$HOOKS_DEV"   # remis
```
L'objet du commit technique, sans référence, est laissé au ramasse-miettes de git ; il n'est jamais poussé.

## 2. Consigne commune (texte IDENTIQUE pour les deux)
```
Revue croisée — mode <ticket|diff>. Le contenu à relire est joint à la fin de cette consigne.
Fais ta Tâche 0, applique ta grille, rends UNIQUEMENT la sortie imposée (BLOQUANT / NON BLOQUANT / VERDICT).
Ne modifie aucun fichier.
```
N'y ajoute ni ton raisonnement, ni ce que tu crois correct, ni l'avis de l'autre relecteur.
C'est l'orchestrateur qui capture le contenu (étape 1) et le **joint** : l'auditeur n'a ni Bash ni git.

## 3. Lancer les deux relecteurs dans le MÊME message (en parallèle)
- **Auditeur** : outil Agent, `subagent_type: "auditeur"` (outils : Read, Grep, Glob). Prompt = la consigne
  commune, puis, entre `<contenu>` et `</contenu>`, la désignation du worktree, texte exact :
  « Arbre relu : <chemin absolu du worktree>. Lis les fichiers versionnés par leurs chemins absolus dans cet arbre. »
  suivie du fichier commun `$OUT/contenu-<mode>.md` collé **intégralement et sans retouche** (le lire avec Read
  juste avant). Rien d'autre ne s'ajoute.
  Son dossier de travail est celui de la session (racine du dépôt principal ; champ `cwd` des entrées du hook) : ses
  lectures par chemin relatif s'y résolvent, et en mode diff le dépôt de travail peut différer de l'index relu, d'où
  la seconde phrase de la désignation (pas de limitation générale de la lecture au worktree, arbitrage Q3).
  Le filtre de lecture du projet (`.claude/hooks/arbitre-lecture.js`, commun à l'auditeur et à l'arbitre, TD-031)
  refuse les sorties des relecteurs, le dossier de l'exécutant, `$HORS_REVUE`, le dossier des avis anciens
  (`archives/avis-relecteurs/`, à toute profondeur), les transcriptions et dossiers temporaires des sessions, les
  dossiers d'état de Claude Code et de Codex (`C:/Users/romai/.claude`, `C:/Users/romai/.codex`), et tout Glob ou
  Grep dont la racine est le dépôt principal ou un de ses parents, la racine des revues du projet
  (`G:/Unity/_revues/GuildsAndEmpires`, `$REVUES`) ou un de ses parents (arbitrage de l'arbitre du 2026-11-11, B2,
  D-REPRISE-018), ou la racine d'un arbre qui contient le dossier des avis anciens (worktree de revue compris) : son
  message de refus guide vers un `path` précis, sous-dossier de cet arbre (`docs`, `.claude/hooks`…).
  **Contenu volumineux** (fichier qu'on ne peut pas lire en un seul `Read` sans découpage) — règle du founder
  (D-REPRISE-011) : « Les diffs et sorties volumineuses sont transmis par fichier, jamais recopiés dans le contexte
  principal » ; conditions de l'arbitrage du 2026-11-03 :
  - le fichier commun est copié dans `.claude/instantanes/revue/` (non versionné, vidé avant chaque passe, ne
    contenant que le contenu à relire), jamais désigné dans `.revue-croisee/` ; sha1 identique au fichier passé à
    Codex sur stdin ;
  - la consigne commune (§2) reste mot pour mot, « joint à la fin de cette consigne » compris ; entre `<contenu>` et
    `</contenu>`, après la désignation du worktree, seule la désignation du fichier change : chemin, sha1, et
    l'obligation de lire le fichier ENTIÈREMENT (découpage `offset`/`limit`) avant tout verdict ;
  - après le verdict, l'orchestrateur relève dans la transcription de l'auditeur que ses lectures couvrent tout le
    fichier et qu'aucune sortie Codex ni aucun fichier de `.claude/instantanes/executant/` n'a été lu (le filtre les
    refuse ; la transcription le confirme), et le consigne au rapport (TD-032).
  En deçà, le collage intégral reste la règle.
  **Règle d'invalidation** (item (g) du lot unique, comme pour l'arbitre, §6, « Audit contaminé ») : contrôle de
  lecture de l'auditeur en échec — lectures qui ne couvrent pas tout le fichier commun transmis par fichier (cas
  « Contenu volumineux »), ou lecture **aboutie** d'une sortie Codex, du dossier de l'exécutant ou d'un dossier
  interdit du filtre — → verdict invalidé, relance de l'auditeur dans un contexte neuf. Une tentative refusée par le
  filtre n'est pas un échec : elle est consignée au rapport.
- **Codex** : outil Bash, `run_in_background: true` — le même fichier commun passé sur stdin, le worktree comme seul
  répertoire de travail :
  ```bash
  "$CODEX" exec --sandbox read-only --ephemeral \
    -c model_reasoning_effort='"high"' \
    -C "$WT" -o "$OUT/codex-<mode>.md" \
    "<consigne commune>" < "$OUT/contenu-<mode>.md" > "$OUT/codex-<mode>.log" 2>&1; echo "EXIT=$?"
  ```
  - Avant de lancer Codex : arbre relu sans entrée de mode `120000` (§1) ; sinon STOP → arbitre.
  - `--sandbox read-only` : Codex ne peut rien écrire ; il peut lire hors du worktree (TD-039), d'où le contrôle du
    journal ci-dessous. Il lit `AGENTS.md` (sa grille, versionnée, présente dans le worktree) automatiquement.
  - `--ephemeral` : Codex n'écrit pas la transcription de la passe sous `C:/Users/romai/.codex/` (TD-031).
  - `-c model_reasoning_effort="high"` : effort élevé pour CET appel seulement. Ne jamais toucher `~/.codex/`.
  - stdin : Codex ajoute le fichier à la consigne dans un bloc `<stdin>`. Ne jamais laisser stdin ouvert
    (il attend) ni piper sa sortie dans `head` (coupe le flux → exit 101).
  - `-o` : le dernier message (le verdict) est écrit dans `codex-<mode>.md` — c'est CE fichier qui est collé brut.
  - **Contrôle du journal après chaque passe Codex** (décision du founder du 2026-11-08, option 1, citée en tête) :
    ```bash
    node "$CONTROLE" "$OUT/codex-<mode>.log" "$WT"; echo "CODE=$?"
    ```
    Sortie brute consignée au rapport. La règle (recherche de texte, conservatrice) est écrite en tête du script,
    qui fait foi ; elle n'est pas recopiée ici (consigne 2 du founder du 2026-11-10 et arbitrage de l'arbitre du
    2026-11-11, D-REPRISE-017). Code 0 : aucune commande signalée. Code 1 : au moins une commande qui contient l'un
    des textes de la règle (dont tout chemin vers `.revue-croisee/` ou `.claude/instantanes/executant/`) → relecture écartée, refaite par un Codex neuf, sur le même fichier commun ; le verdict
    écarté n'est ni lu ni collé ; faux positifs acceptés. Règle de convergence (arbitrage de l'arbitre du 2026-11-09
    sur la convergence, condition 6, D-REPRISE-017) : un code 1 n'est jamais traité par l'orchestrateur en modifiant
    le contrôle ; une fausse alerte supposée → arbitre saisi avant toute modification. Liste des formes close
    (arbitre, 2026-11-11, Q1.3), citée : « après cet arbitrage, aucune autre forme n'est ajoutée au contrôle, par
    personne, pour quelque raison que ce soit. Une forme nouvelle rencontrée ensuite n'est pas un bloquant (Q2) et va
    dans TD-039. » Code 2 (échec fermé : journal illisible ou vide, aucun en-tête de bloc reconnu, bloc exec
    incomplet, version de Codex absente ou non validée, ligne `sandbox: read-only` absente du préambule) → relecture
    non retenue, arbitre saisi avec la sortie brute du contrôle, pas de relance (confirmé par l'arbitre, arbitrage du
    2026-11-09, D-REPRISE-017 : l'orchestrateur ne décide pas seul de relancer ni de corriger le script). Version de
    Codex non validée : procédure de TD-039 (relevé de structure de la nouvelle version, arbitre, écriture protégée).
    Limite : arbitrage du 2026-11-11, Q3, citée en tête du script (TD-039).
  - **Critère de bloquant des revues du contrôle** (arbitrage de l'arbitre du 2026-11-11, Q2), cité tel quel :
    « Une forme d'évasion que la recherche de texte ne détecte pas (chemin construit par variable, concaténation, encodage, programme qui lit en interne) n'est pas un bloquant de revue : la règle est fixée par la consigne 2 du founder (D-REPRISE-017 : « on n'ajoute plus de cas de syntaxe ») ; elle est inscrite dans TD-039 comme risque résiduel. Seul l'arbitre peut juger la règle insuffisante, et il le dit au founder en F4. Est un bloquant : une commande qui contient l'un des textes de la règle et que le script, tel qu'écrit, ne signale pas ; **ou un bloc `exec` présent dans le journal que le script n'analyse pas** (défaut d'implémentation, dans les deux cas). »
    Un relecteur qui maintient un bloquant hors de ce critère contre cet arbitrage → F4 (`CLAUDE.md` §d).

Attendre les deux notifications. Ne pas lire une sortie avant d'avoir lancé l'autre relecteur.

**Arbitre hors audit de clôture** (arbitrage d'une question, sans worktree) : avant l'appel, les mêmes déplacements
qu'au §1, « Préparer la passe » (dossier de l'exécutant et `.claude/hooks-dev/` vers `$HORS_REVUE/$SOUS_ETAPE/`,
contrôles `ls -d` compris), sans worktree ; après le verdict, la même remise qu'au §1, « Après la passe », sans
worktree à retirer (report (1) de L1 simplifiée ; D-REPRISE-017, remarque 2 de l'arbitre). La saisine rappelle de
chercher par `path` précis (`docs`, `.claude/hooks`, `.claude/agents`, `.claude/instantanes/cloture`…), le filtre
refusant tout Glob ou Grep à la racine du dépôt (R2, arbitrage de l'arbitre du 2026-11-08, remarque 4).

## 4. Échec d'un relecteur
Codex : exit ≠ 0 ou `codex-<mode>.md` vide → une relance. Auditeur sans sortie au format imposé → une relance.
Toujours en échec → **pas de commit** : sans le GO des deux relecteurs, rien ne se commite. Claude Code saisit
l'arbitre (ancien cas 9, `CLAUDE.md` §b), avec « Codex : ÉCHEC » et les 20 dernières lignes de `codex-<mode>.log`, ou
« Auditeur : ÉCHEC » et la sortie brute de l'auditeur. **Aucun commit, quoi que dise l'arbitre** : il ne remplace
jamais le GO d'un relecteur. Si l'échec ne peut pas être levé sans changer cette règle → F4.

## 5. Tri des remarques (Claude Code) et arbitrage (arbitre stratégique)
Coller les deux sorties **brutes**, puis un tableau : point · relecteur(s) · décision · justification.
- **Accepté** → corrigé seulement si c'est dans le périmètre du ticket.
- **Non bloquant écarté ou reporté** → raison factuelle ; s'il est reporté, écrire où il est inscrit.
- **Bloquant que Claude Code ne corrige pas** (rejet, sortie du périmètre, relecteurs contradictoires, relecteur
  indisponible) → **arbitre** (`subagent_type: "arbitre-strategique"`, contexte neuf, lancé depuis la racine du
  dépôt). La consigne commence par le type d'appel (`CLAUDE.md` §c) : « arbitrage d'une question » (question, options,
  décisions applicables, extraits de doc ou de code, verdicts bruts concernés) ou « proposition de modification de
  code ou de comportement » (exposé, `git diff --cached`, résultats des tests, décisions applicables). Un bloquant ne vaut pas GO tant qu'il n'est pas corrigé ou levé par l'arbitre :
  **pas de commit** (D-REPRISE-004). Le relecteur qui l'a levé repasse sur la version suivante ; s'il maintient son
  bloquant contre l'arbitre → F4 (désaccord persistant).
- **F1–F4** (`CLAUDE.md` §b, dont la règle d'effet indirect en F1) → l'arbitre formule la question au founder.
- Chaque arbitrage entre au journal, attribué à « arbitre ».

Modifications faites APRÈS un GO — règle du founder (D-REPRISE-004, 2026-11-02, remplace D-ETAPE18-006 sur ce
point) :
« Ce qui est commité doit être identique à ce qui a reçu en dernier un GO des deux relecteurs. Ce GO peut venir de la revue du diff, d'une passe courte ou d'une passe après correction. Toute modification après ce GO, même de forme, déclenche une passe courte avant le commit. Aucune exception. »
- **Passe courte** : les deux relecteurs, mode diff, sur CE delta uniquement (version qui a reçu le dernier GO des
  deux → version à commiter), même consigne, mêmes règles que §1-§5 (worktree dédié créé sur le nouvel arbre
  `$OUT/tree`, dossier de l'exécutant déplacé, fichier commun, contrôle du journal de Codex). Doc, commentaire,
  texte affiché, style USS, coupure de ligne : aucune exception.
- Une modification issue d'une passe courte relance une passe courte sur son propre delta. Un non-bloquant peut être
  reporté (listé dans le rapport) plutôt qu'appliqué, pour ne pas relancer de passe.
- Le verdict « GO APRÈS CORRECTION » d'un relecteur n'est pas un GO : les corrections demandées passent une passe
  courte, et seul le GO de cette passe compte.
- **Figer la version du GO** : au GO des deux, la version relue est l'arbre `$OUT/tree` enregistré au §1
  (contenu montré = exactement cet index) : `cp "$OUT/tree" "$OUT/go.tree"`.
- **Passe courte** (après un GO, ou après une passe sans GO des deux) :
  ```bash
  cp "$OUT/tree" "$OUT/prev.tree"            # AVANT d'appliquer la modification
  # … appliquer la modification …
  git -C "$REPO" reset -q
  git -C "$REPO" add -- "${FICHIERS[@]}"
  git -C "$REPO" diff --cached --name-only   # doit lister FICHIERS, et rien d'autre
  git -C "$REPO" write-tree > "$OUT/tree"
  BASE="$OUT/go.tree"; [ -f "$BASE" ] || BASE="$OUT/prev.tree"
  git -C "$REPO" diff --binary --no-textconv "$(cat "$BASE")" "$(cat "$OUT/tree")" > "$OUT/delta.patch"
  grep "^diff --git" "$OUT/delta.patch"      # non vide : liste les fichiers modifiés ; vide : pas de passe
                                             # courte (l'arbre est inchangé), mais le commit n'est permis que si
                                             # cet arbre a déjà toutes les validations requises (§6)
  ```
  Départ du delta : la version qui a reçu le dernier GO des deux (`go.tree`) dès qu'il en existe un dans la
  sous-étape ; sinon (aucun GO encore, par exemple après la revue diff initiale), la version de la passe
  précédente (`prev.tree`). À son GO des deux : `cp "$OUT/tree" "$OUT/go.tree"`.
- **Reprise de main après une relance de l'exécutant pour une correction** (audit de clôture de L2a, arbitre,
  2026-11-11) : avant toute autre action, l'index qui a produit `$OUT/tree` doit redonner `$OUT/tree` (arbre noté
  avant la relance) — index principal préparé : `git -C "$REPO" write-tree` ; index temporaire des fichiers
  protégés : `GIT_INDEX_FILE=<index temporaire> git -C "$REPO" write-tree` ; sinon arrêt → arbitre.
Les verdicts bruts de chaque passe courte figurent dans le rapport de clôture, avec leur arbitrage.

## 6. Audit de clôture (arbitre) et commit
Après le GO des deux relecteurs (`go.tree`), sur ce même index :
```bash
git -C "$REPO" write-tree                  # doit être identique à go.tree
git -C "$REPO" diff --cached --binary --no-textconv > "$OUT/cloture.patch"
git -C "$REPO" status --porcelain          # sortie brute : pièce de l'audit de clôture (D-REPRISE-014)
```
Index qui touche le dossier des avis anciens (`archives/avis-relecteurs/`) : `cloture.patch` de l'arbitre est pris
par `git -C "$REPO" diff --cached --binary --no-textconv -- . ':!archives/avis-relecteurs' > "$OUT/cloture.patch"`,
et chaque fichier exclu est désigné dans sa saisine (chemin, statut, blob, taille ; liste complète
`git diff --cached --name-only`) selon `CLAUDE.md` §c, qui fait foi (arbitrage de l'arbitre du 2026-11-11, Q3,
D-REPRISE-018) ; l'auditeur et Codex reçoivent, eux, le diff complet.
Contrôle `git status --porcelain` — règle du founder (D-REPRISE-014, 2026-11-04), citée telle quelle :
« Ajoute à l'audit de clôture de l'arbitre et à la vérification avant push un contrôle obligatoire : `git status --porcelain` doit être vide, en dehors des dossiers ignorés. Sinon, NO-GO. »
Règle unique de l'arbitre (arbitrage du 2026-11-04, D-REPRISE-014 ; `CLAUDE.md` §c), citée telle quelle :
« Application avant le commit (arbitre, 2026-11-04, précision d'application de D-REPRISE-014 ; contestable par le founder au résumé d'arbitrages de l'étape 19) : à l'audit de clôture, l'index préparé est par construction non vide ; le contrôle se lit donc « en dehors des fichiers de l'index préparé (`git diff --cached --name-only`) et des dossiers ignorés, `git status --porcelain` doit être vide » : aucune ligne `??` (`git ls-files --others --exclude-standard` vide), aucune ligne dont la 2ᵉ colonne est non vide (`git diff --name-only` vide) ; chaque ligne restante est un fichier de `git diff --cached --name-only`. Pièce absente ou contrôle échoué → NO-GO. Après le commit, avant le push : sortie vide, à la lettre (§d, §g). »
- **Arbitre** : outil Agent, `subagent_type: "arbitre-strategique"`, contexte neuf, lancé depuis la racine du dépôt,
  dans un worktree dédié créé sur `go.tree` (§1, « Préparer la passe » ; retiré après l'audit).
  Pièces obligatoires, collées intégralement : le rapport de la sous-étape (sans `git show --stat`, qui n'existe
  qu'après le commit, et sans ses sections de verdicts bruts et d'arbitrage, `CLAUDE.md` §f point 2), les décisions
  applicables (ID et texte), les résultats des tests, `cloture.patch` (diff complet de l'index, hors dossier des avis
  anciens quand l'index le touche, ci-dessus), la sortie brute de `git status --porcelain` (ci-dessus ; pièce
  absente ou contrôle échoué → NO-GO). **Jamais** les verdicts des autres relecteurs ni la recommandation de Claude
  Code. Pièce trop longue pour être collée : copiée dans
  `.claude/instantanes/cloture/` (non versionné, lisible par l'arbitre ; jamais `.revue-croisee/`, que son filtre
  refuse), dossier vidé avant chaque passe pour qu'aucune pièce d'un audit précédent n'y reste, et désignée dans la
  consigne par son chemin et son sha1. Consigne :
  ```
  Type d'appel : audit de clôture.
  Pièces jointes ci-dessous. Dépôt : <chemin absolu du worktree>. Lis les fichiers versionnés par leurs chemins absolus dans cet arbre. Rends uniquement ton format de sortie fixe.
  ```
  Son dossier de travail reste celui de la session (racine du dépôt principal) : ses lectures par chemin relatif s'y
  résolvent ; le filtre de lecture s'applique à lui comme à l'auditeur (§3).
- **Contrôle de l'appel** (TD-031) : dans sa transcription (`~/.claude/projects/<projet>/<session>/subagents/
  agent-<id>.jsonl` et `.prefix.json`), relever le modèle, l'empreinte du prompt (`systemHash`) et la liste de ses
  lectures ; aucune lecture de `.revue-croisee/` ni de `.claude/instantanes/executant/`. Le consigner au rapport.
  Audit contaminé (verdict d'un autre relecteur lu ou reçu) : invalidé et relancé dans un contexte neuf avec des
  pièces nettoyées.
- **GO** de l'arbitre → le dernier GO (D-REPRISE-004, D-REPRISE-007) est atteint : GO de Codex, de l'auditeur et de
  l'arbitre sur le même arbre.
- **NO-GO** (même si les deux relecteurs ont dit GO) → correction → passe courte de Codex **et** de l'auditeur sur
  le delta (§5, départ `go.tree`), puis nouvel audit de clôture sur le diff complet du nouvel index. Toute
  modification de l'index après un GO, quel qu'il soit, impose ces deux étapes ; jamais une passe de l'arbitre seul.
- **Commit** :
  - avant : `git -C "$REPO" write-tree` identique à l'arbre audité par l'arbitre (= `go.tree`), et
    `git -C "$REPO" diff --cached --name-only` liste FICHIERS et rien d'autre ; `git -C "$REPO" worktree list` ne
    montre aucun worktree sous `$REVUES` ; aucune branche ni référence créée par les passes (`git -C "$REPO"
    for-each-ref` inchangé) ; dossier de l'exécutant remis ; sinon, pas de commit ; et aucun dossier
    `gabarit-filtre-*` sous `$REVUES` (`ls -d "$REVUES"/gabarit-filtre-* 2>/dev/null` vide ; sinon le retirer et le
    dire au rapport ; audit de clôture de L2a, arbitre, 2026-11-11) ;
  - après : `git -C "$REPO" rev-parse HEAD^{tree}` identique à l'arbre audité, et `git -C "$REPO" status --porcelain` :
    sortie vide, à la lettre (D-REPRISE-014, règle unique ci-dessus) ; sinon, pas de push, arbitre saisi ;
  - push seulement s'il est autorisé (`CLAUDE.md` §g) ; puis `git show --stat` dans le rapport final.
