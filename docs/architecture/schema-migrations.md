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

**Note legacy :**
La collection `/profiles/{uid}` existe historiquement pour la fonction
`claimDailyBonus` (preuve de concept pré-spec). Elle sera supprimée
quand la Phase 1 Vertical Slice sera complète. Aucune migration de
données n'est prévue : `/profiles/` et `/players/` sont disjoints.

---

_Prochaine migration : v2 — à définir lors de l'introduction des bâtiments Phase 2_
