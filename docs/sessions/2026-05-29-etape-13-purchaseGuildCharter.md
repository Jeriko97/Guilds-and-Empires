# Session 2026-05-29 — ÉTAPE 13 purchaseGuildCharter

## Livrables

- 8/9 Cloud Functions complètes (purchaseGuildCharter ajoutée)
- 149/149 tests verts (14 nouveaux : intégration purchaseGuildCharter,
  stable sur 2 runs consécutifs)
- Gate Phase 2 implémentée : achat unique irréversible, gold sink majeur
  (500g = dépense unique la plus élevée Phase 1)
- Refacto FAVOR_THRESHOLDS : seuils 50/200/350 extraits vers
  `shared/favorRank.ts` — validé par les tests ÉTAPE 10 (computeFavorRank)
  restés verts SANS modification
- Pattern "ledger hybride" : subcollection `guildPurchases` (trace
  immutable) + flag inline `guildCharterUnlocked` (état runtime)
- Snapshot analytique `favorAtPurchase` + `favorRankAtPurchase` dans
  le doc ledger — analytics "âge de promotion Phase 2" sans relire
  l'historique
- V5 introduit : ordre checks économiques favor AVANT gold (prérequis
  sémantique avant transaction)
- Helper `shared/guildCharter.ts` créé (GUILD_CHARTER_COST,
  GUILD_CHARTER_FAVOR_THRESHOLD)
- TD-012 étendue : scope couvre désormais `shared/inventoryUpgrades.ts`
  ET `shared/guildCharter.ts`
- D-ETAPE13 loggé dans decisions-log : factorisation FAVOR_THRESHOLDS,
  trigger YAGNI, pattern re-export ciblé
- Schéma `schema-migrations.md` v1 : subcollection `guildPurchases`
  documentée avec tous les champs et leur sémantique

## Commits (ordre chronologique)

- 299ab0d — refactor(favor): extract FAVOR_THRESHOLDS to shared/favorRank.ts
- 5c16b1a — feat(guildCharter): add purchaseGuildCharter with hybrid idempotency
- edfa473 — docs: extend TD-012 scope and log D-ETAPE13

## Nouveaux helpers partagés

- `shared/favorRank.ts` : export de `FAVOR_THRESHOLDS as const`
  (`{ approved_merchant: 50, imperial_entrepreneur: 200, guild_charter_eligible: 350 }`).
  `computeFavorRank` consomme désormais ces constantes — aucun changement de comportement.
- `shared/guildCharter.ts` : `GUILD_CHARTER_COST = 500` +
  `GUILD_CHARTER_FAVOR_THRESHOLD = FAVOR_THRESHOLDS.guild_charter_eligible`.
  Re-export ciblé : le handler n'importe que depuis `guildCharter.ts`, sans
  couplage direct à `favorRank.ts`.

## Décisions tranchées

- **Source du coût** : constante locale `GUILD_CHARTER_COST = 500` dans
  `shared/guildCharter.ts`. Pas de Remote Config (TD-012 étendue — migration
  mutualisée avec inventoryUpgrades avant premier playtest externe).
- **Factorisation FAVOR_THRESHOLDS** : trigger YAGNI activé par le 2e
  consommateur du seuil 350. Re-export via `shared/guildCharter.ts` pour
  éviter le couplage direct handler → favorRank.ts (D-ETAPE13).
- **Double idempotency hybride** :
  1. Technique : `/players/{uid}/guildPurchases/{idempotencyKey}` — ledger
     immutable, audit trail économique, analytics Phase 2
  2. Métier : `player.guildCharterUnlocked === false` guard — cross-device,
     état runtime progression
  Pattern cohérent avec marketTrades (ÉTAPE 11) et inventoryUpgrades (ÉTAPE 12).
- **Snapshot analytique** : `favorAtPurchase` (valeur réelle au moment de
  l'achat, pas le seuil 350) + `favorRankAtPurchase` (dénormalisé depuis
  player.favorRank). Coût write négligeable, valeur analytics forte.
- **Ordre canonique V4** : idempotency technique (subcollection) vérifiée en
  4c AVANT idempotency métier (guildCharterUnlocked) en 4d. Un replay légitime
  serait rejeté par le check métier si l'ordre était inversé (guildCharterUnlocked
  déjà true après le premier appel).
- **V5 — ordre checks économiques** : favor vérifié en 4e AVANT gold en 4f.
  Raison UX : la favor est le prérequis sémantique (confiance de l'Empire), le
  gold est la transaction. L'erreur la plus explicative passe en premier.
  Test #11 (`favor=0, gold=0` → "insufficient imperial favor") valide cet ordre.

## Points de vigilance respectés

- **V1 — `now = Timestamp.now()` figé hors transaction.** Capturé une seule
  fois avant `runTransaction`. Utilisé pour `guildCharterPurchasedAt` (player)
  ET `createdAt` (doc ledger). Aucun `Timestamp.now()` dans le callback.
- **V2 — Champs explicites dans `tx.update`.** Trois champs distincts :
  `gold`, `guildCharterUnlocked`, `guildCharterPurchasedAt`. Pas de spread
  d'objet entier. Pas de dot-path notation.
- **V3 — Reads player ET guildPurchaseRef DANS la transaction.** `Promise.all([
  tx.get(playerRef), tx.get(guildPurchaseRef) ])` en début de callback.
  Anti-TOCTOU strict.
- **V4 — Ordre canonique idempotency : technique AVANT métier.** Step 4c
  (subcollection) avant step 4d (guildCharterUnlocked). Validé par test #4
  (replay idempotent technique retourne alreadyPurchased=true sans atteindre
  le check métier).
- **V5 — Ordre checks économiques : favor AVANT gold.** Step 4e avant step 4f.
  Validé par test #11 (`favor=0, gold=0` → message exact "insufficient imperial
  favor", pas "insufficient gold").

## 4 vérifications de clôture (audit post-implémentation)

1. **Snapshot favorAtPurchase / favorRankAtPurchase** : handler L114-117 écrit
   `favorAtPurchase: player.imperialFavor` (valeur réelle). Test A.2 ([test:117])
   assert `favorAtPurchase === 400` avec `imperialFavor: 400`. Test A.3 ([test:139-141])
   assert exhaustif des deux champs avec valeurs exactes.
2. **V4 — ordre canonique test #4** : handler L74-93 — `guildPurchaseSnap.exists`
   (4c) avant `guildCharterUnlocked` (4d). Le test #4 call2 retourne
   `alreadyPurchased: true` même si `guildCharterUnlocked === true` après call1.
3. **V5 — message exact test #11** : assert `{ code: "failed-precondition",
   message: "insufficient imperial favor" }` avec `satisfies Partial<HttpsError>`.
   Message complet asserté, pas juste le code.
4. **Ghost write test #13** : `expect(purchaseSnap.docs.length).toBe(1)` sur la
   collection entière post-Promise.allSettled. La tx rejetée par
   `guildCharterUnlocked === true` n'atteint jamais les mutations 4g.

## Prochaine étape

ÉTAPE 14 : updateMarketPrices

Référence : `phase-1-technical-implementation.md` section 3.

Points clés :
- 1ère Scheduled CF — nouveau pattern (functions.scheduler.onSchedule)
- Algorithme de drift prix + multiplicateurs world events actifs
- Tests : handler exporté directement (Scheduled Functions non
  triggerables nativement par l'émulateur)
- TD-011 : premier moment logique pour aligner les seeds de prix tests
  sur les valeurs officielles de `phase-1-economy-values.md`
