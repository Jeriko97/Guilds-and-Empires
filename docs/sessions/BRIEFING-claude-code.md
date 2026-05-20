# Briefing pour Claude Code — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle session Claude Code.

## Contexte projet rapide

Guilds & Empires (GAE) — MMORPG économique mobile médiéval-fantasy.
Phase 1 Vertical Slice en cours. Backend Firebase + Cloud Functions v2.

## État du repo (mise à jour : 2026-05-21)

- Branche active : feature/bootstrap-architecture
- Dernier commit : 4f97104
- 4/9 Cloud Functions complètes (resolveLoginState, startProductionSlot,
  collectProduction, acceptContract)
- 64/64 tests verts contre Firebase Emulator (stable sur 2 runs)
- Helper partagé : firebase/functions/src/shared/production.ts
  (processBuildingSlots — utilisé par resolveLoginState et collectProduction)
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
- docs/architecture/technical-debt.md (TD-001 à TD-009, TD-008 non ouverte)
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

9. Commits atomiques par responsabilité.

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

## Prochaine étape

ÉTAPE 10 : deliverToContract

Référence détaillée :
docs/architecture/phase-1-technical-implementation.md section 2.

Le founder enverra le ticket précis après ce briefing. Ne pas commencer
à coder avant réception du ticket.
