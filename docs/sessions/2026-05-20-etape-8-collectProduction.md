# Session 2026-05-20 — ÉTAPE 8 collectProduction + setup ESLint

## Livrables

- 3/9 Cloud Functions complètes (collectProduction ajoutée)
- 45/45 tests verts (16 nouveaux pour collectProduction, 7 unitaires 
  pour processBuildingSlots)
- Helper partagé processBuildingSlots créé (pur, déterministe, testé)
- resolveLoginState refactoré pour utiliser le helper (22 tests 
  inchangés)
- ESLint opérationnel (config simplifiée, Google retiré)
- TD-009 ouverte et résolue dans la même session

## Commits (ordre chronologique)

- 4910aef — docs(td): open TD-009 for non-operational ESLint
- b1e20f3 — docs(briefing): update briefings after ETAPE 8 completion
- d831364 — feat(production): add collectProduction with shared 
  processBuildingSlots helper
- 329de55 — chore(lint): setup ESLint with TypeScript support — 
  resolves TD-009

## Décisions tranchées

- Factorisation processBuildingSlots faite (pas de TD-008 ouverte)
- ESLint : config minimale (eslint:recommended + 
  @typescript-eslint/recommended + quotes double), pas de Google 
  config, indent retiré (claimDailyBonus.ts legacy condamné)
- Helper pur avec `now` injecté (déterminisme testable, pas de 
  Timestamp.now() en interne)
- Transaction Firestore au lieu de batched write pour 
  collectProduction (cross-check GPT validé : protection des 
  read-modify-write contre appels concurrents)
- Option B perte sèche : lastProcessedAt mis à now même si tout 
  est discarded
- Test critique #3 ajouté : deux slots produisant la même ressource 
  → availableSpace recalculé entre slots

## Prochaine étape

ÉTAPE 9 : acceptContract
