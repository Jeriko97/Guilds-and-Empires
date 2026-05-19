# GAE Phase 1 — First-Pass Economy Values

---

## Préambule méthodologique

Ces valeurs constituent un prototype d'équilibre, pas une balance finale. L'objectif est d'être assez cohérent pour implémenter et jouer — pas assez définitif pour éviter la refonte. Chaque chiffre sera probablement ajusté après les 10 premières heures de playtest. Ce qui doit tenir : les *ratios*. Les *absolus* sont des hypothèses.

---

## 1. Production Rates

**Hypothèse de design fondamentale :** la production tourne offline. Le joueur ne regarde pas des barres en temps réel — il lance, vit sa vie, revient collecter. La durée des cycles définit la *fréquence de check-in optimale*, pas le temps passé à l'écran.

**Cible :** check-in optimal toutes les 1-2 heures. Un joueur qui revient après 30 minutes trouve quelque chose. Après 4 heures, il trouve un inventaire quasi plein et une décision à prendre.

| Ressource | Durée par unité | Input requis | Raison design |
|---|---|---|---|
| **Logs** | 20 min | Aucun | Cadence de base de la chaîne. En 2h, ~6 Logs prêts par slot actif. Assez rapide pour récompenser les check-ins fréquents. |
| **Planks** | 25 min | 2 Logs | Légèrement plus long que Logs — la transformation coûte du temps, pas seulement de la matière. Ce delta crée la première vraie décision d'allocation de slot. |
| **Reconstruction Kits** | 60 min | 3 Planks | 1 Kit/heure maximum. La rareté relative du Kit est la justification directe du premium contractuel. |

**Remarque sur les 3 slots parallèles de la Sawmill :**
Un joueur peut lancer 3 cycles de Logs simultanément, ou mixer Logs/Planks selon ses besoins. Résultat : en 20 minutes avec 3 slots Logs actifs, 3 Logs sont prêts. Ça élimine la frustration du "rien à collecter" sans casser la tension d'inventaire.

**TO_PLAYTEST** — Toutes ces durées. Question clé de game feel : est-ce que le joueur ressent de l'anticipation au retour, ou de la frustration d'avoir "pas grand chose" après 30 minutes ?

---

> ⚠️ **VALEUR CRITIQUE — Durée du Kit (60 min)**
> C'est l'anchor de toute la session pacing. Elle détermine combien de contrats un joueur peut remplir par jour, la valeur perçue d'un Kit, et l'intensité de la décision "je vends au marché ou j'attends le prochain contrat". Ne pas modifier sans recalculer tous les reward tiers et les Favor thresholds.

---

## 2. Inventory Capacities

**Hypothèse de design :** quand l'inventaire est plein, le joueur *doit* décider — vendre, transformer, ou livrer. Cette friction est intentionnelle. Elle empêche l'accumulation passive et force la participation au marché.

**Capacités de départ :**

| Ressource | Cap initial | Raison design |
|---|---|---|
| **Logs** | 50 | ~5h de production avant saturation avec 3 slots actifs (en pratique moins, car la transformation consomme en continu). Confortable pour débuter. |
| **Planks** | 30 | Plus serré que Logs. La pression arrive plus vite, forçant une décision marché/contrat plus régulière. Reflète la valeur supérieure. |
| **Reconstruction Kits** | 10 | Très serré. 10 Kits = ~10h de production max avant blocage. Si l'inventaire est plein, le joueur est obligé de vendre ou livrer — décision de trading forcée, pas frustration. |

**Paliers d'upgrade (gold sink) :**

| Upgrade | Capacité | Coût gold | Raison design |
|---|---|---|---|
| Logs +25 (palier 1) | 50 → 75 | 40 | Premier upgrade accessible, naturellement acheté après 2-3 ventes de marché. Presque transparent — c'est voulu. |
| Logs +25 (palier 2) | 75 → 100 | 80 | Pour les joueurs actifs à plein régime. Commence à faire sentir le coût. |
| Planks +15 (palier 1) | 30 → 45 | 60 | Plus cher que Logs à ratio équivalent — justifié par la valeur supérieure des Planks stockés. |
| Planks +15 (palier 2) | 45 → 60 | 120 | Palier pour transformateurs intensifs. Décision réelle : cap ou réinvestissement stratégique ? |
| Kits +5 (palier 1) | 10 → 15 | 100 | Cher car 5 Kits supplémentaires = valeur contractuelle substantielle. |

**Propriété du gold sink :**
Ces upgrades doivent être une décision tendue entre "je me libère de la contrainte" et "je garde le gold pour quelque chose de stratégique". Si le joueur ne ressent jamais cette tension, les coûts sont trop bas.

**TO_PLAYTEST** — Tous les coûts d'upgrade. Question clé : est-ce que le premier upgrade Logs (40 gold) arrive naturellement après la première session, ou est-ce que le joueur grinde pour l'atteindre ?

---

> ⚠️ **VALEUR CRITIQUE — Cap des Kits (10)**
> Ce chiffre définit la fréquence maximale des décisions économiques forcées. Trop haut = accumulation passive possible, joueur absent du marché. Trop bas = frustration opérationnelle. 10 Kits est l'hypothèse la plus fragile de ce tableau.

