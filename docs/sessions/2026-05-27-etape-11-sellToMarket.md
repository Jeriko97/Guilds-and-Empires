# Session 2026-05-27 — ÉTAPE 11 sellToMarket

## Livrables

- 6/9 Cloud Functions complètes (sellToMarket ajoutée)
- 115/115 tests verts (21 nouveaux : intégration sellToMarket, stable sur 2 runs × 3)
- Première CF qui lit le singleton /marketState/state (server-authoritative prix)
- Rate limit anti-farming par array inline (marketSalesLastHour) intégré dans
  la transaction principale — immune à TD-001 par construction
- Idempotency tolérante : même key + même payload = succès idempotent ;
  même key + payload différent = failed-precondition
- Trace immutable /players/{uid}/marketTrades/{idempotencyKey} créée à chaque vente

## Commits (ordre chronologique)

- 2d0327f — feat(market): add sellToMarket with rate limit and idempotency
- 71dfc47 — test(market): assert marketSalesLastHour in concurrent tests
- 0f28160 — docs: open TD-011 and log D-ETAPE11 decision

## Types mis à jour dans shared/types.ts

- `PlayerDocument` : ajout de `marketSalesLastHour?: Timestamp[]` (optionnel,
  fallback `??[]` dans le handler, aucune migration requise)
- `MarketStateDocument.prices` : ajout de `reconstructionKits: ResourcePrice`
- `MarketStateDocument.priceHistory` : ajout de `reconstructionKits: number[]`

## Décisions tranchées

- `Timestamp.now()` capturé UNE SEULE FOIS hors transaction (ligne 56), réutilisé
  dans la transaction via closure — déterminisme TD-007, aucun `Timestamp.now()`
  dans le callback runTransaction.
- Constantes `MAX_MARKET_SELL_QUANTITY` / `MARKET_SALES_RATE_LIMIT` /
  `MARKET_SALES_WINDOW_MS` dans `sellToMarket.ts` (pas `shared/market.ts`).
  Voir D-ETAPE11.
- Prix lu via `tx.get(marketStateRef)` DANS la transaction (Q4) — toute lecture
  hors-tx aurait été un VETO. Prix client jamais accepté.
- Rate limit array inline + transaction = immune à TD-001 (pas de
  checkRateLimit externe, pas de read-modify-write non-atomique).
- `MarketTradeDocument` : interface locale sans `schemaVersion` — trace
  immutable, jamais migrée, pas de versioning nécessaire.
- Idempotency `newGold: player.gold` dans le hit idempotent : gold courant
  du doc player (déjà post-vente), pas un recalcul.

## Points techniques de vigilance respectés

- Promise.all sur les 3 reads en parallèle (pattern ÉTAPE 9).
- check-then-mutate strict : toutes les validations (player.exists,
  idempotency, marketState.exists, inventory, pruning, rate limit, intégrité
  prix) précèdent toutes les mutations.
- `Number.isInteger(price)` avant calcul goldEarned — internal error si le
  singleton de prix contient un flottant.
- Tests concurrents #20 et #21 avec Promise.allSettled, assertions exhaustives :
  gold crédité une fois, inventory décrémenté une fois, **marketSalesLastHour
  contient exactement 1 entrée** (l'idempotent et la vente échouée ne
  contribuent pas au rate limit).

## Bug rencontré et corrigé en session

Premier run vert, second run rouge. Cause : les subcollections Firestore
(`marketTrades`) ne sont PAS cascade-supprimées par l'émulateur à la
suppression du doc parent player. Fix : `clearGlobalTestData()` utilise
`db.collectionGroup("marketTrades").get()` pour effacer toutes les traces
avant chaque test — pattern identique à `contracts` dans deliverToContract.
Retenu comme TD-006 précision + mémo `feedback_subcollection_cleanup.md`.

## Dette technique

- **TD-011 ouvert** : seed de prix de test non aligné sur
  `phase-1-economy-values.md`. Faible criticité, trigger : avant
  `updateMarketPrices`.

## Prochaine étape

ÉTAPE 12 : upgradeInventoryCap

Référence : `phase-1-technical-implementation.md` section 2.

Particularités à anticiper :
- Gold sink : débit gold + augmentation cap inventaire dans la même
  transaction
- Validation : gold suffisant, cap actuel < cap maximum, resourceType valide
- Pas de favorRank, pas de contrat, pas de marketState
- Idempotency key optionnelle ou non ? À décider au ticket
