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

## État du projet (mise à jour : 2026-05-29)

- Phase : Phase 1 Vertical Slice
- Backend : Firebase + Cloud Functions v2 (TypeScript strict)
- Client : Unity 6 (pas encore connecté au backend)
- Cloud Functions : 8/9 complètes (resolveLoginState +
  startProductionSlot + collectProduction + acceptContract +
  deliverToContract + sellToMarket + upgradeInventoryCap +
  purchaseGuildCharter)
- Tests : 149/149 verts (stable sur 2 runs)
- Branche : feature/bootstrap-architecture
- Dernier commit : edfa473
- Helper partagé : firebase/functions/src/shared/production.ts
- Helper partagé : firebase/functions/src/shared/inventoryUpgrades.ts
  (INVENTORY_UPGRADE_COSTS, INVENTORY_UPGRADE_AMOUNTS — TD-012)
- Helper partagé : firebase/functions/src/shared/favorRank.ts
  (FAVOR_THRESHOLDS as const — 50/200/350 — TD-ETAPE13)
- Helper partagé : firebase/functions/src/shared/guildCharter.ts
  (GUILD_CHARTER_COST=500, GUILD_CHARTER_FAVOR_THRESHOLD — TD-012 étendue)

## Documents de référence à demander au founder

Au début de chaque session, demander que ces docs soient attachés :

1. docs/architecture/phase-1-decisions-log.md
2. docs/architecture/phase-1-technical-implementation.md
3. docs/design/phase-1-economy-values.md
4. docs/architecture/technical-debt.md (TD-001 à TD-007)
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

## Prochaine étape attendue

ÉTAPE 14 : updateMarketPrices

Référence : docs/architecture/phase-1-technical-implementation.md
section 3.

Particularités à anticiper :
- 1ère Scheduled CF (functions.scheduler.onSchedule, every 5 min)
- Recalcule les prix logs/planks/reconstructionKits dans
  /marketState/state
- Algorithme : drift lent vers basePrice + bruit contrôlé (±5%
  max par tick) + multiplicateurs des world events actifs
- Tests Emulator : les Scheduled Functions ne sont pas triggerables
  nativement par l'émulateur — tester le handler exporté directement
  (pattern TD-005 adapté)
- Lecture activeWorldEvents pour appliquer les priceMultipliers
- Premier consommateur potentiel pour aligner les seeds de prix tests
  sur les valeurs économiques officielles (TD-011)
- Pas de favorRank affecté, pas de player touché