---

## 3. Contract Rewards

**Règle absolue :** un contrat impérial *doit toujours* payer mieux qu'une vente directe au marché en conditions normales. Sans ce premium, la fantasy Imperial Merchant s'effondre — il n'y a plus de raison de servir l'Empire.

**Prix de référence marché (base, voir Section 4) :**
- 1 Log = ~5 gold
- 1 Plank = ~12 gold
- 1 Reconstruction Kit : pas de marché libre standard — un acheteur IA "plancher" à 20 gold (soupape, pas canal principal)

**Récompenses par tier :**

| Tier | Quantité | Reward gold | Reward Favor | Équivalent vente marché | Premium |
|---|---|---|---|---|---|
| **Contrat Standard** | 3 Kits | 120 gold | 15 Favor | ~90 gold (si Planks vendus séparément) | +33% |
| **Contrat Renforcé** | 5 Kits | 230 gold | 35 Favor | ~150 gold | +53% |
| **Contrat Prioritaire** (event) | 5 Kits | 320 gold | 75 Favor | ~150 gold (base) | +113% |

**Note sur l'acheteur plancher :**
Le plancher IA à 20 gold/Kit existe uniquement comme soupape — pour éviter que le joueur soit bloqué avec du stock et sans contrat disponible. Si l'UI voit que le joueur vend régulièrement au plancher, elle devrait signaler subtilement que les contrats paient mieux (ticker + flèche).

**TO_PLAYTEST** — Les montants absolus en gold. Les ratios sont défendables, les absolus sont des hypothèses qui dépendent entièrement de la vitesse réelle à laquelle le gold s'accumule.

---

> ⚠️ **VALEUR CRITIQUE — Premium contractuel (33% Standard, 113% Prioritaire)**
> Ces deux ratios sont les pivots de la fantasy Imperial Merchant. Si le Standard descend sous 25%, les contrats deviennent optionnels. Si le Prioritaire descend sous 80%, l'event perd son pouvoir de décision. Ne jamais modifier ces ratios indépendamment des prix de marché.

---

## 4. Market Price Ranges

**Hypothèse de design :** assez de variance pour que le ticker soit informatif, pas assez pour être incompréhensible. Un joueur qui consulte le ticker deux fois par jour doit détecter une tendance — pas du bruit.

| Ressource | Prix bas | Prix normal | Prix event (haut) | Amplitude totale |
|---|---|---|---|---|
| **Logs** | 3 gold | 5 gold | 9 gold | ×3 |
| **Planks** | 8 gold | 12 gold | 22 gold | ×2,75 |

**Ratio Planks/Logs à prix normal : 2,4**
1 Plank coûte exactement 2 Logs en input. À prix normal, 1 Plank vaut 2,4 Logs. La marge de transformation (~20%) est suffisante pour rendre la chaîne rentable sans rendre la vente de Logs bruts absurde. Un joueur peut vendre des Logs et être compétitif — simplement moins optimisé qu'un transformateur. C'est voulu : la diversité de stratégies crée un marché vivant.

**Comportement des prix IA :**
En période normale, les prix dérivent lentement dans la fourchette bas/normal selon l'offre simulée. En event, montée rapide vers le haut, retour progressif sur ~1h après la fin de l'event (pas de coupure brutale — dernière fenêtre de vente).

**TO_PLAYTEST** — Les prix absolus. L'amplitude event (+80% Logs) est-elle assez visible sur le ticker pour déclencher une réaction sans sembler artificielle ?

---

> ⚠️ **VALEUR CRITIQUE — Ratio Planks/Logs à prix normal (2,4)**
> C'est la marge de transformation fondamentale. En dessous de 2,0 : personne ne transforme, Planks disparaissent, la chaîne s'effondre. Au-dessus de 4,0 : tout le monde transforme, Logs deviennent rares, l'économie IA dysfonctionne. Maintenir ce ratio entre 2,2 et 3,0 en toutes circonstances.

---

## 5. Favor Thresholds

**Règle :** chaque palier doit ouvrir quelque chose de *tangible et d'utile* — pas un titre, pas une icône. La Favor est un signal de confiance avec des conséquences économiques réelles.

| Rang | Seuil Favor | Unlock | Temps estimé |
|---|---|---|---|
| **Fournisseur Local** | 0 (départ) | Contrats Standard visibles, AI market de base, ticker 2-3 prix | — |
| **Marchand Agréé** | 50 | Contrats Renforcés débloqués, ticker étendu (5 prix), accès au marché avancé | ~3-5 sessions actives |
| **Entrepreneur Impérial** | 200 | Deuxième slot de bâtiment préparé (pour Phase 2), rumeurs d'events à venir avant le marché général | ~2-3 semaines de jeu régulier |
| **Guild Charter gate** | 350 Favor + 500 gold | Débloque le Guild Charter → Phase 2 | ~3-5 semaines de jeu engagé |

