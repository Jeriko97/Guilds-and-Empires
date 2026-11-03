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

## Constantes
```bash
REPO="G:/Unity/GuildsAndEmpires"
OUT="$REPO/.revue-croisee"     # non versionné (.gitignore)
# Codex n'est pas dans le PATH : chemin absolu du CLI fourni avec l'application Codex.
CODEX="/c/Users/romai/AppData/Local/OpenAI/Codex/bin/22cfb1d302613eae/codex.exe"
```
Si `$CODEX` n'existe plus (mise à jour de l'application : le dossier haché change), prendre le plus récent
(`ls -t /c/Users/romai/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1`), l'utiliser, et le signaler
dans le rapport (« chemin Codex du skill à mettre à jour »).

## 1. Préparer le contenu (une seule source pour les deux relecteurs)
`mkdir -p "$OUT"`, puis selon le mode :

- **Mode ticket** — écrire le ticket dans `$OUT/ticket.md` : objectif, fichiers du périmètre, hors périmètre,
  critères d'acceptation, valeurs économiques touchées (« aucune » ou liste explicite).
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
  `-C "$REPO"` sur CHAQUE commande git. Ne plus toucher l'index jusqu'aux verdicts.

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
  commune, puis le contenu de `$OUT/<ticket.md|diff.patch>` collé **intégralement et sans retouche** entre
  `<contenu>` et `</contenu>` (le lire avec Read juste avant ; découper la lecture si le fichier est long).
- **Codex** : outil Bash, `run_in_background: true` — le même fichier passé sur stdin :
  ```bash
  "$CODEX" exec --sandbox read-only --ephemeral \
    -c model_reasoning_effort='"high"' \
    -C "$REPO" -o "$OUT/codex-<mode>.md" \
    "<consigne commune>" < "$OUT/<ticket.md|diff.patch>" > "$OUT/codex-<mode>.log" 2>&1; echo "EXIT=$?"
  ```
  - `--sandbox read-only` : Codex ne peut rien écrire. Il lit `AGENTS.md` (sa grille) automatiquement.
  - `-c model_reasoning_effort="high"` : effort élevé pour CET appel seulement. Ne jamais toucher `~/.codex/`.
  - stdin : Codex ajoute le fichier à la consigne dans un bloc `<stdin>`. Ne jamais laisser stdin ouvert
    (il attend) ni piper sa sortie dans `head` (coupe le flux → exit 101).
  - `-o` : le dernier message (le verdict) est écrit dans `codex-<mode>.md` — c'est CE fichier qui est collé brut.

Attendre les deux notifications. Ne pas lire une sortie avant d'avoir lancé l'autre relecteur.

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
  deux → version à commiter), même consigne, mêmes règles que §2-§5. Doc, commentaire, texte affiché, style USS,
  coupure de ligne : aucune exception.
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
Les verdicts bruts de chaque passe courte figurent dans le rapport de clôture, avec leur arbitrage.

## 6. Audit de clôture (arbitre) et commit
Après le GO des deux relecteurs (`go.tree`), sur ce même index :
```bash
git -C "$REPO" write-tree                  # doit être identique à go.tree
git -C "$REPO" diff --cached --binary --no-textconv > "$OUT/cloture.patch"
```
- **Arbitre** : outil Agent, `subagent_type: "arbitre-strategique"`, contexte neuf, lancé depuis la racine du dépôt.
  Pièces obligatoires, collées intégralement : le rapport de la sous-étape (sans `git show --stat`, qui n'existe
  qu'après le commit, et sans ses sections de verdicts bruts et d'arbitrage, `CLAUDE.md` §f point 2), les décisions
  applicables (ID et texte), les résultats des tests, `cloture.patch` (diff complet de l'index). **Jamais** les
  verdicts des autres relecteurs ni la recommandation de Claude Code. Pièce trop longue pour être collée : copiée dans
  `.claude/instantanes/cloture/` (non versionné, lisible par l'arbitre ; jamais `.revue-croisee/`, que son filtre
  refuse), dossier vidé avant chaque dépôt pour qu'aucune pièce d'un audit précédent n'y reste, et désignée dans la
  consigne par son chemin et son sha1. Consigne :
  ```
  Type d'appel : audit de clôture.
  Pièces jointes ci-dessous. Dépôt : <REPO>. Rends uniquement ton format de sortie fixe.
  ```
- **Contrôle de l'appel** (TD-031) : dans sa transcription (`~/.claude/projects/<projet>/<session>/subagents/
  agent-<id>.jsonl` et `.prefix.json`), relever le modèle, l'empreinte du prompt (`systemHash`) et la liste de ses
  lectures ; aucune lecture de `.revue-croisee/`. Le consigner au rapport. Audit contaminé (verdict d'un autre
  relecteur lu ou reçu) : invalidé et relancé dans un contexte neuf avec des pièces nettoyées.
- **GO** de l'arbitre → le dernier GO (D-REPRISE-004, D-REPRISE-007) est atteint : GO de Codex, de l'auditeur et de
  l'arbitre sur le même arbre.
- **NO-GO** (même si les deux relecteurs ont dit GO) → correction → passe courte de Codex **et** de l'auditeur sur
  le delta (§5, départ `go.tree`), puis nouvel audit de clôture sur le diff complet du nouvel index. Toute
  modification de l'index après un GO, quel qu'il soit, impose ces deux étapes ; jamais une passe de l'arbitre seul.
- **Commit** :
  - avant : `git -C "$REPO" write-tree` identique à l'arbre audité par l'arbitre (= `go.tree`), et
    `git -C "$REPO" diff --cached --name-only` liste FICHIERS et rien d'autre ; sinon, pas de commit ;
  - après : `git -C "$REPO" rev-parse HEAD^{tree}` identique à l'arbre audité ; sinon, pas de push, arbitre saisi ;
  - push seulement s'il est autorisé (`CLAUDE.md` §g) ; puis `git show --stat` dans le rapport final.
