# Session 2026-05-28 — ÉTAPE 12 upgradeInventoryCap

## Livrables

- 7/9 Cloud Functions complètes (upgradeInventoryCap ajoutée)
- 135/135 tests verts (20 nouveaux : intégration upgradeInventoryCap,
  stable sur 2 runs consécutifs)
- 1ère CF "progression économique permanente" (gold sink sans contrepartie
  ressource immédiate)
- Pattern "double idempotency" introduit : technique (subcollection) + métier
  (guard upgradesApplied). Ordre canonique établi : technique AVANT métier.
- Séparation upgradesApplied / cap : progression permanente irréversible vs
  valeur effective (compatible buffs futurs sans migration)
- Helper `shared/inventoryUpgrades.ts` créé (INVENTORY_UPGRADE_COSTS,
  INVENTORY_UPGRADE_AMOUNTS, types UpgradeableResource et UpgradeIndex)
- Schéma `schema-migrations.md` v1 documenté (subcollection
  inventoryUpgrades + champ upgradesApplied inline)
- TD-012 ouverte (hardcode upgrade costs — migration Remote Config avant
  premier playtest externe)

## Commits (ordre chronologique)

- 49c339b — feat(inventory): add upgradeInventoryCap with double idempotency
- fcb4dc4 — docs: open TD-012 and document inventoryUpgrades schema

## Types mis à jour dans shared/types.ts

- `ResourceStack` : ajout de `upgradesApplied?: number` (optionnel,
  fallback `?? 0` dans le handler, aucune migration requise)
- Sémantique : `upgradesApplied` = nombre de paliers achetés de manière
  permanente (0, 1, ou 2). Distinct de `cap` qui reste la valeur effective.

## Décisions tranchées

- **Source des coûts** : constantes locales dans `shared/inventoryUpgrades.ts`
  (pas Remote Config). TD-012 ouverte pour la migration ultérieure.
- **Tracking progression** : flag inline `inventory.{resource}.upgradesApplied`
  dans le doc player — évite une lecture supplémentaire en sous-collection.
- **Couverture Phase 1** : Logs et Planks ont 2 paliers (0 et 1),
  reconstructionKits a 1 palier (0 uniquement). `upgradeIndex=1` avec
  `reconstructionKits` → invalid-argument "upgrade tier not available for
  this resource". Validé avant la transaction par comparaison
  `upgradeIndex >= costTable.length`.
- **Idempotency technique** : sous-collection
  `/players/{uid}/inventoryUpgrades/{idempotencyKey}` — cohérent avec
  marketTrades (ÉTAPE 11).
- **Idempotency métier** : check `upgradesApplied === upgradeIndex` avant
  mutation. Gate séquentielle : seul le palier immédiatement suivant est
  autorisé.
- **Ordre canonique V4** : idempotency technique (subcollection) vérifiée
  en 5c AVANT idempotency métier (upgradesApplied) en 5d. Un replay légitime
  serait rejeté par le check métier si l'ordre était inversé (upgradesApplied
  déjà incrémenté lors du premier appel).
- **Cast `as readonly number[]`** : nécessaire pour indexer les tuples `as
  const` avec un index dynamique. TypeScript `strict: true` sans
  `noUncheckedIndexedAccess` — le guard `upgradeIndex >= costTable.length`
  garantit la validité au runtime.

## Points de vigilance respectés

- **V1 — `now = Timestamp.now()` figé hors transaction.** Capturé une seule
  fois avant le `runTransaction`, passé par closure dans `createdAt` du doc
  inventoryUpgrades. Aucun `Timestamp.now()` à l'intérieur du callback.
- **V2 — Clone explicite + spread imbriqué.** Mutation inventory via
  `{ ...player.inventory, [validResource]: { ...player.inventory[validResource],
  cap: ..., upgradesApplied: ... } }`. Jamais de notation dot-path, jamais de
  mutation in-place.
- **V3 — Reads player ET upgradeRecord DANS la transaction.** `Promise.all([
  tx.get(playerRef), tx.get(upgradeRecordRef) ])` en début de callback.
  Anti-TOCTOU strict.
- **V4 — Ordre canonique double idempotency.** Step 5c (subcollection) avant
  step 5d (upgradesApplied). Validé par test #6 (replay idempotent technique
  retourne alreadyUpgraded=true sans passer par le check métier).

## Méthode

4 vérifications de clôture demandées par le founder et confirmées par lecture
directe du fichier test (ligne par ligne) :
1. Test #6 : `alreadyUpgraded === true` et `newGold === goldAfterCall1` assertés.
   Firestore post-call2 : gold, cap, upgradesApplied inchangés depuis call1.
2. Tests #9 et #10 : messages distincts assertés avec `satisfies Partial<HttpsError>`
   ("upgrade tier already applied" vs "previous upgrade tier required").
3. Test #18 : player créé sans `upgradesApplied` → fallback `?? 0` →
   `result.newUpgradesApplied === 1`. Cas critique pré-alpha.
4. Test #20 : `upgradeSnap.docs.length === 1` asserté post-concurrent —
   la tx rejetée ne génère pas de ghost write dans inventoryUpgrades.

## Points à surveiller pour ÉTAPE 13

- **Factorisation FAVOR_THRESHOLDS** : le seuil 350 ("guild_charter_eligible")
  est actuellement dans `shared/favorRank.ts`. `purchaseGuildCharter` devra
  vérifier `favorRank === "guild_charter_eligible"` — à lire depuis le doc
  player (dénormalisé) ou recalculer depuis `imperialFavor`. Pas de duplication
  inline du seuil.
- **Pattern guildPurchases** : la sous-collection
  `/players/{uid}/guildPurchases/{key}` répétera le pattern ledger
  (marketTrades, inventoryUpgrades). Si une 4e CF utilise le même pattern,
  une abstraction pourrait être envisagée — mais pas avant (YAGNI).
- **TD-012 Remote Config** : le ticket ÉTAPE 13 doit décider si le coût 500g
  de purchaseGuildCharter est ajouté dans `shared/guildCharter.ts` (nouveau
  helper) ou mutualisé dans une migration Remote Config globale. Si mutualisé,
  TD-012 devient le ticket de migration pour tous les coûts Phase 1.

## Prochaine étape

ÉTAPE 13 : purchaseGuildCharter

Référence : `phase-1-technical-implementation.md` section 2.
