# Relais vers 19.5b — à reprendre au ticket (versionné, D-REPRISE-014)

Consommé en 19.5b (commit de 19.5b) : points 1 à 6 versés dans — point 1 : `docs/architecture/phase-1-decisions-log.md`
(D-ETAPE19-017) et `docs/sessions/BRIEFING-claude-code.md` (« Pour le résumé d'arbitrages de l'ÉTAPE 19 ») ; point 2 :
briefing, « Reprise 2026-11-01 » ; point 3 : briefing, « Incident de procédure de 19.5a » ; point 4 : briefing, 19.5,
« demande regroupée au founder » (notes pour le texte F3) ; point 5 : commentaire du test « entrée réelle du logger »
(`firebase/functions/src/__test__/alertes.test.ts`) ; point 6 : briefing, « Prochaine retouche de CLAUDE.md », lot
unique, item (l).

Source : 19.5a commitée (`e66ce79`, arbre `0e8c15aaef8253496ce71d72131025b58e9b2c3b`) et poussée le 2026-11-08 ;
audit de clôture de l'arbitre : GO, quatre remarques non bloquantes ; revues : GO, remarques non bloquantes.
Ce fichier est écrit après le push de 19.5a et entre dans le commit de 19.5b.

1. **Coût de coordination final de 19.5a** (remarque 1 de l'audit de clôture : la version commitée est marquée
   « provisoire … passe courte en cours » ; à remplacer au commit de 19.5b, dans D-ETAPE19-017 et au briefing,
   section « Pour le résumé d'arbitrages de l'ÉTAPE 19 », vérification à l'audit de clôture de 19.5b) :
   ticket 3 versions (v1 : Codex GO APRÈS CORRECTION — 2 bloquants : politique à deux conditions
   `conditionMatchedLog` refusée par l'API, clause STOP sans décision du founder —, auditeur GO APRÈS CORRECTION —
   2 bloquants : même point API, filtre « slot corrompu » qui ne visait pas le code `data-loss` ; v2 passe courte :
   GO des deux ; v3 passe courte, non-bloquants de l'auditeur intégrés : GO des deux) ; 1 passe Codex écartée
   (version intermédiaire du ticket) ; diff 2 versions (v1 : Codex GO, auditeur GO, non-bloquant commun : champ
   `message` écrasé par le logger, corrigé ; passe courte : GO des deux) ; audit de clôture 1 (GO) ; aucun
   arbitrage hors clôture ; aucune escalade. Passes par relecteur : Codex 5 (+1 écartée), auditeur 5, arbitre 1 ;
   NO-GO : 0.
2. **Build et lint** (remarque 2 de l'audit) : le rapport de 19.5a affirmait « build et lint sans erreur » sans
   pièce jointe ; à partir de 19.5b, joindre la sortie de `npm run build` et `npm run lint` à l'audit de clôture
   quand elles sont affirmées, ou ne pas les affirmer.
3. **Incident de procédure, au résumé d'arbitrages de l'ÉTAPE 19** (remarque 3 de l'audit) : en 19.5a, l'exécutant a
   lancé `gcloud beta --help` sans question possible ; gcloud a installé de lui-même le composant local `beta`
   (2026-11-08 10:36). Outillage du poste seulement, aucun projet visé ; non désinstallé
   (`gcloud components remove beta` le retirerait). Consigne pour les exécutants : hors tests, ne lancer que des
   commandes dont l'effet local est connu. Une seule occurrence : pas un « signal skill ».
4. **Demande regroupée (texte F3), à reprendre quand elle sera préparée** (remarque 4 et risques de l'audit) : les
   noms réels du service Cloud Run (`updatemarketprices`) et du job Cloud Scheduler
   (`firebase-schedule-updateMarketPrices-<région>`, recherche de sous-chaîne sensible à la casse) et la région
   (`us-central1`, hypothèse) sont relevés à l'étape 1 de `firebase/monitoring/README.md` ; un ajustement du filtre
   peut suivre ce relevé (modification du dépôt, revue, puis action F3). La lecture des champs sous `jsonPayload.*`
   et la limite « une seule condition `conditionMatchedLog` » ne sont prouvées qu'à l'activation ; si la création
   d'une politique échoue : ajustement du dépôt (revue) puis nouvelle action F3, jamais un contournement.
5. **Non-bloquants des relecteurs reportés** (passe courte du diff de 19.5a, auditeur) : le test « entrée réelle du
   logger » pour le slot corrompu (`alertes.test.ts`) reconstruit l'appel `logger.error` sous la forme des handlers ;
   il prouve la forme de l'entrée JSON, pas que chaque handler l'écrit (couvert par les espions des suites des
   handlers) : à dire dans le commentaire du test au prochain passage sur ce fichier.
6. **Outillage** : le chemin du CLI Codex du skill `revue-croisee` a changé (`bin/f71a721e0e6193a9/codex.exe`) ;
   modification du skill = F4, au lot de retouches ; d'ici là, le skill prévoit de prendre le plus récent.
