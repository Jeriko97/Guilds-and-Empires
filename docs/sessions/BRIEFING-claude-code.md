# Briefing pour Claude Code — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle session Claude Code.

## Contexte projet rapide

Guilds & Empires (GAE) — MMORPG économique mobile médiéval-fantasy.
Phase 1 Vertical Slice en cours. Backend Firebase + Cloud Functions v2.

## État du repo (mise à jour : 2026-05-28)

- Branche active : feature/bootstrap-architecture
- Dernier commit : fcb4dc4
- 7/9 Cloud Functions complètes (resolveLoginState, startProductionSlot,
  collectProduction, acceptContract, deliverToContract, sellToMarket,
  upgradeInventoryCap)
- 135/135 tests verts contre Firebase Emulator (stable sur 2 runs)
- Helper partagé : firebase/functions/src/shared/production.ts
  (processBuildingSlots — utilisé par resolveLoginState et collectProduction)
- Helper partagé : firebase/functions/src/shared/inventoryUpgrades.ts
  (INVENTORY_UPGRADE_COSTS, INVENTORY_UPGRADE_AMOUNTS — TD-012 pour Remote Config)
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

## Prochaine étape

ÉTAPE 13 : purchaseGuildCharter

Référence détaillée :
docs/architecture/phase-1-technical-implementation.md section 2.

Particularités à anticiper :
- Double condition cumulée : favorRank == "guild_charter_eligible"
  ET gold >= 500 (les deux doivent être vérifiées dans la transaction)
- Gold sink critique : 500g = dépense unique la plus élevée Phase 1
- Flippe guildCharterUnlocked = true (boolean inline dans PlayerDocument)
- Set guildCharterPurchasedAt = Timestamp.now() (TD-007)
- Idempotency double :
  1. Technique : sous-collection /players/{uid}/guildPurchases/{key}
     (pattern cohérent avec marketTrades et inventoryUpgrades)
  2. Métier : check guildCharterUnlocked === false avant mutation
     (empêche double achat cross-device — pattern hybride ÉTAPE 12)
- Factorisation FAVOR_THRESHOLDS : le seuil 350 ("guild_charter_eligible")
  existe déjà dans shared/favorRank.ts. Ce handler doit consommer cette
  constante — NE PAS dupliquer inline.
- Constante coût 500g dans shared/guildCharter.ts (nouveau helper),
  TD-012 Remote Config étendue à cette valeur
- Pas de favorRank affecté, pas de side effect production/marché

Le founder enverra le ticket précis. Ne pas commencer à coder avant
réception du ticket.
