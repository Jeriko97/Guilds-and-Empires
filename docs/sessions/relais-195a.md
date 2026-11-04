# Relais vers 19.5a — à reprendre au ticket (versionné, D-REPRISE-014)

Origine : `.claude/instantanes/relais-195a.md` (ignoré par git), écrit le 2026-11-04 après 19.5-0 ; versionné le
2026-11-04 en 19.5-0b.

Source : 19.5-0 commitée (b0f413b) et poussée ; audit de clôture de l'arbitre (GO) et revues (remarques non bloquantes).
Le relais de 19.4d (relais-195.md) est versé au briefing par b0f413b ; ce fichier le remplace.

1. Journal — deux arbitrages de l'arbitre (audit de clôture de 19.5-0, 2026-11-04), à inscrire attribués à « arbitre »
   (par exemple en annotation de D-ETAPE19-016) et au résumé d'arbitrages de l'ÉTAPE 19 :
   (a) lecture du point 7 du relais de 19.4d confirmée : « vérifiées avant toute question au founder » = la préparation
   (alerte TD-021 préparée et testée hors production, lisibilité au simulateur et boucle sur l'émulateur, build Android
   préparé, question F2 prête) ; activation de l'alerte en production et déploiement = F3 dans la demande regroupée,
   exécutés après la réponse, revérification (b) juste avant le déploiement ;
   (b) ordre du découpage accepté : 19.5-0 → 19.5a TD-021 → 19.5b simulateur + émulateur → 19.5c build Android +
   instructions → 19.5d lot F2 → demande regroupée.
2. Résumé d'arbitrages de l'ÉTAPE 19 : TD-036 dans la liste des TD « avant tout testeur externe » (jauge Phase 1).
3. Journal l. 154 (D-PLATEFORMES-001, « Concordance ») : citation condensée ; texte réel de
   `docs/skills/unity-mobile-gameplay-engineer/SKILL.md` l. 40 : « Android primaire (Snapdragon 665, 3 GB RAM, Android
   10+), iOS secondaire » — ellipse ou citation complète.
4. `docs/architecture/note-chaine-ios.md` : fondre le paragraphe « Mise à jour après la revue (2026-11-04) » (l. ~128)
   dans la recommandation (un document décrit l'état, pas sa relecture) ; masquage des secrets dans Unity Build
   Automation à préciser (enregistrement explicite des valeurs avec `::mask-value::`, doc Unity des scripts de build) ;
   une ligne longue (l. ~120) ; deux parenthèses successives (l. ~25-26).
5. Briefing Claude Code, annotation (19.5-0) du point 7 (l. ~844-850) : ajouter « précision de Claude Code » (comme au
   journal) et nommer la condition (a) (backend et client déployés ensemble) dans la lecture (i)/(ii)/(iii).
6. Coût de coordination 19.5-0 : ticket 2 versions (v1 : Codex GO, auditeur GO ; v2 passe courte : GO des deux) ; diff
   2 versions (v1 : Codex GO APRÈS CORRECTION — 1 bloquant, ambiguïté du point 7 —, auditeur GO ; passe courte : GO des
   deux) ; audit de clôture 1 (GO) ; aucun arbitrage hors clôture ; aucune escalade.
7. Écart iOS minimal 13.0 (ProjectSettings) contre 15.0 (SDK Firebase) : à régler au ticket qui ouvrira la chaîne iOS.
