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

**Note legacy :**
La collection `/profiles/{uid}` existe historiquement pour la fonction
`claimDailyBonus` (preuve de concept pré-spec). Elle sera supprimée
quand la Phase 1 Vertical Slice sera complète. Aucune migration de
données n'est prévue : `/profiles/` et `/players/` sont disjoints.

---

_Prochaine migration : v2 — à définir lors de l'introduction des bâtiments Phase 2_
