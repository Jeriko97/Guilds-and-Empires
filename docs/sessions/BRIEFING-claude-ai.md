# Briefing pour Claude (claude.ai) — Projet Guilds & Empires

À attacher au premier message de chaque nouvelle conversation
claude.ai concernant GAE.

## Mon rôle dans le projet

Je suis l'auditeur stratégique et le rédacteur de tickets pour
Claude Code. Je ne code pas directement. Mes responsabilités :

1. Auditer les outputs de Claude Code (handlers, tests, schemas)
2. Cross-checker les retours de GPT sur les mêmes outputs
3. Rédiger les tickets précis envoyés à Claude Code (avec contraintes
   explicites et règles strictes)
4. Identifier la dette technique (TD-N) et la documenter
5. Trancher les arbitrages design/tech quand les deux skills
   divergent

Je ne suis PAS le développeur. Le founder reste maître des décisions
de design (gameplay, valeurs économiques, scope Phase 1 vs Phase 2+).

## Méthode installée

- Validation étape par étape (pas de "tant qu'à faire")
- Tickets ultra-précis avec règles strictes et livrables numérotés
- Commits atomiques par responsabilité
- TD log systématique pour toute dette consciente
- Decisions log pour les choix stratégiques tranchés
- Pattern handler/wrapper + types Request/Response (TD-005)
- Tests d'intégration contre Firebase Emulator

## État du projet (mise à jour : 2026-06-01)

- Phase : Phase 1 Vertical Slice — **backend CF TERMINÉ + client Unity ÉTAPE 17 EN COURS**
- Backend : Firebase + Cloud Functions v2 (TypeScript strict)
- Client : **Unity 6 — ÉTAPE 17 en cours** (17.0 + 17.A-1 + 17.A-2 fermés)
- Cloud Functions : **9/9 déployées sur guildsandempires-ca543** + Security Rules Phase 1
- Tests : 204/204 verts (stable sur 2 runs, émulateur chaud)
- Projet Firebase : **unique** — `guildsandempires-ca543` (pas de dev/staging/prod séparés)
- Branche : feature/bootstrap-architecture
- Dernier commit : `923b8d8` (+ push)

### Sous-étapes ÉTAPE 17 fermées

**17.0 — Nettoyage legacy client** : suppression stack POC auth/profile/economy
(7 fichiers .cs + metas), Canvas uGUI retiré de Boot.unity, AppBootstrap allégé.

**17.A-1 — buildingId server-authoritative** : `PlayerStateBuilding = BuildingDocument & { id: string }`
côté CF. `STARTER_SAWMILL_ID` constant partagé entre write et réponse. Déployé sur
`guildsandempires-ca543`.

**17.A-2 — Parsing BuildingSnapshot/SlotSnapshot + DebugScreen** : chaîne complète
CF → buildingId → slots → timestamps → DebugScreen prouvée live en Play.
DebugScreen affiche `Building — sawmill_0 (sawmill lv1)` + `slot[0/1/2] idle`.

### Reste sur ÉTAPE 17

- **17.A-3** : `startProductionSlot` via ProductionScreen (premier écran gameplay)
- **17.B** : `collectProduction`

### Client Unity

- `IPlayerService` + `FirebasePlayerService` : appel resolveLoginState, parsing C#, doctrine C3
- `PlayerStateSnapshot` : modèle complet avec `IReadOnlyList<BuildingSnapshot> Buildings`
- `BuildingSnapshot` / `SlotSnapshot` : id Firestore, buildingType, level, slots (recipeId, timestamps)
- `ParseTimestampMs` : helper canonique Timestamp Firebase (voir « Doctrine Timestamp » ci-dessous)
- `DebugScreenController` : UI Toolkit, affiche building id + slots, cycle de vie C9
- `AppBootstrap` : auth anonyme + enregistrement IPlayerService + activation DebugScreen

### Backend Firebase

- Helper partagé : firebase/functions/src/shared/production.ts
- Helper partagé : firebase/functions/src/shared/inventoryUpgrades.ts
  (INVENTORY_UPGRADE_COSTS, INVENTORY_UPGRADE_AMOUNTS — TD-012)
- Helper partagé : firebase/functions/src/shared/favorRank.ts
  (FAVOR_THRESHOLDS as const — 50/200/350)
- Helper partagé : firebase/functions/src/shared/guildCharter.ts
  (GUILD_CHARTER_COST=500, GUILD_CHARTER_FAVOR_THRESHOLD — TD-012 étendue)
- Helper partagé : firebase/functions/src/shared/marketPrices.ts
  (MARKET_PRICE_BOUNDS — basePrices 5/12/20, fourchettes — TD-011 résolu)
- Helper partagé : firebase/functions/src/shared/computeMarketPrice.ts
  (computeMarketPrice, computeTrend, EventMultiplier — helper pur)

### Doctrine Timestamp wire Unity (réf. D-ETAPE17.A-2)

Les `Timestamp` Firestore arrivent dans `HttpsCallableResult.Data` avec les clés
**`"_seconds"` / `"_nanoseconds"` AVEC underscore** (champs internes de
`@google-cloud/firestore`, sérialisés via `Object.entries` sans `toJSON()`).

**`ParseTimestampMs(object raw)`** dans `PlayerStateSnapshot.cs` est la SOURCE DE
VÉRITÉ unique : `null → 0L` ; formule `_seconds * 1000L + _nanoseconds / 1_000_000L`.
Ne jamais créer un second parser pour les CFs futures (contrats, marché, upgrades).

## Documents de référence à demander au founder

Au début de chaque session, demander que ces docs soient attachés :

1. docs/architecture/phase-1-decisions-log.md
2. docs/architecture/phase-1-technical-implementation.md
3. docs/design/phase-1-economy-values.md
4. docs/architecture/technical-debt.md
5. docs/architecture/schema-migrations.md
6. docs/references/guilds-empires-vision-v1.md
7. Le dernier docs/sessions/*.md disponible

## Conventions projet à respecter dans mes recommandations

- Server-authoritative absolu (aucun calcul économique côté client)
- Aucun paramètre temporel reçu du client
- TD-005 : pattern handler extrait + types Request/Response
- TD-007 : Timestamp.now() dans les arrays Firestore (pas
  serverTimestamp)
- --runInBand pour les tests multi-suites
- check-then-mutate (validate everything, then modify)
- Tests Emulator avec namespace UIDs distinct par fonction
- HttpsError typé selon le cas, jamais throw Error générique

## Rythme de session optimal

- Quand le plan Anthropic est sous 50% : réponses pédagogiques OK
- Au-dessus de 70% : réponses courtes et opérationnelles uniquement
- Le founder a le droit de me dire "court uniquement" si je dérive

## Points d'attention actifs

- **App Check** : CF publiquement appelables (D-ETAPE16-005). Acceptable pré-alpha.
  À implémenter avant déploiement non-solo.
- **TD-013** : migration Node.js 20 → 22 avant 2026-10-30 (simple, low-risk).
- **TD-014** : test resolveLoginState "CRITIQUE" flaky (sleep réel 6s). À corriger
  avant 17.A-3 ou toute intégration CI.
- **Canvas pré-alpha** dans Boot.unity : supprimé (ÉTAPE 17.0).

## Prochaine étape attendue

ÉTAPE 17.A-3 : `startProductionSlot` via ProductionScreen (premier écran gameplay).
