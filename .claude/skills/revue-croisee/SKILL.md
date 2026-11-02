---
name: revue-croisee
description: Revue croisée indépendante de Guilds & Empires par deux relecteurs read-only (sous-agent `auditeur` + Codex CLI). Mode "ticket" avant d'implémenter une sous-étape, mode "diff" avant le commit. Utiliser à chaque sous-étape du mode autonome supervisé (CLAUDE.md).
---

# Revue croisée — auditeur (Claude) + Codex

Deux relecteurs relisent **le même contenu**, **en parallèle**, **sans voir l'avis l'un de l'autre**
ni le raisonnement de l'exécutant. Claude Code arbitre ensuite. Une seule passe par mode, sauf la
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
  git -C "$REPO" diff --cached --name-only   # staging antérieur ? il sera perdu à la ligne suivante
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
Toujours en échec → **pas de commit** : sans le GO des deux relecteurs, rien ne se commite. L'arrêt découle de
la règle du founder (D-REPRISE-004) : il n'existe aucune autre issue. Claude Code s'arrête et escalade au
founder, avec « Codex : ÉCHEC » et les 20 dernières lignes de
`codex-<mode>.log`, ou « Auditeur : ÉCHEC » et la sortie brute de l'auditeur.

## 5. Arbitrage (Claude Code, jamais automatique)
Coller les deux sorties **brutes**, puis un tableau : point · relecteur(s) · décision · justification.
- **Accepté** → corrigé seulement si c'est dans le périmètre du ticket.
- **Rejeté** → raison factuelle (règle, fichier, test) ; un bloquant ne se rejette que preuve à l'appui.
  Un bloquant rejeté ne vaut pas GO : **pas de commit** (D-REPRISE-004). Si l'autre relecteur n'a pas levé ce
  point et a rendu GO → escalade cas 7 ; sinon → arrêt et escalade au founder au titre de D-REPRISE-004.
- **Escalade** (CLAUDE.md, liste d'escalade) → bloquant non résoluble dans le périmètre (cas 6),
  ou les deux relecteurs se contredisent sur un bloquant (cas 7), ou valeur économique touchée (cas 4).

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
  grep "^diff --git" "$OUT/delta.patch"      # non vide : liste les fichiers modifiés
  ```
  Départ du delta : la version qui a reçu le dernier GO des deux (`go.tree`) dès qu'il en existe un dans la
  sous-étape ; sinon (aucun GO encore, par exemple après la revue diff initiale), la version de la passe
  précédente (`prev.tree`). À son GO des deux : `cp "$OUT/tree" "$OUT/go.tree"`.
- **Avant le commit** : `git -C "$REPO" write-tree` doit être identique à `go.tree`, et
  `git -C "$REPO" diff --cached --name-only` doit lister FICHIERS et rien d'autre. Sinon, pas de commit.
Les verdicts bruts de chaque passe courte figurent dans le rapport de clôture, avec leur arbitrage.
