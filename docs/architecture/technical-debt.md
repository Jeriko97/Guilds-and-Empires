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

**Précision ajoutée — ÉTAPE 9 (2026-05-21) :**
L'émulateur Firestore ne cascade-delete PAS les subcollections quand
le doc parent est supprimé. Les subcollections `contracts` deviennent
orphelines et persistent entre runs, contaminant les tests suivants.

Workaround appliqué dans `acceptContract.test.ts` : `clearGlobalTestData`
utilise `db.collectionGroup("contracts")` pour trouver et supprimer tous
les contrats (y compris orphelins) avant que `clearTestData` supprime les
docs parents. Ce pattern restera nécessaire pour tout test futur qui crée
des docs dans des subcollections.

La prod n'efface jamais de joueurs — impact nul en dehors des tests.

**Impact actuel :**
Nul en production. Contourné dans `acceptContract.test.ts`. Les tests
`buildings` (collectProduction, startProductionSlot, resolveLoginState)
ne sont pas affectés car leurs subcollections sont rechargées à chaque
test avec des états frais.

**Trigger de résolution :**
Si un jour on a besoin d'effacer un joueur en production (RGPD,
demande utilisateur, modération), il faudra une Cloud Function
dédiée qui supprime explicitement toutes les subcollections.

**Solution prévue :**
Cloud Function `deleteCompletePlayer` qui utilise le même pattern
`collectionGroup` pour itérer sur `contracts` et `buildings` avant
de supprimer le doc parent. À implémenter quand le besoin se présente.

---

### TD-007 — Convention : pas de FieldValue dans les arrays Firestore

