# Relais vers 19.5c — à reprendre au ticket (versionné, D-REPRISE-014)

Consommé en 19.5c (commit de 19.5c) : point 1 versé dans le briefing (« Pour le résumé d'arbitrages de l'ÉTAPE 19,
19.5b », coût final) ; point 2 versé dans le briefing (signal skill) et dans TD-032 (titre, exemple de 19.5b) ; point 3
(1) versé dans le briefing, (2) appliqué (ce relais), (4) appliqué au constat de 19.5b §0, (5) appliqué au rapport de
l'exécutant ; point 4 : TD-037 (deux phrases marquées « (précision de Claude Code) »), briefing (précision liant TD-035
à F2-5/F2-6 marquée), D-ETAPE19-018 (risque « chaque libellé reste soumis à D-REPRISE-012 »). **Reportés à 19.5d** :
point 3 (3), TD-035 dans la demande regroupée (briefing, « Contenu de la demande regroupée », bloc (2)) ; point 4, F2-2
élargi après l'arbitrage, à dire dans la demande regroupée.

Source : 19.5b commitée (`5581485`, arbre `bc1c70116519c2e3f72ca4305b4d75903d730777`) et poussée le 2026-11-08 ;
audit de clôture de l'arbitre : GO, cinq remarques non bloquantes ; revues : GO, remarques non bloquantes.
Ce fichier est écrit après le push de 19.5b et entre dans le commit de 19.5c.

1. **Coût de coordination final de 19.5b** (à remplacer au commit de 19.5c, au briefing, section « Pour le résumé
   d'arbitrages de l'ÉTAPE 19 », version provisoire de 19.5b) : ticket 2 versions (v1 : Codex GO, auditeur GO APRÈS
   CORRECTION — 1 bloquant : zone sûre non gérée, écart à la doctrine C4, à classer en défaut technique et non en
   F2 — ; v2 passe courte : GO des deux, trois non-bloquants de l'auditeur acceptés) ; 1 arbitrage (T1 et suite des
   défauts, D-ETAPE19-018) ; diff : revue v1 écartée (les deux relecteurs avaient lu des fichiers de
   `.claude/instantanes/executant/`), relance avec le dossier hors du dépôt : GO des deux ; passe courte après
   corrections : GO des deux ; audit de clôture 1 (GO) ; NO-GO : 0 ; escalade immédiate : 0 (F1 orientation et F2
   mise en page portées à la demande regroupée). Passes par relecteur : Codex 5 (dont 1 écartée), auditeur 5 (dont 1
   écartée), arbitre 2 (1 arbitrage, 1 clôture).
2. **Signal skill (`CLAUDE.md` §f), au résumé d'arbitrages de l'ÉTAPE 19** : un relecteur a lu les fichiers de
   l'exécutant une deuxième fois (19.4c-1, puis 19.5b, cette fois les deux relecteurs) — « même type d'erreur relevé
   deux fois ». Contre-mesure appliquée en 19.5b : dossier `.claude/instantanes/executant/` déplacé hors du dépôt
   pendant les revues. Le périmètre de TD-032 et de l'item (i) du lot unique (filtre de lecture) est à étendre à
   `.claude/instantanes/executant/` (aujourd'hui TD-032 ne vise que `.revue-croisee/`) : à écrire dans TD-032 ; toute
   modification de filtre ou de skill reste F4, au lot unique.
3. **Remarques non bloquantes de l'audit de clôture de 19.5b** :
   (1) résumés de verdicts dans le coût de coordination lus comme contenu de `CLAUDE.md` §f, sans ancrage : à noter
   au résumé d'arbitrages, sans action ;
   (2) relais écrit après le push, jamais avant (appliqué ici) ;
   (3) TD-035 : la question F1/F2 de TD-035 (maintenance étendue au marché, phrase affichée) doit figurer d'emblée
   dans la demande regroupée, sous forme conditionnelle (si F2-5 ou F2-6 sont retenues) — à inscrire au briefing,
   « Contenu de la demande regroupée », bloc (2), en 19.5d ;
   (4) constat 19.5b §0 : remplacer le chemin des captures par « pièces de travail, non conservées » au prochain
   passage sur ce fichier ;
   (5) preuve de compilation Unity : citer `groundTruth.compilationFailed: false` des consoles plutôt qu'une
   affirmation.
4. **Non-bloquants reportés de la passe courte du diff de 19.5b (attribution)** : dans TD-037, les phrases
   « Technique nommée par la doctrine backend… » et « La sous-étape de corrections garde le nom `SafeAreaPanel`… »
   suivent la note de l'arbitre sans auteur : les marquer « (précision de Claude Code) » ; au briefing, la précision
   liant TD-035 à F2-5/F2-6 (entre crochets dans un bloc attribué à l'arbitre) : la marquer « (précision de Claude
   Code) » ; le risque de l'arbitre « chaque libellé reste soumis à D-REPRISE-012 », cité au briefing, est à ajouter à
   l'entrée D-ETAPE19-018 (traçabilité) ; F2-2 a été élargi après l'arbitrage (carte du slot actif, « Arrêter » à
   moitié visible sur S10e) : le dire dans la demande regroupée.
