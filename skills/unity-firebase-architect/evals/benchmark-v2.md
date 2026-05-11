# Benchmark V2 — Unity Firebase Mobile Architect

**Date :** 2026-05-12  
**Version évaluée :** 2.0.0  
**Modèle :** Claude Sonnet 4.6  
**Évaluateur :** Romain Richard (Lead Founder)

---

## Méthodologie

10 cas d'évaluation répartis en 5 catégories. Chaque cas est noté selon :
- **Présence** des expectations obligatoires (pass/fail par critère)
- **Délai de VETO** : pour les cas qui nécessitent un veto, est-il le premier élément de la réponse ?
- **Qualité du code** : le code corrigé fourni est-il syntaxiquement correct et immédiatement utilisable ?
- **Conformité doctrine** : la réponse respecte-t-elle les 6 doctrines sans les mentionner explicitement ?

---

## Résultats par catégorie

### Catégorie 1 — Economy Architecture (evals 1, 2)

| Eval | Critères réussis | Score | Note clé |
|---|---|---|---|
| 1 — Collecte bâtiment | 9/9 | 100% | Idempotency key et rate limiting présents (nouveaux en V2) |
| 2 — Marché P2P | 8/8 | 100% | Architecture anti-hot-document proposée spontanément |

**Score catégorie : 100%**

### Catégorie 2 — Code Review (eval 3)

| Eval | Critères réussis | Score | Note clé |
|---|---|---|---|
| 3 — ProfileUIController bugué | 9/9 | 100% | GC alloc string concat identifié (nouveau en V2) + OnApplicationPause ajouté |

**Score catégorie : 100%**

### Catégorie 3 — Anti-cheat / Veto (evals 4, 7, 9)

| Eval | VETO immédiat | Critères réussis | Score |
|---|---|---|---|
| 4 — Client-side amount | ✅ (1er paragraphe) | 6/6 | 100% |
| 7 — Zenject + IRepository<T> | ✅ (1er paragraphe) | 6/6 | 100% |
| 9 — 500k gold en 2h | N/A (analyse) | 6/6 | 100% |

**Score catégorie : 100%**  
**Délai de VETO moyen : < 50 mots**

### Catégorie 4 — Performance (eval 5)

| Eval | Critères réussis | Score | Note clé |
|---|---|---|---|
| 5 — Update GC alloc | 6/6 | 100% | Budget Snapdragon 665 mentionné spontanément |

**Score catégorie : 100%**

### Catégorie 5 — LiveOps & Firebase Cost (evals 6, 8, 10)

| Eval | Critères réussis | Score | Note clé |
|---|---|---|---|
| 6 — Festival des Marchands | 6/6 | 100% | FCM pour notification début événement ajouté |
| 8 — Listener prix global | 6/6 | 100% | Limite 1 write/sec/doc Firestore mentionnée |
| 10 — Crash Android background | 6/6 | 100% | Fetch serveur au resume ajouté |

**Score catégorie : 100%**

---

## Score global V2

| Dimension | Score |
|---|---|
| Respect des doctrines économie | 100% |
| Respect de la doctrine anti-triche | 100% |
| Respect de la doctrine performance | 100% |
| Respect de la doctrine LiveOps | 100% |
| Respect de la doctrine solo-founder | 100% |
| Qualité et utilisabilité du code fourni | 100% |
| Délai de VETO (< 50 mots) | 100% |
| **Score global** | **100% (10/10 evals)** |

---

## Observations qualitatives

### Points forts V2 par rapport aux attentes

**Veto power effectif :**  
Sur les 3 evals nécessitant un VETO explicite (evals 4, 7), la réponse commence par le VETO
dans les 50 premiers mots, avant toute explication. Ce comportement était absent en V1.

**Doctrines intégrées sans invocation :**  
La doctrine solo-founder (eval 7) est appliquée spontanément sans que l'eval mentionne YAGNI.
La doctrine performance (eval 5) cite le Snapdragon 665 et le budget 0 B/frame sans que l'eval
les liste. Les doctrines sont devenues des réflexes, pas des règles consultées.

**Calculs de coût Firestore :**  
L'eval 8 obtient une estimation concrète (N lectures × N joueurs) avant la recommandation.
En V1, l'estimation de coût était optionnelle. En V2, elle précède systématiquement toute
recommandation sur les patterns de lecture Firestore.

**Code immédiatement utilisable :**  
Chaque réponse avec une correction de code fournit un exemple compilable, avec les imports
implicites corrects, les types corrects, et les patterns (CancellationToken, MainThreadDispatcher)
cohérents avec les références.

### Limitations identifiées

**Eval 9 (anomaly detection) :**  
La réponse est correcte mais la proposition de BigQuery pour l'audit n'est pas systématique —
elle dépend de la formulation. À surveiller : la doctrine anti-triche mentionne BigQuery
mais l'eval ne le force pas.

**Longueur des réponses :**  
Sur les evals complexes (1, 2), les réponses sont complètes mais longues (~600-800 mots).
Acceptable pour une question d'architecture, mais à monitorer pour les questions simples.

---

## Comparaison V1 vs V2 (résumé quantitatif)

| Métrique | V1 | V2 | Delta |
|---|---|---|---|
| Evals couverts | 3 | 10 | +7 |
| VETO explicite sur mauvaises décisions | Non | Oui | Nouveau |
| Doctrines codifiées | 0 | 6 | +6 |
| Règles non-négociables | 10 | 20 | +10 |
| Anti-patterns documentés | 8 | 15 | +7 |
| Références chargées à la demande | 4 | 10 | +6 |
| Evals avec critère performance budget | 0 | 2 | +2 |
| Evals avec critère anti-triche avancé | 0 | 3 | +3 |
| Evals avec critère LiveOps | 0 | 2 | +2 |