**Identifié :** 2026-05-20 (ÉTAPE 7, écriture des slots dans l'array buildings.slots)
**Criticité actuelle :** CONVENTION
**Composant :** Tous les handlers qui écrivent dans des arrays

**Description :**
Firestore interdit les sentinels FieldValue (`serverTimestamp`, `arrayUnion`, etc.)
à l'intérieur d'éléments d'array. Seuls les champs de premier niveau ou les maps
imbriquées acceptent ces sentinels. Toute tentative lève une erreur runtime :
`FieldValue.serverTimestamp() cannot be used inside of an array`.

**Convention adoptée :**
Quand un champ Timestamp doit être écrit dans un array (par exemple
`slots[].startedAt`), utiliser `admin.firestore.Timestamp.now()` au lieu de
`admin.firestore.FieldValue.serverTimestamp()`.

**Justification :**
Les Cloud Functions s'exécutent sur l'infrastructure Google avec horloges
synchronisées NTP. Le drift entre `Timestamp.now()` côté CF et ce qu'aurait
écrit `serverTimestamp()` est de l'ordre de la microseconde. Aucun impact
économique ni anti-cheat.

**Pas de migration de schéma nécessaire :**
La règle s'applique au code à écrire. Aucun document existant n'est affecté.

---

### TD-009 — ESLint non opérationnel dans le projet

**Identifié :** 2026-05-20 (ÉTAPE 8, post-commit collectProduction)
**Criticité actuelle :** FAIBLE
**Composant :** `firebase/functions/`

**Description :**
Le repo contient un `.eslintrc.js` hérité de `firebase init`, mais
les dépendances correspondantes (eslint-plugin-import,
eslint-config-google, @typescript-eslint/*) ne figurent pas dans
`package.json` et l'exécutable `node_modules/.bin/eslint` n'est pas
présent. Aucun script `lint` n'est défini dans les scripts npm.

**Impact actuel :**
Les conventions stylistiques (TD-005 pattern, imports, naming) ne
sont pas vérifiées automatiquement. Repose entièrement sur l'audit
humain et sur la discipline de Claude Code. Risque de drift
silencieux entre sessions.

**Trigger de résolution :**
Avant ÉTAPE 9 (décision founder).

**Solution prévue :**
Installer les dépendances eslint requises, valider la config
`.eslintrc.js` actuelle (ou la simplifier vers une config
TypeScript standard), ajouter `"lint": "eslint . --ext .ts"` aux
scripts npm. Vérifier que les fichiers déjà commités passent le
linter avant d'ajouter ça aux critères d'acceptation des tickets
futurs.

**Résolution — 2026-05-20 :**
Config simplifiée : `eslint-config-google` et `eslint-plugin-import`
abandonnés (google = style opinioné non adapté au projet, import = inutile
sans resolver configuré). Deps retenues : `eslint@8`,
`@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`.

Règle `indent` retirée : `claimDailyBonus.ts` (code legacy condamné fin
Phase 1) généraient 55 erreurs. Politique founder : warnings non traités =
bruit → règle supprimée. L'indentation est garantie par discipline Claude
Code et IDE.

`ignorePatterns` étendu à `/src/__test__/**/*` pour aligner ESLint sur
les mêmes exclusions que `tsconfig.json` (les tests ne font pas partie
du build de production).

Config finale opérationnelle : `quotes: error` + `@typescript-eslint/
recommended`. Script `"lint": "eslint . --ext .ts"` ajouté. `npm run lint`
→ 0 erreur, 0 warning sur tous les fichiers de production.
**Criticité actuelle : RÉSOLUE**

---

---

### TD-012 — Coûts économiques hardcodés dans shared/ (inventoryUpgrades + guildCharter)

**Identifié :** 2026-05-29 (ÉTAPE 12) — étendu ÉTAPE 13
**Criticité actuelle :** FAIBLE
**Composant :** `firebase/functions/src/shared/inventoryUpgrades.ts` ET `firebase/functions/src/shared/guildCharter.ts`

**Description :**
Les coûts et amounts d'upgrade (ÉTAPE 12) et le coût du Guild Charter (ÉTAPE 13 — 500g) sont hardcodés
dans des fichiers TypeScript. La décision documentée dans `phase-1-technical-implementation.md` section 5
prévoit pourtant Remote Config (override) + ScriptableObject (défaut) pour toutes les valeurs économiques
pilotables LiveOps. Les upgrade costs et le guild charter cost sont explicitement listés comme
"Remote Config uniquement" dans le tableau de doctrine technique.

ÉTAPE 13 a introduit `GUILD_CHARTER_COST` (500g) dans `shared/guildCharter.ts`, suivant le même pattern
de hardcoding temporaire. La migration Remote Config devra couvrir les deux fichiers ensemble.

**Impact actuel :**
Modifier les coûts requiert un redéploiement des Cloud Functions. Acceptable en pre-alpha solo sans joueurs,
bloquant dès la première phase de balancing LiveOps.

**Trigger de résolution :**
Avant le premier playtest externe, ou dès qu'une 3e CF nécessite des constantes économiques pilotables
LiveOps — auquel cas la migration mutualise le travail tooling Remote Config.

**Solution prévue :**
1. Initialiser Remote Config côté backend (Firebase Admin SDK).
2. Charger les valeurs au cold start des CF avec cache TTL.
3. Fallback sur les constantes locales actuelles si Remote Config indisponible (offline-safe).
4. Garder `shared/inventoryUpgrades.ts` et `shared/guildCharter.ts` comme défauts typés.

---

### TD-013 — Migration Node.js 20 → 22 pour les Cloud Functions

**Identifié :** 2026-05-31 (ÉTAPE 16, warning lors du déploiement sur guildsandempires-ca543)
**Criticité actuelle :** FAIBLE
**Composant :** `firebase/functions` — runtime déclaré dans `firebase.json`

**Description :**
Node.js 20 a été déprécié le 2026-04-30 et sera décommissionné le 2026-10-30.
Après cette date, `firebase deploy --only functions` sera bloqué tant que le
runtime n'aura pas été migré.

**Impact actuel :**
Aucun sur le fonctionnement des CF. Warning visible à chaque `firebase deploy`.
Date de décommissionnement : **2026-10-30**.

**Trigger de résolution :**
Avant le 2026-10-30. Recommandé avant la prochaine session de déploiement prod
pour ne pas accumuler les warnings et s'habituer à les ignorer.

**Solution prévue :**
1. Dans `firebase.json`, mettre `"runtime": "nodejs22"`.
2. Dans `firebase/functions/package.json`, mettre `"engines": { "node": "22" }`.
3. `firebase deploy --only functions` — vérifier que les 9 CF se redéploient sans erreur.
4. Aucun changement de code CF attendu (Node 20 → 22 est une mise à jour mineure
   sans breaking changes sur les APIs utilisées par ce projet).

---

## TD Résolues

### TD-010 — firestore.rules incomplet pour Phase 1

**Identifié :** 2026-05-21 (ÉTAPE 9, audit chemins Firestore)
**Composant :** `firestore.rules`

**RÉSOLU ÉTAPE 15 (2026-05-31) :** `firestore.rules` Phase 1 écrites et testées via
`@firebase/rules-unit-testing`. Couvre `players/{uid}` + 5 subcollections
(buildings, contracts, marketTrades, inventoryUpgrades, guildPurchases) +
`marketState`, `activeWorldEvents`, `contractPool` + deny-all fallback.
Tests : quadruplet complet sur `players/{uid}` et subcollection témoin
`marketTrades`, assertions allégées sur les 4 autres subcollections, dimension
query (collection.get()) sur les 5 subcollections. 22/22 verts, stables sur 2 runs.

---

### TD-011 — Seed des prix de marché dans les tests non aligné sur phase-1-economy-values.md

**Identifié :** 2026-05-27 (ÉTAPE 11 post-audit)
**Composant :** `firebase/functions/src/__test__/sellToMarket.test.ts`

**Description originale :**
Le seed `createMarketState()` dans les tests utilisait des valeurs rondes
synthétiques (logs=10, planks=25, reconstructionKits=50) ne reflétant pas
les valeurs économiques officielles. Design intent `reconstructionKits`
non tranché.

**RÉSOLU ÉTAPE 14 :** Seeds tests alignés sur `phase-1-economy-values.md`
via `MARKET_PRICE_BOUNDS` dans `shared/marketPrices.ts`.
Option A retenue pour `reconstructionKits` (plancher fixe 20g, seuls les
events peuvent booster). Voir D-ETAPE14.
Les tests `updateMarketPrices` utilisent les basePrices officiels (5/12/20)
comme seeds. Les tests `sellToMarket` existants conservent leurs valeurs
synthétiques (invariants relatifs `price*quantity === goldEarned` restent
corrects indépendamment des valeurs absolues).
