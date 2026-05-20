# Session 2026-05-21 — ÉTAPE 9 acceptContract

## Livrables

- 4/9 Cloud Functions complètes (acceptContract ajoutée)
- 64/64 tests verts (19 nouveaux pour acceptContract, stable sur 2 runs)
- Convention de path Firestore verrouillée : collections top-level
  (marketState/state singleton, contractPool/{id}, activeWorldEvents/{id})
- clearGlobalTestData inline dans acceptContract.test.ts avec
  db.collectionGroup("contracts") pour contourner la limitation
  cascade-delete de l'émulateur

## Commits (ordre chronologique)

- 4f97104 — feat(contracts): add acceptContract with tier-based favor gating

## Décisions tranchées

- Option B confirmée : playerContractId = UUID server-side
  (crypto.randomUUID), contractTemplateId stocké comme champ
- favorRank lu dénormalisé sur /players/{uid} ; absence du champ
  = HttpsError failed-precondition (pas de fallback silencieux)
- Multi-instance interdit Phase 1 : 2e acceptContract sur même
  template alors qu'un contrat actif existe = HttpsError
  failed-precondition (pas d'idempotency forte qui retournerait
  le contrat existant)
- Convention de path Firestore : collections top-level distinctes
  (pas de préfixe /global/, qui était sémantique et non valide
  en Firestore). marketState/state = singleton, contractPool et
  activeWorldEvents = collections plurielles.
- 4 commentaires JSDoc dans shared/types.ts mis en cohérence
  avec la nouvelle convention de path
- TD-006 étendue : workaround collectionGroup documenté, statut
  inchangé (la solution prod deleteCompletePlayer reste à écrire)
- clearGlobalTestData défini inline dans acceptContract.test.ts
  (pas extrait dans helpers.ts) — extraction prévue si une 2e CF
  en a besoin (YAGNI)

## Points à surveiller pour la suite

- firestore.rules reste incomplet pour Phase 1 — TD-010 ouverte
  dans ce même commit
- Possible duplication clearTestData vs clearGlobalTestData à
  extraire si deliverToContract en a besoin (ÉTAPE 10)
- Pattern de query dans transaction validé (Promise.all sur
  3 reads parallèles puis lecture conditionnelle), réutilisable
  pour deliverToContract

## Prochaine étape

ÉTAPE 10 : deliverToContract
