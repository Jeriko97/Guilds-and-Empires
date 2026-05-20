# Technical Debt Log

Registre des points de dette technique identifiés et consciemment
acceptés. Chaque entrée indique le contexte, l'impact, et le
trigger qui devrait déclencher la résolution.

## Politique

- Chaque entrée est datée et signée par la décision qui a accepté
  la dette
- Aucune dette n'est résolue silencieusement : retirer une entrée
  = un commit explicite
- Une dette qui passe en CRITIQUE doit être résolue immédiatement

## Entrées

### TD-001 — Race condition sur rateLimiter (read-modify-write)

**Identifié :** 2026-05-19 (ÉTAPE 3, review rateLimiter.ts)
**Criticité actuelle :** FAIBLE
**Composant :** `firebase/functions/src/shared/rateLimiter.ts`

**Description :**
La fonction `checkRateLimit` effectue un read suivi d'un write
non-atomiques. Deux appels concurrents peuvent tous deux lire
"pas de rate limit actif" et tous deux passer le check.

**Impact actuel (Phase 1, sur resolveLoginState uniquement) :**
Négligeable. resolveLoginState est idempotent par design — un
double appel ne crée pas d'incohérence économique.

**Trigger de résolution :**
Avant la première utilisation de checkRateLimit sur une fonction
économique destructrice (sellToMarket, deliverToContract,
upgradeInventoryCap, purchaseGuildCharter).

**Solution prévue :**
Migration vers une transaction Firestore atomique (read + write
dans une même transaction). Ou complément par idempotency keys
sur les fonctions destructrices.

---

### TD-002 — Type TypeScript imprécis sur FieldValue / Timestamp

**Identifié :** 2026-05-19 (ÉTAPE 3, review rateLimiter.ts)
**Criticité actuelle :** TRÈS FAIBLE
**Composant :** `firebase/functions/src/shared/rateLimiter.ts`
(et potentiellement tous les writes Firestore avec serverTimestamp)

**Description :**
L'interface RateLimitDocument déclare `lastCalledAt: Timestamp`,
mais à l'écriture on passe un `FieldValue` (sentinel
serverTimestamp()). Le runtime fonctionne (Firestore convertit le
sentinel en Timestamp avant stockage), mais le typage TypeScript
est techniquement incorrect au moment du write.

**Impact actuel :**
Aucun au runtime. Imperfection de DX uniquement.

**Trigger de résolution :**
Si TypeScript strict commence à râler à cause d'un cast implicite,
ou si on veut introduire des Firestore converters pour avoir un
typage parfait sur l'ensemble de la base.

**Solution prévue :**
Soit union type `Timestamp | FieldValue` sur les champs concernés,
soit migration vers FirestoreDataConverter pour avoir une
séparation propre entre type "read" et type "write".

---

### TD-003 — Duplication one-shot au premier resolveLoginState post-déploiement de lastProcessedAt

**Identifié :** 2026-05-19 (correction bug duplication offline)
**Criticité actuelle :** TRÈS FAIBLE
**Composant :** `firebase/functions/src/login/resolveLoginState.ts`

**Description :**
Les slots existants avant l'introduction du champ `lastProcessedAt`
n'ont pas ce champ dans Firestore. Au premier appel de resolveLoginState
post-déploiement, le fallback `slot.lastProcessedAt ?? slot.startedAt`
utilisera `startedAt` comme référence, calculant la totalité de la
production depuis le début du slot plutôt que depuis la dernière collecte.

**Impact actuel :**
Négligeable en pre-alpha : ~0 vrais joueurs, ~0 documents affectés.
La duplication est one-shot (au login suivant, lastProcessedAt existe
et le calcul est correct).

**Trigger de résolution :**
Aucune action requise. À surveiller uniquement si des joueurs réels
sont présents au moment du déploiement de ce changement.

**Solution prévue :**
Si dataset non-vide au moment du déploiement : script de migration
one-shot qui initialise `lastProcessedAt = startedAt` sur tous les
slots actifs existants.

---

### TD-004 — Drift de temps résiduel non conservé dans lastProcessedAt

