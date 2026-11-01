# CLAUDE.md — Guilds & Empires

Briefing et conventions verrouillées : `docs/sessions/BRIEFING-claude-code.md` (à lire en début de session).
Décisions : `docs/architecture/phase-1-decisions-log.md` · Dette : `docs/architecture/technical-debt.md`.

## Mode autonome supervisé (D-REPRISE-003)

Claude Code orchestre et exécute. Deux relecteurs read-only indépendants contrôlent : le sous-agent
`auditeur` (`.claude/agents/auditeur.md`) et Codex (`AGENTS.md`), via le skill `revue-croisee`.
Le founder (non technique) n'intervient **que sur escalade**. Ce mode remplace, pour chaque sous-étape,
la « validation par étape » du briefing.

### a. Cycle d'une sous-étape
1. **Ticket** : objectif, fichiers du périmètre, hors périmètre, critères d'acceptation, valeurs économiques touchées.
2. **Revue croisée — mode ticket** (skill `revue-croisee`).
3. **Implémentation** dans le périmètre du ticket.
4. **Tests** : `npm run test:emulator` pour le backend ; compilation Unity sans erreur pour le client.
5. **Play via le plugin Unity** (`unity:unity-cli`) : capture Game view + console brute.
   Sous-étape sans effet en jeu (doc, outillage) : écrire « Play : non applicable » dans le rapport.
6. **Revue croisée — mode diff**. Si une correction faite APRÈS cette revue touche la logique (code, tests,
   Security Rules, configuration de build ou de dépendances, `.gitignore`) : **passe courte** des deux relecteurs
   sur ce delta uniquement, avant le commit (règle validée par le founder le 2026-11-01, détail dans le skill
   `revue-croisee` §5). Correction sans effet sur la logique (doc, commentaire, style) : listée dans le rapport.
7. **Commit atomique LOCAL**, puis rapport de clôture.

### b. Escalade — Claude Code S'ARRÊTE et demande au founder UNIQUEMENT si :
1. écriture sur les données de production (seed, migration, correction manuelle) ;
2. déploiement de Cloud Functions ou de Security Rules ;
3. action irréversible : push, merge sur main, suppression de branche, réécriture d'historique ;
4. modification d'une valeur économique ou de game design (prix, coûts, rendements, plafonds, durées) ;
5. modification d'une doctrine ou d'une convention verrouillée ;
6. point BLOQUANT levé par un relecteur et non résoluble sans sortir du ticket ;
7. les deux relecteurs se contredisent sur un point bloquant ;
8. tests rouges après deux tentatives de correction.

Hors de ces 8 cas : Claude Code tranche, avance, et documente dans le rapport.

### c. Message d'escalade — français simple, pour un founder NON technique
- **Ce qui bloque** : une ou deux phrases, sans jargon (ou jargon expliqué).
- **Les options** : 2 à 3, numérotées.
- **Impact de chaque option** : sur le jeu, les joueurs, le coût, le délai, ce qui est réversible ou non.
- **Recommandation de Claude Code** : laquelle, et pourquoi en une phrase.

### d. Rapport de clôture d'une sous-étape — français simple
1. **Ce qui a été fait et pourquoi.**
2. **Verdicts BRUTS des deux relecteurs** (mode ticket, mode diff et chaque passe courte), puis l'arbitrage point par point.
3. **Play** : capture + console brute (ou « non applicable »).
4. **`git show --stat`** du commit.
5. **Risques résiduels.**
6. **COMMENT ANNULER** : la commande exacte. Par défaut `git revert <sha>` (crée un commit inverse, sans rien
   perdre). Jamais `git reset --hard` : il efface aussi toutes les modifications non commitées.

### e. Push
Aucun push sans accord explicite du founder. Commits locaux uniquement.
