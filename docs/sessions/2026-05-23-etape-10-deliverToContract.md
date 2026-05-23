# Session 2026-05-23 — ÉTAPE 10 deliverToContract

## Livrables

- 5/9 Cloud Functions complètes (deliverToContract ajoutée)
- 94/94 tests verts (30 nouveaux : 8 unitaires favorRank + 22 intégration
  deliverToContract, stable sur 2 runs)
- Helper pur shared/favorRank.ts créé (computeFavorRank, testé sans Emulator)
- Pattern de validation et d'erreurs intégralement aligné sur les
  conventions TD-005 + TD-007 + check-then-mutate
- Premier handler "critique économie" Phase 1 : détruit des ressources,
  crédite gold + favor, modifie favorRank dénormalisé, flippe
  firstContractCompleted

## Commits (ordre chronologique)

- 84c16d1 — feat(contracts): add deliverToContract with favorRank helper

## Décisions tranchées

- Livraison TOUT-OU-RIEN Phase 1 : inventory >= quantityRequired complet,
  sinon failed-precondition. quantityDelivered conservé dans le schéma
  pour préparer Phase 2 (livraisons partielles).
- Helper favorRank.ts extrait dans shared/, magic numbers inlinés
  (50, 200, 350) plutôt que constante FAVOR_THRESHOLDS exportée — à
  factoriser si purchaseGuildCharter (ÉTAPE 13) duplique les seuils.
- Invariant `favor < 0` retiré de computeFavorRank — cohérent avec le
  design où imperialFavor ne décroît jamais.
- firstContractCompleted réécrit à true à chaque livraison (idempotent
  no-op si déjà true) plutôt que conditionnellement. Coût : 1 write
  field négligeable, économie : pas de branchement dans le handler.
- Idempotency TOLÉRANTE avec double flag dans la réponse :
  alreadyDelivered + rewardsGranted permettent au client de distinguer
  livraison initiale vs retry réussi vs no-op.
- Mismatch idempotencyKey sur contrat completed → HttpsError
  failed-precondition "contract already completed with different
  idempotency key". Pas de succès silencieux qui masquerait un bug
  client.
- newFavorRank dans la réponse : null si pas de transition de tier,
  valeur du nouveau rang si transition. Signale explicitement le
  changement sans forcer un comparatif côté client.
- Player inexistant ou favorRank manquant → failed-precondition (pas
  not-found) avec messages distincts pour debuggabilité. Alignement
  avec la décision ÉTAPE 9 "absence du champ = failed-precondition,
  pas de fallback silencieux".

## Points techniques de vigilance respectés

- `now = Timestamp.now()` capturé UNE SEULE FOIS en début de transaction,
  réutilisé pour le check expiresAt + completedAt (déterminisme,
  philosophie TD-007).
- Inventory cloné en spread complet (...player.inventory + ...nested)
  au lieu de notation dot-path Firestore. Pattern systématique pour
  toutes les mutations nested en transaction.
- Tests concurrence (#19 et #20) en Promise.allSettled, aucun await
  intermédiaire entre les 2 calls, assertions exhaustives sur l'état
  Firestore post-transaction (inventory décrémenté UNE fois, gold
  crédité UNE fois).

## Méthode

- Émulateur Firebase démarré par Claude Code lui-même en background
  avec attente active (until grep "All emulators ready") + timeout 60s
  de sécurité. Plus de sleep fragile.
- Audit en 2 passes : régression + ESLint + TypeScript en 1er, puis
  audit ligne par ligne des 4 fichiers nouveaux + diff index.ts.
- Cross-check GPT a permis de remplacer le sleep par un wait actif
  (philosophie déterminisme cohérente avec TD-007).

## Points à surveiller pour la suite

- TD potentielle test concurrence #19 : assert un message d'erreur
  précis ("contract already completed with different idempotency key").
  Stable en émulateur, mais pourrait devenir flaky en cloud selon
  l'ordering des transactions Firestore concurrentes. À monitorer
  lors du premier deploy staging.
- FAVOR_THRESHOLDS à factoriser dans shared/favorRank.ts si ÉTAPE 13
  purchaseGuildCharter duplique le seuil 350. YAGNI tant que pas
  duplication réelle.
- Pattern Promise.all([clearGlobalTestData(), clearTestData()]) dans
  beforeEach utilisé pour la première fois dans deliverToContract.test.ts.
  À standardiser dans helpers.ts si une 3e suite (sellToMarket ÉTAPE 11
  probablement) en a besoin.

## Prochaine étape

ÉTAPE 11 : sellToMarket

Particularités à anticiper :
- Première CF qui lit /marketState/state (singleton de prix)
- Server-authoritative absolu sur le prix appliqué : lu depuis Firestore,
  jamais fourni par le client
- Rate limit anti-farming : 20 ventes / heure par uid
- Validation quantity : > 0, <= inventory, <= seuil par transaction
- Idempotency key fournie par le client (UUID)
- Update inventory + gold dans la même transaction
- Pas de favorRank affecté (la vente marché ne donne pas de favor)
- Pas de side effect sur firstContractCompleted

Hors-scope ÉTAPE 11 :
- updateMarketPrices (scheduled CF) viendra dans une étape dédiée
- En attendant, les tests créeront un /marketState/state seed à la main
