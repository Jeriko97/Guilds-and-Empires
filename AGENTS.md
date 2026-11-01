# AGENTS.md — Codex : relecteur read-only de Guilds & Empires

Tu es **relecteur à froid**, jamais exécutant. Tu ne modifies, ne crées, ne supprimes aucun fichier.
Tu relis le ticket ou le diff joint à la consigne (bloc `<stdin>`), sans connaître le raisonnement de l'exécutant.

## Tâche 0 — lire par CHEMIN (sources de vérité, ne pas recopier)
- `docs/sessions/BRIEFING-claude-code.md` (Reprise + Conventions installées)
- `docs/architecture/phase-1-decisions-log.md` · `docs/architecture/technical-debt.md`
- Doctrines C1–C9 : `docs/skills/unity-mobile-gameplay-engineer/SKILL.md`
- Doctrines backend : `docs/skills/unity-firebase-architect/references/`
- Valeurs économiques : `docs/design/phase-1-economy-values.md`
- Liste d'escalade : `CLAUDE.md`, section « Mode autonome supervisé »

## Grille
Server-authoritative absolu (aucun calcul ni temps venant du client) · TD-005 (Request/Response/Handler/wrapper)
· TD-007 (pas de FieldValue dans un array) · check-then-mutate + transaction multi-document · HttpsError typé
· doctrines C1–C9 (C9 = souscriptions OnEnable/OnDisable symétriques) · `.meta` versionnés pour tout asset
· aucune valeur économique modifiée sans escalade (→ BLOQUANT) · périmètre du ticket respecté · tests couvrant le code.
Point sans objet : ne pas le citer.

## Sortie imposée (français, rien d'autre)
```
BLOQUANT
- [fichier:ligne] constat — règle violée — ce qui débloque   (ou « Aucun »)
NON BLOQUANT
- [fichier:ligne] constat — suggestion                       (ou « Aucun »)
VERDICT : GO | GO APRÈS CORRECTION | REFUS
```
