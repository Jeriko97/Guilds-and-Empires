# Briefing pour Claude Code — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle session Claude Code.

## Contexte projet rapide

Guilds & Empires (GAE) — MMORPG économique mobile médiéval-fantasy.
Phase 1 Vertical Slice en cours. Backend Firebase + Cloud Functions v2.

## État du repo (mise à jour : 2026-05-31)

- Branche active : feature/bootstrap-architecture
- Dernier commit : d88f7c4
- 9/9 Cloud Functions complètes (resolveLoginState, startProductionSlot,
  collectProduction, acceptContract, deliverToContract, sellToMarket,
  upgradeInventoryCap, purchaseGuildCharter, updateMarketPrices)
- 201/201 tests verts contre Firebase Emulator (179 handlers + 22 rules, stable sur 2 runs)
- **TD-010 RÉSOLUE** : firestore.rules Phase 1 + @firebase/rules-unit-testing@5.0.1
- Helper partagé : firebase/functions/src/shared/production.ts
  (processBuildingSlots — utilisé par resolveLoginState et collectProduction)
- Helper partagé : firebase/functions/src/shared/inventoryUpgrades.ts
  (INVENTORY_UPGRADE_COSTS, INVENTORY_UPGRADE_AMOUNTS — TD-012 pour Remote Config)
- Helper partagé : firebase/functions/src/shared/favorRank.ts
  (FAVOR_THRESHOLDS as const — 50/200/350 — consommé par computeFavorRank et purchaseGuildCharter)
- Helper partagé : firebase/functions/src/shared/guildCharter.ts
  (GUILD_CHARTER_COST=500, GUILD_CHARTER_FAVOR_THRESHOLD — TD-012 étendue)
- Helper partagé : firebase/functions/src/shared/marketPrices.ts
  (MARKET_PRICE_BOUNDS — basePrices 5/12/20, fourchettes — résolution TD-011)
- Helper partagé : firebase/functions/src/shared/computeMarketPrice.ts
  (computeMarketPrice, computeTrend, EventMultiplier — helper pur, testé sans emulator)
- Java 21 requis (Eclipse Temurin)
- Émulateur : firebase emulators:start --only firestore,auth
  --project demo-guilds-empires
- Tests : npm run test:emulator (depuis firebase/functions/)

## Skills à activer (Claude Code)

- unity-firebase-architect
- mobile-mmorpg-economy-systems-designer

Les deux skills sont dans le repo sous docs/skills/.

## Documents de référence dans le repo

Lire en priorité au démarrage :

- docs/architecture/phase-1-technical-implementation.md (architecture)
- docs/architecture/phase-1-decisions-log.md (décisions tranchées)
- docs/architecture/technical-debt.md (TD-001 à TD-012, TD-008 non ouverte)
- docs/architecture/schema-migrations.md (schéma Firestore v1)
- docs/design/phase-1-economy-values.md (valeurs économiques)
- Dernier docs/sessions/*.md disponible

## Conventions installées (NON négociables)

1. Pattern handler/wrapper TD-005 :
   - export type {Function}Request = CallableRequest<DataType>
   - export type {Function}Response = ResultType
   - export async function {function}Handler(request): Promise<Response>
   - export const {function} = onCall({...}, {function}Handler)

2. TD-007 : pas de FieldValue.serverTimestamp() dans les arrays
   Firestore. Utiliser Timestamp.now() à la place.

3. Tests : --runInBand obligatoire dans le script test:emulator.
   Pas de afterAll, --forceExit suffit.

4. Validators : asserts pour le narrowing TypeScript. Payload entrant
   typé en unknown, validé au runtime.

5. Transactions Firestore pour toute opération multi-document.

6. check-then-mutate : valider tout avant de modifier quoi que ce soit.

7. Pas de paramètre temporel reçu du client. Tout temps vient du
   serveur via Timestamp.now() ou serverTimestamp().

8. HttpsError typé : unauthenticated, resource-exhausted,
   invalid-argument, failed-precondition, not-found, internal.

9. Helper computeFavorRank disponible dans shared/favorRank.ts
   (seuils 50/200/350). À utiliser pour tout recalcul de favorRank
   côté serveur. Ne pas dupliquer la logique de seuils inline.

10. Tests concurrents : Promise.allSettled (jamais Promise.all) pour
    éviter les uncaught rejections. Assertions exhaustives sur l'état
    Firestore post-transaction obligatoires (décrément UNE seule fois,
    crédit UNE seule fois).

11. Commits atomiques par responsabilité.

## Méthode de travail attendue

- Validation par étape (ne pas enchaîner sans validation founder)
- Tickets précis avec règles strictes
- Audit visible avant exécution (montrer le diff, attendre validation)
- Tests verts avant commit (jamais commit du code rouge)
- Documenter dans TD log toute dette consciente

## Pattern industriel pour une nouvelle Cloud Function

1. Vérifier l'état du repo (git status, git log)
2. Implémenter le handler avec tous les imports nécessaires
3. Mettre à jour index.ts pour exporter la fonction
4. Implémenter les tests d'intégration (8-14 tests minimum)
5. Lancer l'Emulator + npm run test:emulator
6. Si tous verts : commit unique
7. Si rouge : analyser, proposer le fix, attendre validation,
   re-tester, commit

## Patterns introduits (cumulatifs)

- Double idempotency (ÉTAPE 12) : technique (subcollection) + métier
  (upgradesApplied guard). Ordre canonique : technique AVANT métier.
- Séparation upgradesApplied / cap : progression permanente vs valeur
  effective (compatible buffs futurs sans migration).
- `shared/inventoryUpgrades.ts` : constantes typées `as const` pour
  coûts et montants d'upgrade. Cast `as readonly number[]` pour indexage.
- FAVOR_THRESHOLDS factorisé (ÉTAPE 13) : seuils 50/200/350 dans
  `shared/favorRank.ts`. Re-export ciblé via `shared/guildCharter.ts`.
  Trigger : 2e consommateur du seuil 350 (D-ETAPE13).
- V5 — ordre checks économiques : prérequis sémantique (favor) AVANT
  transaction (gold). Cohérent avec UX : l'erreur explicative passe en premier.
- Snapshot analytique dans le ledger (ÉTAPE 13) : favorAtPurchase +
  favorRankAtPurchase dans guildPurchases. Permet analytics "âge de
  promotion Phase 2" sans relire l'historique.
- Scheduled CF pattern (ÉTAPE 14) : TD-005 adapté — handler exporté
  `updateMarketPricesHandler(random?, now?)` testé directement, wrapper
  `onSchedule` non triggerable par l'emulator. random et now injectés.
- Guard active vs decaying events (ÉTAPE 14) : pour active, `decayEndsAt`
  est null en Firestore (schéma correct). Le guard ne bloque que les
  decaying sans timestamps. Placeholder `decayEndsAt ?? endsAt` pour active.
- Helper pur computeMarketPrice (ÉTAPE 14) : testé sans emulator dans
  `__test__/computeMarketPrice.test.ts`. Import admin uniquement pour Timestamp.
- Fail loudly / fail silently (ÉTAPE 14) : marketState absent → log+return.
  marketState corrompu (struct incomplète) → throw Error (D-ETAPE14c).

## Prochaine étape

ÉTAPE 16 : Intégration Unity ↔ backend.
TD-010 résolue — les Security Rules sont en place.
Le finding CRITICAL "No Firestore Security Rules" est fermé.

Le founder enverra le ticket précis. Ne pas commencer à coder avant
réception du ticket.
