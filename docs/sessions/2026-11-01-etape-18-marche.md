# Session 2026-11-01 — ÉTAPE 18 (slice marché) : écran Marché, clôture

## Contexte
Suite de la reprise du même jour (`2026-11-01-reprise-audit-p0.md`). Le marché de production était seedé et
`updateMarketPrices` redéployée (TD-018, D-TD018-001). Restait le contenu de l'écran Marché (sous-étape 18.2b-2).
Premier usage complet du mode autonome supervisé (D-REPRISE-003) : ticket, revue croisée, Play, revue diff, commit.

## ÉTAPE 18 — récapitulatif complet
| Commit | Date | Contenu |
|---|---|---|
| `30a7de7` | 06-29 | `sellToMarket` renvoie l'`inventory` mis à jour |
| `a8bc7ea` | 07-09 | `IMarketService` + `FirebaseMarketService` (lecture `marketState/state`, cache 5 min) |
| `e21e7f5` | 07-09 | `SellToMarketAsync` + `SellToMarketResult` |
| `5dc9ad3` | 08-08 | `PlayerEconomyStateStore` + garde de ré-entrée de ProductionScreen |
| `b81d3a5` | 11-01 | Coquille `MarketScreen` + navigation Push/Pop |
| `0a54298`, `03c1c42` | 11-01 | Seed versionné `marketState/state` (TD-018), seed prod + déploiement ciblé |
| `cb90086` | 11-01 | 18.2b-2 : contenu de l'écran Marché + ligne gold/inventaire sur ProductionScreen |
| `b79d1e6` | 11-01 | 18.2b-2 : clé d'idempotence liée à la quantité et à l'état serveur, polling 5 min 5 s, statut. Contient aussi, par erreur, le retrait de l'index de `EditorPipelineConfig.json` (commit non atomique, non réécrit) |
| (ce commit) | 11-01 | Clôture : décisions D-ETAPE18-001 à 006, TD-015/019/020, briefings, règle de passe courte |

## 18.2b-2 — écran Marché
- **Contenu** :
  - or, stock (quantité/cap) et prix + tendance de logs / planks / kits ;
  - boutons « Vendre 1 / Vendre 10 / Tout » (Tout = min(stock, 100)), grisés si le stock affiché manque ;
  - le store n'est remplacé que par `NewGold` + `Inventory` renvoyés par le serveur (D-ETAPE18-003) ;
  - ProductionScreen affiche « Or · Logs · Planks · Kits », relu à chaque retour de Pop.
- **Idempotence** (D-ETAPE18-001) : une clé par intention (ressource, quantité, état serveur affiché).
  Elle ne repart jamais avec une autre quantité. Cas du founder : « Tout » échoue à 49, le stock passe à 50
  (forcément via une réponse serveur), donc nouvel état, nouvelle intention, nouvelle clé.
- **Polling** (D-ETAPE18-002) : toutes les 5 min 5 s, arrêté par `OnDisable`.
- **Mise en page** : listes en `ScrollView` + `flex-shrink: 0`. La ligne d'économie écrasait les cartes de slots
  au thème actuel (constaté sur capture).

## Validation en Play (production, compte du founder)
- Accord du founder (D-ETAPE18-004) : « Les ventes de ce test se font sur mon compte de production : c'est
  autorisé pour cette validation, en quantités minimes. »
- **Parcours** :
  - collecter : « Rien à récolter », stock plein 50/50 ; les 3 slots déjà en production, donc pas de « produire » possible ;
  - Marché : or 0, prix logs 5 / planks 11 / kits 20 ;
  - « Vendre 1 » logs : `sellToMarket OK — goldEarned:5 newGold:5 alreadySold:False`, logs 50 → 49 ;
  - retour : ProductionScreen `Or : 5 · Logs 49/50` ;
  - relance : `resolveLoginState OK — gold:5`.
- **Contrôles** :
  - double clic : un seul appel, tous les boutons grisés pendant l'appel (Retour compris) ;
  - `inventory` présent dans la réponse → point 3 de TD-018 clos.
- **Polling** :
  - 2e lecture des prix 5 min après l'ouverture ;
  - après fermeture du Marché (0 instance restante), aucune lecture pendant 6 min ;
  - 0 erreur console.
- **Clé d'idempotence** : règle `PendingSale.Matches` vérifiée localement par réflexion (même ressource,
  quantité et état → réutilisée ; 49 → 50 → refusée ; nouvel état serveur → refusée).
  Le test de bout en bout par des ventes « à échec voulu » contre la production (planks, stock 0) a été
  **refusé par le garde-fou de l'agent** et n'a pas été fait.

## Revues croisées
- **Ticket** : GO après correction des deux côtés.
  - Bloquants : traçabilité de l'accord de vente en prod ; Retour pendant une vente.
- **Diff** : auditeur GO ; Codex GO après correction.
  - Bloquants Codex : polling C8 absent ; annulation non testée dans les `catch`.
- **Delta post-revue** (demandé par le founder) : auditeur GO ; Codex GO après correction.
  - Bloquant Codex : une intention unique écrasait une intention non résolue, d'où un risque de double vente sur retry.
- **Passe courte** sur la correction : GO / GO. Cette séquence a motivé la règle D-ETAPE18-006.
- **Ticket de clôture** : auditeur GO après correction ; Codex GO.
  - Bloquant auditeur : « une seule passe par mode » dans le skill.
  - Constat TO_PLAYTEST précisé : points fixes 3-6 et non « figé à 5 ».
  - Cumul du multiplicateur d'event repéré → TD-020.

## Dette et constats
- **TD-018** : partie marché close ; reste `contractPool` (étape contrats).
- **TD-015 requalifiée** (4 foyers de parsing, FAIBLE).
- **TD-019** : firebase-functions 7.2.5 → 7.4.0 au prochain déploiement complet.
- **TD-020** : multiplicateur d'event cumulatif (≈ 16 au lieu de 9). Correction = escalade cas 4.
- **TO_PLAYTEST** (economy-values) : prix des Logs immobile hors event (bruit absorbé par l'arrondi).
- **Chemin périmé** `/global/marketState` corrigé dans `phase-1-technical-implementation.md`.
- **EditorPipelineConfig.json** ignoré (D-ETAPE18-005) : retrait de l'index dans `b79d1e6`, règle `.gitignore` dans le
  commit d'outillage suivant (entre les deux, fichier ni suivi ni ignoré).
- **Résidu** `ProjectSettings/Packages/com.unity.ai.assistant/Settings.json` (paquet AI retiré, D-REPRISE-001) :
  non suivi et non ignoré → à supprimer du disque ou ignorer dans un ticket d'hygiène dédié.

## Risques résiduels
- **Refus métier après une vente aboutie dont la réponse s'est perdue** : `sellToMarket` ne renvoie pas
  l'inventaire en cas de refus (« stock insuffisant »). L'affichage reste faux jusqu'à la prochaine réponse serveur.
- **Vente aboutie dont la réponse s'est perdue, puis départ de l'écran** : l'affichage reste faux jusqu'au
  prochain `resolveLoginState`, c'est-à-dire au redémarrage.
- **Cas « réponse perdue »** : non testé, faute d'injection de panne réseau.
- **Logs remontés à 50** : la production a continué sur le serveur pendant la session.

## Prochaine étape
Contrats impériaux : `processWorldEventLifecycle` + alimentation de `contractPool` (backend), puis service et écran.
À trancher avant le premier world event : TD-020 (escalade cas 4).