**Identifié :** 2026-05-19 (post-correction bug duplication offline)
**Criticité actuelle :** TRÈS FAIBLE
**Composant :** `firebase/functions/src/login/resolveLoginState.ts`

**Description :**
Le calcul actuel pose `lastProcessedAt = now` au lieu de
`lastProcessedAt = referenceTimestamp + (completedCycles * durationMs)`.
Le temps résiduel (elapsed modulo durationMs) est donc perdu à chaque
calcul de production.

**Impact actuel :**
Drift toujours défavorable au joueur, jamais exploitable. Maximum
(durationMs - 1ms) perdues par check-in. Pour Phase 1 avec cycles de
20-60 minutes, perte moyenne acceptable.

**Trigger de résolution :**
Avant l'introduction de mécaniques sensibles au timing fin :
- Buffs/boosts temporaires
- LiveOps avec timers courts (< 5 minutes)
- Multi-slots avec sync précise requise
- Économie boostée par event mondial

**Solution prévue :**
Remplacer le calcul actuel par :
  lastProcessedAt = Timestamp.fromMillis(
    referenceTimestamp.toMillis() + (completedCycles * recipe.durationMs)
  );

Vigilance à apporter à l'implémentation : edge cases comme un cycle
qui termine pile au moment du login, ou des calculs qui donneraient
un timestamp futur par arrondi flottant. Tests dédiés requis.

---

### TD-005 — Convention pattern obligatoire pour toutes les Cloud Functions

**Identifié :** 2026-05-19 (ÉTAPE 5, design testabilité handlers)
**Criticité actuelle :** N/A — convention architecturale, pas un bug
**Composant :** toutes les Cloud Functions Phase 1+

**Description :**
Pattern à appliquer systématiquement à chaque nouvelle Cloud Function :

```typescript
// 1. Types d'API — source de vérité unique, exposés pour les tests
//    et la future génération de bindings client (Unity → C#)
export type {FunctionName}Request  = CallableRequest<DataType>;
export type {FunctionName}Response = ResultType;

// 2. Handler — logique métier, testé directement sans wrapper Firebase
export async function {functionName}Handler(
  request: {FunctionName}Request
): Promise<{FunctionName}Response> {
  // ... logique métier
}

// 3. Wrapper production — utilisé par le runtime Firebase uniquement
export const {functionName} = onCall({ invoker: "public" }, {functionName}Handler);
```

**Pourquoi :**
- Les tests importent `{functionName}Handler` directement avec un mock `CallableRequest`
  sans dépendre de firebase-functions-test (qui crée des conflits d'init Admin SDK en v3)
- Les types `Request/Response` exposés permettent aux mocks de rester en sync
  avec la signature sans copier la déclaration
- Prépare la génération future de types client (Unity → C# bindings via tooling)

**Application immédiate :**
`resolveLoginStateHandler` est la première occurrence. À appliquer à :
startProductionSlot, collectProduction, acceptContract, deliverToContract,
sellToMarket, upgradeInventoryCap, purchaseGuildCharter.

---

### TD-006 — clearTestData repose sur le comportement cascade de l'Emulator

**Identifié :** 2026-05-19 (ÉTAPE 5)
**Criticité actuelle :** TRÈS FAIBLE
**Composant :** `firebase/functions/src/__test__/helpers.ts`

**Description :**
`clearTestData` supprime le document `/players/{uid}` parent mais pas
explicitement les subcollections `/buildings/` et `/contracts/`. Cela
fonctionne grâce au comportement cascade de l'Emulator Firestore.

**Impact actuel :**
Nul. Le helper n'est utilisé que dans les tests d'intégration, qui
tournent uniquement contre l'Emulator. La production n'efface jamais
de joueurs.

**Trigger de résolution :**
Si un jour on a besoin d'effacer un joueur en production (RGPD,
demande utilisateur, modération), il faudra une Cloud Function
dédiée qui supprime explicitement toutes les subcollections.

**Solution prévue :**
Cloud Function `deleteCompletePlayer` qui itère sur
`/players/{uid}/buildings` et `/players/{uid}/contracts` pour suppression
explicite avant de supprimer le doc parent. À implémenter quand le
besoin se présente.
