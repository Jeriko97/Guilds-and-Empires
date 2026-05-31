# Session 2026-05-31 — ÉTAPE 15 firestore.rules Phase 1

## Jalon majeur

**TD-010 RÉSOLUE — finding CRITICAL "No Firestore Security Rules" fermé.**
Prérequis critique avant intégration Unity ↔ backend satisfait.

## Livrables

- `firestore.rules` Phase 1 : 9 patterns couverts (players/{uid} + 5
  subcollections + 3 collections globales + deny-all fallback)
- 22 tests de rules via `@firebase/rules-unit-testing@5.0.1`, stables sur 2 runs
- 201/201 tests totaux (179 handlers inchangés + 22 nouveaux rules)
- `@firebase/rules-unit-testing@5.0.1` + `firebase@12.14.0` installés en devDeps
- TD-010 déplacée en section "TD Résolues" dans `technical-debt.md`
- Finding CRITICAL section 7 decisions-log → "Resolved (ÉTAPE 15)"
- D-ETAPE15 loggé dans decisions-log section 8

## Commits (ordre chronologique)

- `ff68b70` — chore(test): add @firebase/rules-unit-testing
- `76bb906` — feat(security): add Phase 1 firestore.rules with tests
- `d88f7c4` — docs: resolve TD-010 and log D-ETAPE15
- `8f401a3` — docs: sync BRIEFING after ETAPE 15 closure

## Inventaire du schéma Phase 1 (Tâche 0)

Collections couvertes par les rules :

| Collection | Règle |
|---|---|
| `players/{uid}` | read owner only, write false |
| `players/{uid}/buildings/{buildingId}` | idem |
| `players/{uid}/contracts/{contractId}` | idem |
| `players/{uid}/marketTrades/{tradeId}` | idem |
| `players/{uid}/inventoryUpgrades/{upgradeId}` | idem |
| `players/{uid}/guildPurchases/{purchaseId}` | idem |
| `marketState/{document}` | read if auth != null, write false |
| `activeWorldEvents/{eventId}` | idem |
| `contractPool/{contractId}` | idem |
| `/{document=**}` | deny-all fallback |

Collections legacy (`/profiles/`, `/transactionLogs/`, `/rateLimits/`) →
tombent dans le deny-all final. Pas de règles explicites (cohérent avec la
suppression prévue de ces collections fin Phase 1).

## Architecture de test (séparation Admin SDK / Client SDK)

Fichier : `firebase/functions/src/__test__/security/firestore.rules.test.ts`

Isolation garantie :
- Les tests handlers importent `firebase-admin` (Admin SDK bypass les rules).
- Ce fichier n'importe PAS firebase-admin. Utilise uniquement
  `@firebase/rules-unit-testing` (compat API : `db.collection().doc().get()`).
- `initializeTestEnvironment` charge `firestore.rules` depuis le fichier
  et les applique aux contextes `authenticatedContext` / `unauthenticatedContext`.
- Exception documentée à Convention #3 : `afterAll(() => testEnv.cleanup())`
  requis par l'API `@firebase/rules-unit-testing`. `--forceExit` reste filet.

## Couverture des 22 tests

**A. players/{uid} — quadruplet complet (1-4)**
- #1 OWNER read → ✅ | #2 OTHER read → ❌ | #3 unauth read → ❌ | #4 OWNER write → ❌

**B. players/{uid}/marketTrades — quadruplet complet (5-8)**
- #5 OWNER read → ✅ | #6 OTHER read → ❌ | #7 unauth read → ❌ | #8 OWNER write → ❌

**C. 4 autres subcollections — assertions allégées get() document (9-12)**
- buildings, contracts, inventoryUpgrades, guildPurchases : OWNER read ✅ / OTHER read ❌ / write ❌

**D. Collections globales — auth/unauth/write (13-15)**
- marketState, activeWorldEvents, contractPool : auth read ✅ / unauth ❌ / write ❌

**E. Deny-all (16)**
- randomCollection : auth read ❌ / unauth ❌ / write ❌

**F. Dimension query collection.get() — nominatif par collection (17-22)**
- #17 marketTrades OWNER → ✅ | #18 marketTrades OTHER → ❌
- #19 buildings, #20 contracts, #21 inventoryUpgrades, #22 guildPurchases : OWNER → ✅

## Vigilances V1–V6 satisfaites

- **V1** : Aucun import Admin SDK dans le fichier de rules test. ✅
- **V2** : marketTrades, inventoryUpgrades, guildPurchases explicitement couverts. ✅
- **V3** : `write: if false` dans toutes les rules. Testé en #4, #8, #9-12, #13-15, #16. ✅
- **V4** : deny-all final présent et testé (#16). ✅
- **V5** : Tâche 0 a confirmé la cohérence schéma/rules. Aucune collection oubliée. ✅
- **V6** : Section F (17-22) couvre `collection.get()` séparément des `doc.get()`. ✅

## Prochaine étape

Intégration Unity ↔ backend (ÉTAPE 16).
TD-010 résolue, finding CRITICAL fermé. Les Security Rules sont déployables.
