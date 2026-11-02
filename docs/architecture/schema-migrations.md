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

**Note ÉTAPE 14 :** `marketState/state` est désormais mis à jour périodiquement par la Scheduled CF
`updateMarketPrices` (toutes les 5 minutes). Aucun changement de schéma — les champs `lastUpdatedAt`,
`prices.{resource}.{currentPrice,basePrice,trend}` et `priceHistory.{resource}[]` existaient déjà.
L'algorithme de drift, les basePrices officiels (logs=5, planks=12, kits=20) et les fourchettes sont
définis dans `shared/marketPrices.ts` (résolution TD-011).

**Note ÉTAPE 16.5 :** `resolveLoginState` seede un building Sawmill (`sawmill_0`, 3 slots null)
au premier login (`!playerSnap.exists`), second write de la même transaction que la création du
player. Pas de migration de données : s'applique aux nouveaux joueurs uniquement ; les players
existants sans building ne sont pas rétro-seedés (acceptable pré-alpha, ~0 joueur — cf. TD-003).

**Note TD-020 — statut : PRÉVU, pas encore implémenté (D-TD020-003, arbitrage A) :**
`marketState/state` recevra `referencePrices.{logs,planks,reconstructionKits}` (entiers) : le prix de référence
hors event, suivi à part du prix publié (D-TD020-002).
- **Pas de migration de données, pas de script, aucune écriture manuelle en production** : `updateMarketPrices`
  crée le champ à la volée, dans la même transaction que la relecture des prix, au premier passage qui ne le trouve
  pas. Référence = `prices.{ressource}.currentPrice` s'il n'y a aucun event `active`/`decaying` sur la ressource.
  Dans le cas contraire, erreur explicite et document inchangé.
- `schemaVersion` reste 1 (champ ajouté avec repli, comme `marketSalesLastHour`) ; le seed l'écrit pour les
  nouveaux documents.
- `activeWorldEvents/{eventId}.decayEndsAt` : calculé à l'activation (`endsAt + EVENT_DECAY_DURATION_MS`, 60 min)
  au lieu de rester null jusqu'à la fin de l'event (D-TD020-003, arbitrage C), dans la sous-étape
  `processWorldEventLifecycle`. Aucun event n'existe en production : pas de donnée à migrer.
- Ordre de déploiement : `updateMarketPrices` corrigée, puis `referencePrices` constaté dans `marketState/state`,
  AVANT tout déploiement de `processWorldEventLifecycle` (autre prérequis, hors schéma : TD-021, voir TD-020).
- Détail, cas d'erreur et tests : `technical-debt.md`, TD-020.

**Note ÉTAPE 19 — statut : implémenté en 19.1 (`fcaa47a`), non déployé (D-ETAPE19-001 à 004) :**
- `/players/{uid}/buildings/{buildingId}.slots[]` : deux champs ajoutés, `cyclesPlanned` (N du lot) et
  `cyclesProcessed` (cycles traités). Champ absent = `null` : slot de logs (production continue) ou slot libre. Pas
  de migration pour ces slots ; `schemaVersion` reste 1 (champ ajouté avec repli).
- `/players/{uid}/productionOps/{idempotencyKey}` : nouvelle sous-collection de traces d'idempotence (lancement et
  arrêt), écrite par les Cloud Functions uniquement ; refus client couvert en 19.1 par la règle de repli
  `/{document=**}` de `firestore.rules` (test rules 23).
- **Vérifié le 2026-11-02 (lecture seule autorisée par le founder, ADC, `guildsandempires-ca543`)** : 1 bâtiment,
  3 slots, tous `logs` ; **aucun slot `planks` ou `reconstruction_kits`** → aucune reprise, aucune migration. À
  refaire juste avant le déploiement 19.5 : un slot de transformation créé d'ici là par appel direct (TD-023) rendrait
  le compte illisible (`internal`) après déploiement.
- **Slot hérité** : un slot `planks` ou `reconstruction_kits` lancé avant l'ÉTAPE 19 n'a pas ces champs et
  produit sans fin (TD-023). Aucun n'existait en production le 2026-11-02 (ci-dessus) ; le contrôle est refait
  avant le déploiement 19.5. Toute reprise d'un tel slot (écriture en production) est une escalade cas 1, décrite
  ici avant déploiement. Un slot de transformation sans `cyclesPlanned`
  n'est jamais traité comme une production continue : c'est une donnée à reprendre (erreur explicite, ou reprise
  décidée en escalade), sinon TD-023 persisterait pour ce slot.

**Note legacy :**
La collection `/profiles/{uid}` existe historiquement pour la fonction
`claimDailyBonus` (preuve de concept pré-spec). Elle sera supprimée
quand la Phase 1 Vertical Slice sera complète. Aucune migration de
données n'est prévue : `/profiles/` et `/players/` sont disjoints.

---

_Prochaine migration : v2 — à définir lors de l'introduction des bâtiments Phase 2_
