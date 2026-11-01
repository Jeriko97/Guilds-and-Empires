---
name: revue-croisee
description: Revue croisée indépendante de Guilds & Empires par deux relecteurs read-only (sous-agent `auditeur` + Codex CLI). Mode "ticket" avant d'implémenter une sous-étape, mode "diff" avant le commit. Utiliser à chaque sous-étape du mode autonome supervisé (CLAUDE.md).
---

# Revue croisée — auditeur (Claude) + Codex

Deux relecteurs relisent **le même contenu**, **en parallèle**, **sans voir l'avis l'un de l'autre**
ni le raisonnement de l'exécutant. Claude Code arbitre ensuite. Une seule passe par mode, sauf la
« passe courte » sur le delta d'une correction de logique faite après la revue diff (§5).

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
- **Mode diff** — capturer UNIQUEMENT les fichiers de la sous-étape (le working tree peut contenir autre chose) :
  ```bash
  FICHIERS=(chemin1 chemin2 ...)   # périmètre exact du futur commit
  { git -C "$REPO" diff HEAD -- "${FICHIERS[@]}"
    git -C "$REPO" ls-files --others --exclude-standard -- "${FICHIERS[@]}" |
      while read -r f; do git -C "$REPO" diff --no-index -- /dev/null "$f"; done
  } > "$OUT/diff.patch"
  grep "^diff --git" "$OUT/diff.patch"   # chaque fichier de FICHIERS doit y figurer
  ```
  `-C "$REPO"` sur CHAQUE commande git : les chemins de `ls-files` sont relatifs au repo.

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
Codex : exit ≠ 0 ou `codex-<mode>.md` vide → une relance. Toujours en échec → poursuivre avec l'auditeur seul
et l'écrire en tête du rapport (« Codex : ÉCHEC », avec les 20 dernières lignes de `codex-<mode>.log`).

## 5. Arbitrage (Claude Code, jamais automatique)
Coller les deux sorties **brutes**, puis un tableau : point · relecteur(s) · décision · justification.
- **Accepté** → corrigé seulement si c'est dans le périmètre du ticket.
- **Rejeté** → raison factuelle (règle, fichier, test) ; un bloquant ne se rejette que preuve à l'appui.
- **Escalade** (CLAUDE.md, liste d'escalade) → bloquant non résoluble dans le périmètre (cas 6),
  ou les deux relecteurs se contredisent sur un bloquant (cas 7), ou valeur économique touchée (cas 4).

Corrections faites APRÈS la revue diff (règle « passe courte », validée par le founder le 2026-11-01) :
- **Elles touchent la logique** → **passe courte** avant le commit : les deux relecteurs, mode diff, sur CE delta
  uniquement (version relue → version corrigée), même consigne, mêmes règles que §2-§5. « Logique » = tout ce qui
  s'exécute ou décide d'un comportement : code C#/TypeScript, tests, Security Rules, configuration de build ou de
  dépendances (`package.json`, scripts npm, manifest Unity), `.gitignore`. Une correction issue d'une passe courte
  qui touche encore la logique relance une passe courte sur son propre delta.
- **Elles ne touchent pas la logique** (doc, commentaire, texte affiché, style USS) → pas de nouvelle passe ;
  elles sont listées dans le rapport de clôture (fichier:ligne), le founder voit ce qui a changé après les verdicts.
Les verdicts bruts de chaque passe courte figurent dans le rapport de clôture, avec leur arbitrage.
