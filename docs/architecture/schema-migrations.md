# Firestore Schema Migrations

## Politique
- `schemaVersion` = constante dans les Cloud Functions (`CURRENT_SCHEMA_VERSION`)
- Migration = Cloud Function one-shot déployée, exécutée manuellement, puis retirée
- Chaque migration documentée ici avant déploiement

## Migrations

### v1 — Schéma initial Phase 1 (2026-05-19)

**Version source :** aucune (création)
**Version cible :** 1
**Fonction :** n/a — création du schéma, aucune migration nécessaire
**Dataset au déploiement :** pré-alpha, peu de documents joueurs

**Champs introduits :**
- `/players/{uid}` : `schemaVersion`, `gold`, `imperialFavor`, `inventory`,
  `favorRank`, `guildCharterUnlocked`, `firstContractCompleted`
- `/players/{uid}/buildings/{buildingId}` : `buildingType`, `level`, `slots[]`
- `/players/{uid}/contracts/{contractId}` : `contractTemplateId`, `tier`,
  `status`, `idempotencyKey`
  - **Précision (acceptContract — ÉTAPE 9)** : `idempotencyKey` = `playerContractId`,
    UUID généré côté serveur via `crypto.randomUUID()` au moment de l'acceptation.
    Sert de clé d'idempotence pour `deliverToContract` (ÉTAPE 10).
    Le document Firestore lui-même est stocké à l'ID = `playerContractId`.
- `marketState/{docId}` : `prices`, `priceHistory`
- `activeWorldEvents/{eventId}` : `eventType`, `status`, `priceMultipliers`
- `contractPool/{contractId}` : `tier`, `rewardGold`, `rewardFavor`
- `/rateLimits/{uid}_{action}` : `uid`, `action`, `lastCalledAt` — accès Admin SDK uniquement, jamais client
- `/players/{uid}/buildings/{buildingId}` — ajout de `lastProcessedAt: Timestamp | null` dans chaque `ProductionSlotState`
  - **Pas de migration de données requise** : le fallback `lastProcessedAt ?? startedAt` dans resolveLoginState
    gère les slots existants sans ce champ. Duplication one-shot possible au premier login post-déploiement (voir TD-003).
  - **Note** : `startedAt` utilise `Timestamp.now()` à l'écriture (pas `serverTimestamp()`) car `FieldValue` est
    interdit dans les éléments d'array Firestore. Voir TD-007.
- `/players/{uid}` — ajout de `marketSalesLastHour: Timestamp[]` (ÉTAPE 11)
  - **Pas de migration de données requise** : le fallback `player.marketSalesLastHour ?? []` dans `sellToMarket`
    gère les docs existants sans ce champ. Array vide = aucune vente enregistrée dans la fenêtre, comportement correct.
  - **Note** : Timestamp array — TD-007 s'applique, `Timestamp.now()` utilisé (jamais `serverTimestamp()`).
- `/players/{uid}/marketTrades/{idempotencyKey}` — trace immutable de vente marché (ÉTAPE 11)
  - `uid: string` — propriétaire de la vente
  - `resourceType: 'logs' | 'planks' | 'reconstructionKits'` — ressource vendue
  - `quantity: number` — quantité vendue
  - `priceApplied: number` — prix serveur au moment de la transaction (jamais fourni par le client)
  - `goldEarned: number` — gold crédité (= priceApplied × quantity)
  - `createdAt: Timestamp` — horodatage serveur
  - **ID du document** = `idempotencyKey` fourni par le client (UUID). Garantit l'idempotence :
    une clé existante avec même payload → résultat idempotent ; payload différent → `failed-precondition`.
  - **Pas de `schemaVersion`** : trace immutable, jamais migrée.
- `marketState/state` — ajout de `prices.reconstructionKits` et `priceHistory.reconstructionKits` (ÉTAPE 11)
  - Extension du singleton de prix pour couvrir les trois ressources vendables.
- `/players/{uid}/inventory.{resource}.upgradesApplied: number` — tracking progression upgrade cap (ÉTAPE 12)
  - Champ inline optionnel dans chaque `ResourceStack` (`logs`, `planks`, `reconstructionKits`).
  - **Pas de migration de données requise** : le fallback `upgradesApplied ?? 0` dans `upgradeInventoryCap`
    gère les docs existants sans ce champ. Absent = aucun upgrade acheté, comportement correct.
  - Sémantique : `upgradesApplied` = nombre de paliers achetés définitivement (0, 1 ou 2).
    Distinct de `cap` qui est la valeur effective (potentiellement boostée par buffs futurs).
- `/players/{uid}/inventoryUpgrades/{idempotencyKey}` — trace immutable d'upgrade cap (ÉTAPE 12)
  - `uid: string` — propriétaire de l'upgrade
  - `resourceType: 'logs' | 'planks' | 'reconstructionKits'` — ressource upgradée
  - `upgradeIndex: number` — palier acheté (0 ou 1)
  - `goldSpent: number` — gold consommé (= coût du palier, server-authoritative)
  - `capIncrease: number` — augmentation de cap appliquée (= montant du palier, server-authoritative)
  - `createdAt: Timestamp` — horodatage serveur (`Timestamp.now()`, TD-007)
  - **ID du document** = `idempotencyKey` fourni par le client (UUID). Garantit l'idempotence :
    une clé existante avec même payload → résultat idempotent ; payload différent → `failed-precondition`.
  - **Pas de `schemaVersion`** : trace immutable, jamais migrée.
  - Couverture Phase 1 : Logs et Planks ont 2 paliers (index 0 et 1), reconstructionKits a 1 palier (index 0).
    Coûts et montants définis dans `shared/inventoryUpgrades.ts` (TD-012 pour migration Remote Config).
- `/players/{uid}/guildPurchases/{idempotencyKey}` — trace immutable d'achat Guild Charter (ÉTAPE 13)
  - `uid: string` — propriétaire de l'achat
  - `goldSpent: number` — gold consommé (= `GUILD_CHARTER_COST` = 500, server-authoritative)
  - `favorAtPurchase: number` — snapshot de `imperialFavor` au moment de l'achat (analytics)
  - `favorRankAtPurchase: FavorRank` — snapshot de `favorRank` au moment de l'achat (analytics)
  - `createdAt: Timestamp` — horodatage serveur (`Timestamp.now()`, TD-007)
  - **ID du document** = `idempotencyKey` fourni par le client (UUID). Garantit l'idempotence :
    une clé existante avec même uid → résultat idempotent (`alreadyPurchased: true`) ;
    uid différent dans le record → `failed-precondition` (défense en profondeur).
  - **Pas de `schemaVersion`** : trace immutable, jamais migrée.
  - Achat unique par joueur : le flag `player.guildCharterUnlocked` empêche tout double achat cross-device.
    Le ledger assure l'audit trail économique et l'analytics "âge de promotion Phase 2".
  - Coût défini dans `shared/guildCharter.ts` (TD-012 étendue pour migration Remote Config).

**Note legacy :**
La collection `/profiles/{uid}` existe historiquement pour la fonction
`claimDailyBonus` (preuve de concept pré-spec). Elle sera supprimée
quand la Phase 1 Vertical Slice sera complète. Aucune migration de
données n'est prévue : `/profiles/` et `/players/` sont disjoints.

---

_Prochaine migration : v2 — à définir lors de l'introduction des bâtiments Phase 2_
