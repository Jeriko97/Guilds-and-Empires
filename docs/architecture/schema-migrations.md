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
- `/global/marketState` : `prices`, `priceHistory`
- `/global/activeWorldEvents/{eventId}` : `eventType`, `status`, `priceMultipliers`
- `/global/contractPool/{contractId}` : `tier`, `rewardGold`, `rewardFavor`
- `/rateLimits/{uid}_{action}` : `uid`, `action`, `lastCalledAt` — accès Admin SDK uniquement, jamais client
- `/players/{uid}/buildings/{buildingId}` — ajout de `lastProcessedAt: Timestamp | null` dans chaque `ProductionSlotState`
  - **Pas de migration de données requise** : le fallback `lastProcessedAt ?? startedAt` dans resolveLoginState
    gère les slots existants sans ce champ. Duplication one-shot possible au premier login post-déploiement (voir TD-003).

**Note legacy :**
La collection `/profiles/{uid}` existe historiquement pour la fonction
`claimDailyBonus` (preuve de concept pré-spec). Elle sera supprimée
quand la Phase 1 Vertical Slice sera complète. Aucune migration de
données n'est prévue : `/profiles/` et `/players/` sont disjoints.

---

_Prochaine migration : v2 — à définir lors de l'introduction des bâtiments Phase 2_