**Logique du gate hybride :**
- 350 Favor = seuil SIGNAL : atteignable naturellement, confirme que le joueur a *joué* et compris l'économie
- 500 gold = seuil GATE : la vraie décision, représente une grosse dépense qui force un arbitrage stratégique
- Les deux ensemble évitent à la fois l'obligation pure (Favor seul) et l'achat de progression (gold seul)

**TO_PLAYTEST** — Tous les seuils, et en priorité le seuil Guild Charter. Question clé : est-ce que le joueur voit le Guild Charter comme un horizon motivant ou comme un mur opaque ?

---

> ⚠️ **VALEUR CRITIQUE — Seuil Guild Charter (350 Favor + 500 gold)**
> C'est le grand objectif de Phase 1. Trop proche (atteint en 3-4 sessions) = Phase 1 est un tutoriel, pas un jeu. Trop loin = abandon avant d'y arriver. Cible : 3-5 semaines de jeu régulier (1-2 sessions/jour). À playtesters intensivement en priorité absolue.

---

## 6. Imperial Reconstruction Initiative — Durée et Amplitude

| Paramètre | Valeur | Raison design |
|---|---|---|
| **Durée totale de l'event** | 4 heures | Assez long pour qu'un joueur ouvrant l'app 1h après le déclenchement puisse encore pleinement participer. Assez court pour créer une urgence perçue. |
| **Decay progressif post-event** | ~1 heure | Les prix ne s'effondrent pas instantanément. Fenêtre de fin pour les retardataires, évite la sensation de coupure brutale. |
| **Amplitude Logs** | +80% (5 → 9) | Assez visible sur le ticker pour déclencher une réaction. Assez lisible pour ne pas sembler aléatoire. |
| **Amplitude Planks** | +83% (12 → 22) | Cohérent avec Logs, légèrement amplifié pour refléter la rareté plus grande des Planks transformés pendant l'event. |
| **Nombre de Contrats Prioritaires** | 5 slots (phase solo) | En test solo, le joueur peut capturer l'intégralité de l'event s'il joue bien. C'est intentionnel pour le premier event scripté — on veut une première victoire claire. En Phase 2 MMO, ce nombre sera en compétition réelle. |

**TO_PLAYTEST** — La durée de 4 heures. Sur mobile, est-ce que le joueur revient dans cette fenêtre naturellement ? Ou faut-il une push notification pour que l'event soit vécu ?

---

## Tableau de cohérence — Vérification rapide

| Scénario | Résultat estimé | Verdict |
|---|---|---|
| Joueur livre 3 Kits via Contrat Standard | 120 gold + 15 Favor | Premier objectif atteignable en ~3h de production active |
| Joueur livre 5 Kits via Contrat Prioritaire (event) | 320 gold + 75 Favor | Excellent retour sur une session d'event — justifie le retour app |
| Joueur vend ses Logs bruts sans transformer | ~30 gold pour 2h de prod | Viable mais clairement sous-optimal — pousse naturellement vers la transformation |
| Joueur upgrade inventaire Logs après 2 sessions | ~40 gold dépensés | Accessible sans être trivial |
| Chemin complet vers Guild Charter | ~30-40 sessions régulières | Fourchette indicative — **à confirmer par playtest en priorité** |

---

## 3 Questions Critiques Avant le Prompt 3B

**Question 1 : La production tourne-t-elle offline en continu, ou requiert-elle une re-queue manuelle à chaque cycle ?**
C'est la question de design la plus structurante pour l'architecture server-authoritative. "Fire and forget jusqu'à saturation de l'inventaire" = le check-in est récompensé mais jamais obligatoire, et le serveur doit calculer un état différé. "Re-queue manuelle" = le joueur actif est avantagé, mais l'expérience mobile devient plus contraignante. Ce choix change fondamentalement comment les timers, les caps d'inventaire et les Firestore writes fonctionnent ensemble. C'est le premier point d'alignement obligatoire avec le Prompt 3B.

**Question 2 : L'AI market est-il un vrai système d'ordres, ou une courbe de prix dynamique simulée server-side ?**
Concrètement : quand le joueur voit "Logs : 5 gold ↑", est-ce parce qu'un AI merchant a posté un ordre d'achat à ce prix, ou parce qu'une fonction server calcule un prix de marché selon des paramètres d'état du monde ? Le premier modèle est plus vivant et scalable vers la Phase 2 — mais plus complexe à implémenter de façon server-authoritative. Le second est plus contrôlable mais risque de se sentir artificiel. Cette décision conditionne tout le schéma Firestore du marché.

**Question 3 : Comment les AI merchants consomment-ils les ressources — ont-ils un inventaire réel, ou sont-ils des signaux de prix sans état ?**
Si les AI merchants *achètent vraiment* des Logs sur le marché, ils créent une compétition réelle et la scarcité est émergente. Si les AI merchants sont des *fournisseurs de prix* sans inventaire persistant, le marché est stable et contrôlable mais la scarcité est simulée. Cette question est la plus structurante pour la Phase 2 : la différence entre une économie MMO qui *respire* et une économie qui *joue à respirer*. La réponse doit être tranchée avant d'écrire une seule ligne de Cloud Function économique.
