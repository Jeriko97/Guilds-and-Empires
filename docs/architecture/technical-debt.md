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

### TD-018 — marketState et contractPool jamais initialisés en production

**Identifié :** 2026-11-01 (vérification en Play après redéploiement Node 22)
**Criticité actuelle :** MOYENNE depuis le 2026-11-01 (marché seedé ; `contractPool` toujours vide, bloque les contrats) — HAUTE à l'ouverture
**Composant :** Firestore `marketState/state`, `contractPool` ; `updateMarketPrices`, `sellToMarket`, `acceptContract`

**Description (état à l'ouverture, avant seed — voir « Avancement » ci-dessous) :**
En production (`guildsandempires-ca543`), le document `marketState/state` n'existe pas :
`sellToMarket` répond `failed-precondition: market state not initialized`, et
`updateMarketPrices` sort sans rien faire (tolérance « inexistant », D-ETAPE14c). Aucun script
versionné ne crée ce document, ni ne remplit `contractPool`. Les tests les seedent eux-mêmes,
l'émulateur seulement.
Effet de bord côté client : `FailedPrecondition` est traduit en « Vente impossible : vérifie
ton stock », un message trompeur ici.

**Trigger de résolution :**
Avant l'ÉTAPE 18.2b-2 (UI marché). Solution envisagée : script de seed idempotent versionné
(valeurs de `docs/design/phase-1-economy-values.md`), exécuté une fois par projet Firebase ;
retirer alors la tolérance « inexistant » de D-ETAPE14c (trigger prévu par cette décision).
Mis à jour le 2026-11-01 : la partie marché se ferme pendant l'ÉTAPE 18.2b-2 (vérification de
`inventory`) ; la partie `contractPool` se ferme à l'étape contrats.

**Avancement 2026-11-01 — partie marché livrée en local (D-TD018-001) :**
- Seed versionné `src/seed/marketStateSeed.ts` + CLI `npm run seed:market` (dry-run par défaut,
  garde-fous production), 13 tests ; tolérance « inexistant » retirée de `updateMarketPrices` ;
  message client `FailedPrecondition` neutralisé.
- ~~(1) exécution du seed en production~~ : **fait le 2026-11-01** (accord founder) — `CRÉÉ` à
  20:47:12 UTC, 2e passage `DÉJÀ PRÉSENT`, document relu conforme (5 / 12 / 20).
- ~~(2) déploiement, après le seed~~ : **fait le 2026-11-01 à 21:13 UTC** (accord founder) —
  `updateMarketPrices` seule, depuis `0a54298`, 222/222 verts. Exécutions planifiées vérifiées.
- ~~(3) vérification que `sellToMarket` renvoie `inventory`~~ : **fait le 2026-11-01 (ÉTAPE 18.2b-2)** —
  vente de 1 log en Play sur le compte du founder (accord donné au lancement de 18.2b-2, remplaçant
  pour cette validation la décision « pas de vente de test ») : `sellToMarket OK — goldEarned:5 newGold:5`,
  `inventory` présent et parsé (logs 50 → 49), état relu par `resolveLoginState` au relancement (gold 5).
- **Reste ouvert** : (4) `contractPool` : relève de
  `processWorldEventLifecycle` (étape contrats). **Criticité ramenée à MOYENNE** (marché débloqué,
  contrats toujours vides).

---

### TD-015 — Primitives de parsing Firebase dispersées dans 4 foyers (requalifiée le 2026-11-01)

**Identifié :** 2026-06-08 (ÉTAPE 17.B-1, extraction de ProductionParsingHelpers) — requalifiée le 2026-11-01 (clôture ÉTAPE 18)
**Criticité actuelle :** FAIBLE (était TRÈS FAIBLE : 4 foyers au lieu de 2)
**Composant :** `Core/FirebaseParsingHelpers.cs`, `Models/InventoryParsingHelpers.cs`,
`Services/Production/ProductionParsingHelpers.cs`, `Models/PlayerStateSnapshot.cs`

**Description :**
Le slice marché (ÉTAPE 18) a ajouté `Core/FirebaseParsingHelpers` (primitives) et `Models/InventoryParsingHelpers`
(inventaire), utilisés par `MarketStateSnapshot` et `SellToMarketResult`. Les copies antérieures n'ont pas été retirées :
- primitives `RequireDict` / `GetValue` / `GetString` / `GetLong` : 3 exemplaires (`FirebaseParsingHelpers`,
  `ProductionParsingHelpers`, copies privées de `PlayerStateSnapshot`) ; `GetBool` : 2 exemplaires (absent de
  `ProductionParsingHelpers`) ;
- `ParseInventory` / `ParseResourceStack` : 3 exemplaires (`InventoryParsingHelpers`, `ProductionParsingHelpers`,
  `PlayerStateSnapshot`).
`ParseTimestampMs` reste source unique (internal, `PlayerStateSnapshot`) — non concerné.

**Impact :**
Si le format wire change (ex. type numérique boxé), jusqu'à 3 endroits à corriger, avec un risque de divergence
silencieuse entre login, production et marché.

**Trigger de résolution :**
Prochaine sous-étape qui touche l'un de ces fichiers (au plus tard l'ÉTAPE contrats, qui ajoutera des parsers).
Cibles : primitives → `Core/FirebaseParsingHelpers` ; inventaire → `Models/InventoryParsingHelpers` ;
`ParseBuilding`/`ParseSlot` → un seul foyer (`ProductionParsingHelpers`) ; `PlayerStateSnapshot` délègue.

---

### TD-016 — Cloud Functions en us-central1, Firestore en europe-west9

**Identifié :** 2026-11-01 (audit v2)
**Criticité actuelle :** MOYENNE
**Composant :** `firebase/functions` (aucune `region` ni `setGlobalOptions`) + client Unity
(`FirebaseFunctions.DefaultInstance`)

**Description :**
Aucune région n'est déclarée : les CF tournent dans la région par défaut (us-central1),
alors que Firestore est en europe-west9 (`firebase.json`). Chaque appel client traverse
l'Atlantique, et chaque transaction CF → Firestore aussi.

**Impact :**
Latence ajoutée sur chaque action joueur ; trafic inter-région facturable. Invisible à 0 DAU.

**Trigger de résolution :**
Avant le premier playtest externe. Changer de région = redéploiement dans la nouvelle région,
suppression des anciennes CF, et `FirebaseFunctions.GetInstance(region)` côté client.

---

### TD-017 — App Check non activé (non suivi jusqu'ici)

**Identifié :** 2026-05-11 (audit v1, HAUTE) — inscrit au registre le 2026-11-01
**Criticité actuelle :** FAIBLE en pré-alpha solo, HAUTE avant tout test externe
**Composant :** CF callables (`enforceAppCheck` absent) + client Unity

**Description :**
Différé par D-ETAPE16-005, mais aucune entrée TD ne le suivait. Les CF sont appelables
par tout client authentifié (anonymement), hors de l'app.

**Trigger de résolution :**
Avant tout déploiement non-solo : DebugProvider en `#if UNITY_EDITOR`, Play Integrity
en prod (D4.2), puis `enforceAppCheck: true` sur les callables.

---

### TD-019 — firebase-functions obsolète (avertissement au déploiement)

**Identifié :** 2026-11-01 (déploiements de la reprise)
**Criticité actuelle :** FAIBLE
**Composant :** `firebase/functions/package.json` (`"firebase-functions": "^7.2.5"`, 7.2.5 installée)

**Description :**
La CLI Firebase signale au déploiement une version obsolète de `firebase-functions` (texte exact non consigné).
Version installée 7.2.5 ; dernière publiée 7.4.0 (`npm view firebase-functions version`, 2026-11-01).
Rappel : en 7.x, `defineInt` ignore `options.default` au runtime (constantes directes utilisées).

**Impact :**
Aucun bug constaté. Risque : correctifs et compatibilité runtime manqués ; l'avertissement masque d'autres alertes.

**Trigger de résolution :**
Au prochain déploiement complet (escalade cas 2) : montée de version en commit dédié, `npm run test:emulator`
vert (222/222 ou plus) AVANT le déploiement, relecture des notes de version 7.3 → 7.4.

---

### TD-020 — Le multiplicateur d'event se cumule d'un tick à l'autre (prix event ≈ 16 au lieu de 9)

**Identifié :** 2026-11-01 (revue croisée du ticket de clôture ÉTAPE 18, auditeur) — vérifié par calcul, non corrigé
**Criticité actuelle :** MOYENNE — **bloquante pour l'étape world events** (sans effet tant qu'aucun world event
n'est déclenché en production)
**Composant :** `firebase/functions/src/shared/computeMarketPrice.ts` (`updateMarketPrices`)

**Description :**
`computeMarketPrice` applique le multiplicateur d'event à `currentPrice`, qui contient déjà le boost du tick
précédent. Avec les multiplicateurs du design (×1,8 Logs, ×1,83 Planks ; aucun event n'est encore défini dans le
code, les multiplicateurs viennent du document d'event) — Logs : tick 1 → 5 × 1,8 = 9 ; tick 2 → dérive depuis 9, clamp à 9, × 1,8 ≈ 15-16 ; le prix
plafonne vers 16 au lieu des 9 prévus (`phase-1-economy-values.md` : « +80 % (5 → 9) »). Planks : 22 prévu,
≈ 40 au tick 2. Les tests (`computeMarketPrice.test.ts`) ne couvrent qu'un seul tick.

**Impact :**
Prix d'event ≈ 1,8 fois plus hauts que le design ; ratio Planks/Logs et récompenses d'event faussés.

**Décision du founder (2026-11-02, D-TD020-001) — cas 4 tranché :**
« TD-020 : corriger pour respecter phase-1-economy-values.md (prix d'événement = 9 et 22). Pas maintenant : à traiter en tête de l'étape qui activera processWorldEventLifecycle. Inscris-le comme prérequis bloquant de cette étape dans TD-020. »
Cible : les prix d'event du design, **Logs 9 et Planks 22** (`phase-1-economy-values.md` §4 l.104-105 « Prix event
(haut) », et §6 l.165-166 : +80 % 5 → 9, +83 % 12 → 22). Aucune valeur de design modifiée.

**Trigger de résolution — ⛔ PRÉREQUIS BLOQUANT, première sous-étape de l'étape qui activera
`processWorldEventLifecycle` :**
Corriger `computeMarketPrice` AVANT d'implémenter, d'exporter (export aujourd'hui commenté,
`firebase/functions/src/index.ts:30`) ou de déployer `processWorldEventLifecycle`, et avant tout world event en
production. Aucune autre sous-étape de cette étape ne démarre tant que TD-020 n'est pas résolue.

**Amendement du founder (2026-11-02, D-TD020-002) — remplace la cible ci-dessus pour le modèle de calcul :**
« Ma position : prix d'événement = valeur absolue imposée pendant l'événement (9 / 22, quel que soit le prix de départ), puis redescente progressive vers le prix courant. Ça règle les deux escalades d'un coup et rend le test déterministe. Si tu valides, fais-le inscrire dans TD-020 (amendement de D-TD020-001), commit séparé, poussé. »
Validé par Claude Code. Il lève la contradiction de la version précédente : un prix d'event calculé depuis le prix
courant ne pouvait pas rester à 9 / 22 (Planks 20/22/24 selon le bruit, Logs ≈ 11 depuis 6).

**Cible (modèle absolu) :**
- **Prix d'event** = `round(basePrice × multiplicateur de l'event)` : Logs 5 × 1,8 = **9**, Planks 12 × 1,83 =
  21,96 → **22**. C'est la règle déjà appliquée aux kits (`min === max`, `computeMarketPrice.ts:56-57`) ; le schéma
  d'event (`priceMultipliers`) ne change pas.
- **Event actif** : le prix publié vaut le prix d'event à chaque tick, sans dérive ni bruit, quel que soit le prix
  de départ (Logs 3 à 9, Planks 8 à 22).
- **Prix de référence hors event (« prix courant »)** : suivi à part, jamais dérivé du prix publié. Il part du prix
  publié juste avant l'event et continue d'évoluer à chaque tick avec la dérive et le bruit habituels (D-ETAPE14b).
  Sans lui, aucune redescente : dérivé du prix publié, avec `DRIFT_FACTOR` 0,1 et l'arrondi, les Logs restent figés
  à 9 et les Planks à 17. → nouveau champ dans `marketState` : `schemaVersion` + `schema-migrations.md` + seed
  (D-TD018-001) dans le commit de correction. `marketState/state` existe déjà en production et le seed (`create()`)
  ne le réécrit pas : préférer l'initialisation à la volée (champ absent → référence = prix publié, hors event),
  qui évite toute écriture manuelle ; à défaut, migration du document en prod = escalade cas 1, AVANT le
  déploiement de `updateMarketPrices` (sinon erreur à chaque tick, comme en D-TD018-001).
  **Tranché par D-TD020-003 (arbitrage A ci-dessous)** : initialisation à la volée, sans migration ; la
  migration de repli et l'escalade cas 1 associée sont sans objet.
- **Decay** : prix publié = `round(prixEvent + (prixRéférence − prixEvent) × progression)`, progression de 0 à 1
  sur la durée du decay (**60 min**, `EVENT_DECAY_DURATION_MS`, à valider au playtest — arbitrage C ci-dessous),
  puis retour au calcul normal depuis le prix de référence.
- **Un seul event par ressource** : plusieurs events simultanés sur une même ressource (le code actuel multiplie
  les multiplicateurs, `computeMarketPrice.ts:50-53`) → erreur explicite (fail loudly), pas de calcul silencieux ;
  aucun cas prévu en Phase 1, escalade s'il apparaît. Portée de l'erreur (tick entier ou ressource concernée seule)
  à trancher dans le ticket de correction : `updateMarketPrices` traite toutes les ressources en un tick.
  **Tranché par D-TD020-003 (arbitrage B ci-dessous)** : garde à l'activation, et échec du tick entier.

**Arbitrages figés (2026-11-02, D-TD020-003)** — demandés par l'auditeur Claude.ai, validés par le founder
(« Tu peux exécuter tout le ticket comme prévu »). Ils complètent D-TD020-001/002. Sur un seul point, ils
remplacent la conséquence « schemaVersion, migration » prévue par D-TD020-002 : ni l'un ni l'autre (arbitrage A).
Définition commune : un event est **en cours sur une ressource** quand son `status` vaut `active` ou `decaying`
(les deux statuts lus par `updateMarketPrices` et qui modifient le prix) et que `priceMultipliers` contient cette
ressource. Avec le schéma actuel, chaque event porte `logs` et `planks` : en pratique, un seul event à la fois sur
le marché. Les gardes A et B s'évaluent sur ce `status`, AVANT le filtre actuel de `updateMarketPrices.ts:55-56` qui
ignore un event sans `endsAt` (quel que soit son statut) ou `decaying` sans `decayEndsAt` : un event incomplet
n'échappe pas aux gardes.

- **A — Prix de référence créé à la volée, sans migration.**
  - Champ : `referencePrices.{ressource}` (entier) dans `marketState/state`, distinct de `prices` (le client lit
    `prices.{ressource}.currentPrice` et `trend` par clé : contrat client inchangé).
  - Créé par `updateMarketPricesHandler` lors du premier passage qui ne le trouve pas, dans la **même
    transaction** que la relecture des prix : lecture de `marketState/state` et des events, calcul, écriture
    unique. Aujourd'hui le handler lit hors transaction puis fait un seul `set` (commentaire « scheduled CF is
    singleton ») : passage en `runTransaction` dans le commit de correction.
  - **Cas autorisé** : champ absent ET aucun event en cours sur la ressource → référence initialisée à
    `prices.{ressource}.currentPrice`, puis calcul normal.
  - **Cas interdit** : champ absent ET event en cours sur la ressource → `throw Error` explicite, le tick échoue,
    rien n'est écrit. Aucune initialisation devinée (le prix publié est alors un prix d'event ou de decay).
  - Aucune écriture manuelle ou par script en production, aucun script de migration. `schemaVersion` reste 1 :
    champ ajouté avec repli, comme `marketSalesLastHour` et `upgradesApplied` (`schema-migrations.md`). Une
    évolution de `schemaVersion` imposerait une migration (D-TD018-001), exclue ici. Le seed
    (`marketStateSeed.ts`) écrit le champ pour les nouveaux documents (référence = `basePrice`).
  - **Ordre de déploiement imposé** (comme D-TD018-001) : `updateMarketPrices` corrigée est déployée, puis on
    constate dans `marketState/state` (ou dans les logs) que `referencePrices` a été créé, AVANT tout déploiement
    de `processWorldEventLifecycle`. Sinon, un event activé avant ce premier passage rend le cas interdit
    permanent : erreur à chaque tick pendant ≈ 5 h (4 h d'event + 60 min), prix figés.
- **B — Un seul event par ressource.**
  - **Garde principale** : `processWorldEventLifecycle` refuse d'activer un event sur une ressource où un event
    est déjà en cours (check-then-mutate dans une transaction : lecture des events `active`/`decaying`, puis
    passage à `active`). Contexte schedulé → l'event refusé reste `pending`, rien n'est écrit pour lui, erreur
    explicite. Déclenchement par une callable (si un jour il en existe une) → `HttpsError` `failed-precondition`.
  - **Déroulé d'un passage schedulé** (pour qu'un refus ne bloque jamais le cycle) :
    1. d'abord les expirations (`active → decaying` à `endsAt`, `decaying → completed` à `decayEndsAt`), chacune
       dans sa propre transaction, validées quel que soit le résultat des activations ;
    2. puis les activations des events `pending` échus, chacune en transaction avec la garde ;
    3. un refus est logué (`logger.error`, event et ressource) et le passage se termine par un `throw Error`
       une fois toutes les autres transitions validées : échec visible, sans rien annuler.
  - **Sort de l'event refusé** : il reste `pending` et la garde le réévalue à chaque passage. Il est activé au
    premier passage où plus aucun event n'est en cours sur ses ressources, y compris le passage même où
    l'expiration du précédent (`→ completed`) vient d'être validée, puisque les expirations passent d'abord.
    `startedAt` = heure réelle de l'activation, `endsAt` = `startedAt` + 4 h (durée complète), `decayEndsAt` = `endsAt` + 60 min.
    Le calendrier prévu par le design ne change pas : la Phase 1 n'a qu'un event scripté, déclenché par
    `firstContractCompleted` (`phase-1-technical-implementation.md`, `processWorldEventLifecycle`). Aucun
    chevauchement n'y est prévu, le report ne joue qu'en cas d'anomalie, rendue visible par l'erreur. Toute autre
    politique (annuler l'event, raccourcir sa durée, décaler le précédent) → escalade cas 4. Ce déroulé et ce sort
    ont été précisés par Claude Code en revue croisée, après le feu vert du founder, sans modifier aucune valeur
    (4 h et 60 min conservées).
  - **Garde secondaire** : si `updateMarketPricesHandler` trouve plus d'un event en cours sur une même ressource,
    **toute la relecture échoue** (`throw Error`). Pas seulement la ressource concernée, et aucune écriture
    partielle : `marketState/state` reste inchangé.
  - Justification : cohérence avec D-TD018-001 (échec bruyant plutôt que repli silencieux). Remplace le produit des
    multiplicateurs actuel (`computeMarketPrice.ts:50-53`).
- **C — Durée de redescente : exactement 60 minutes.**
  Décision du founder (2026-11-02) : « Décision founder TD-020, arbitrage C : **option 1, durée de redescente =
  exactement 60 minutes**, marquée « à valider au playtest ». »
  Précisions du founder, même message, citées telles quelles :
  « Constante `EVENT_DECAY_DURATION_MS` = 60 min, placée avec les autres valeurs économiques côté serveur. Pas en
  dur dans `processWorldEventLifecycle`. » et « L'heure de fin de redescente est calculée par le serveur à
  l'activation de l'événement et stockée sur l'événement. Rien n'est reçu du client. »
  - Source de départ : `phase-1-economy-values.md` l.111 (« ~1h ») et l.164 (« ~1 heure »), approximatifs ; aucune
    constante dans le code (`updateMarketPrices` lit `decayEndsAt`, `processWorldEventLifecycle` n'existe pas).
    Ces deux lignes portent désormais la valeur exacte.
  - **Constante à créer** : `EVENT_DECAY_DURATION_MS = 60 * 60 * 1000` (`// 60 minutes — TO_PLAYTEST`), dans
    `firebase/functions/src/shared/marketPrices.ts`, à côté de `MARKET_PRICE_DRIFT_FACTOR`. Jamais en dur dans
    `processWorldEventLifecycle`. Créée dans la sous-étape `processWorldEventLifecycle`, son premier usage (pas de
    constante morte dans la correction TD-020).
  - `decayEndsAt = endsAt + EVENT_DECAY_DURATION_MS`, calculé par le serveur à l'activation (même écriture que
    `startedAt` et `endsAt`) et stocké sur l'event. Aucune valeur reçue du client.
  - Conséquence à aligner dans la sous-étape `processWorldEventLifecycle` (c'est elle qui pose la valeur) : le
    contrat actuel « `decayEndsAt` null jusqu'à la fin de l'event » devient « renseigné dès l'activation ». Endroits
    concernés : `types.ts:213`, `updateMarketPrices.ts:53` et `:66`, `computeMarketPrice.ts:33-34`,
    `BRIEFING-claude-code.md` (convention « Guard active vs decaying events »). En plus,
    `phase-1-technical-implementation.md:141` (« `endsAt + 1h` ») passe à `EVENT_DECAY_DURATION_MS`. La garde
    `decaying && !decayEndsAt` de `updateMarketPrices` reste valide. Le changement de cette convention verrouillée
    est couvert par la précision du founder (arbitrage C, « calculée par le serveur à l'activation de
    l'événement »). Ce n'est pas un changement de convention sans escalade (cas 5).
  - À traiter dans la sous-étape `processWorldEventLifecycle` (constat de revue, hors décision) : le cycle de vie
    tourne toutes les 10 min et `updateMarketPrices` suit le `status`. Entre `endsAt` et le passage suivant, le prix
    peut donc rester au prix d'event jusqu'à 10 min de trop, puis le decay démarre déjà avancé. Comme `decayEndsAt`
    est connu dès l'activation, la sous-étape aligne prix et horaires : c'est un détail d'implémentation, pas un
    point de design. Les 4 h et les 60 min ne changent pas. Le moyen retenu (prix piloté par
    les horodatages, ou autre) est relu dans le ticket de cette sous-étape ; s'il change la durée réelle
    d'application du prix d'event → cas 4.
  - Également à trancher dans le ticket de la sous-étape `processWorldEventLifecycle` (rattrapage après passages
    manqués, pas une valeur de design) : un event `active` dont `endsAt` ET `decayEndsAt` sont échus enchaîne-t-il
    `active → decaying → completed` dans le même passage, ce qui décide si un event `pending` concurrent est activé
    ou refusé ?
  - Modifier ces 60 min reste une escalade (cas 4).

**Critères de fermeture :**
- test déterministe multi-tick dans `computeMarketPrice.test.ts` :
  - event actif depuis plusieurs prix de départ (Logs 3, 5, 6, 9 ; Planks 8, 12, 22), avec une séquence de bruits
    NON nuls injectée : prix publié = 9 / 22 exactement à chaque tick (≥ 3 ticks) ;
  - decay, `random` 0,5 (bruit nul) : Logs depuis 5 → 9 pendant l'event, puis `round(9 − 4 × progression)`,
    5 à la fin ; Planks depuis 12 → 22, puis `round(22 − 10 × progression)`, 12 à la fin ;
  - référence sous bruit : Planks, séquence de bruits non nuls pendant l'event → la référence évolue (≠ 12) alors que
    le prix publié reste 22 ; le decay converge vers CETTE référence (pas vers 12 ni vers le prix publié) ;
- test émulateur sur `updateMarketPricesHandler` : référence persistée dans `marketState`, jamais recopiée depuis
  le prix publié, sur au moins deux exécutions ; initialisation quand le champ manque ; tests du seed mis à jour ;
- tests émulateur des arbitrages D-TD020-003 côté `updateMarketPricesHandler` (déterministes, chiffrés) :
  - **création à la volée** : `referencePrices` absent, aucun event, `random` 0,5 (bruit nul), Logs
    `currentPrice` **6** (hors `basePrice`, pour qu'une initialisation erronée à `basePrice` échoue) →
    `referencePrices.logs` = 6 après le tick ; Planks 12 → 12, kits 20 → 20 ;
  - **création à la volée refusée** : `referencePrices` entièrement absent, un event (`priceMultipliers` logs
    ×1,8 et planks ×1,83, comme le schéma l'impose, `endsAt` et `decayEndsAt` renseignés) — un cas `active`, un
    cas `decaying` → le handler lève une
    erreur, `marketState/state` strictement identique avant/après (`prices`, `priceHistory`, `lastUpdatedAt`,
    `referencePrices` toujours absent) ;
  - **doublon détecté dans `updateMarketPrices`** : `referencePrices` présent, deux events `active` sur
    Logs/Planks → erreur, `marketState/state` strictement identique avant/après, kits compris ;
  - **event incomplet** (garde évaluée avant le filtre) : `referencePrices` absent et un event `active` sans
    `endsAt` → erreur, document inchangé ; `referencePrices` présent, deux events `active` sur Logs/Planks dont un
    sans `endsAt` → erreur, document inchangé ;
- `npm run test:emulator` vert ; déploiement de `updateMarketPrices` corrigée = escalade cas 2.

**Ce qui ferme TD-020 et ce qui est reporté** : TD-020 se ferme sur la correction de `computeMarketPrice` /
`updateMarketPrices` et les critères ci-dessus. Cette correction lève le prérequis bloquant. Les deux tests
suivants exigent `processWorldEventLifecycle`, qui n'existe pas avant cette correction. Ils deviennent des
**critères d'acceptation obligatoires de la sous-étape `processWorldEventLifecycle`** (étape contrats / world
events), avec la garde principale B, la constante `EVENT_DECAY_DURATION_MS` et l'alignement du contrat
`decayEndsAt` :
  - **doublon d'event**, trois cas distincts, chacun avec un event `pending` B arrivé à échéance et un premier
    event A sur Logs/Planks :
    - (a) A `active`, `endsAt` échu → `active → decaying` validé ; A reste en cours, donc B est refusé : refus logué,
      erreur en fin de passage, B reste `pending` sans `startedAt`, `endsAt` ni `decayEndsAt`, et la transition de
      A n'est pas annulée ;
    - (b) A `decaying`, `decayEndsAt` non échu → B refusé, comme en (a) ; A inchangé ;
    - (c) A `decaying`, `decayEndsAt` échu → A passe `completed`, puis B est activé DANS CE MÊME passage :
      `startedAt` = heure du passage, durée complète (+4 h, puis +60 min), aucune erreur ;
  - **durée** (arbitrage C) : activation à `T` → `endsAt = T + 4 h`, `decayEndsAt = endsAt + 60 min`, issu de
    `EVENT_DECAY_DURATION_MS`.

**Périmètre couvert par D-TD020-001/002/003** : modèle absolu pendant l'event, prix de référence suivi à part, decay
interpolé, amendement de l'ordre de calcul de D-ETAPE14b dans le même commit ; arbitrages A, B, C. Le ticket de
correction n'a plus de point de design ouvert. **Reste une escalade (cas 4)** : toute
autre modification de l'algorithme ou de ses valeurs (`DRIFT_FACTOR`, `NOISE_AMPLITUDE`, bornes, durée du decay,
multiplicateurs).
Les deux escalades annoncées par la version précédente (départ hors prix normal ; bruit des Planks) sont sans objet.

---

## TD Résolues

### TD-013 — Migration Node.js 20 → 22 pour les Cloud Functions

**Identifié :** 2026-05-31 (ÉTAPE 16, warning lors du déploiement sur guildsandempires-ca543)
**Criticité actuelle :** RÉSOLUE (2026-11-01)
**Résolution :** commit 3de8a77 (`nodejs22`, `engines.node 22`, `@types/node ^22`) ;
209/209 tests verts sur 2 runs ; déployé le 2026-11-01 (9 CF « Successful update », Node.js 22
2nd Gen) avec `FUNCTIONS_DISCOVERY_TIMEOUT=60`, car le chargement du code dépassait le délai
de 10 s de la CLI sur ce poste. Vérifié en Play : `resolveLoginState OK`.
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

---

### TD-014 — Tests resolveLoginState/collectProduction dépendaient de sleeps réels

**Identifié :** 2026-06-01 (ÉTAPE 17.A-1)
**Composant :** `resolveLoginState.test.ts` + `collectProduction.test.ts`

**RÉSOLU 2026-06-08 :** Les deux sleeps réels remplacés par la suppression déterministe du
doc `/rateLimits/{uid}_{action}` via Admin SDK (patron ÉTAPE 16.5, test "Deuxième login :
Sawmill non recréée") :
- resolveLoginState (test CRITIQUE) : `setTimeout(6000)` → `delete ${uid}_resolveLoginState`
- collectProduction (test 13 "Idempotence faible") : `setTimeout(7000)` → `delete ${uid}_collectProduction`
  (2e sleep découvert au diagnostic, hors périmètre initial, soldé dans le même lot)
Commentaires de scénario mis à jour (elapsed 7s → 0s). Timeout Jest 20000 retiré (test 13).
`grep "setTimeout(resolve" src/__test__/` = 0. Validation : 204/204 à chaud + 2 cycles à froid
consécutifs (émulateur tué/relancé) 204/204 → déterminisme prouvé. Commit : b63e497.

**Disposition des autres échecs cold-start cités à l'ouverture (non reproductibles, n=1) :**
- collectProduction PERMISSION_DENIED : **faux signal**. Les messages venaient de
  `firestore.rules.test.ts` (client SDK rules-unit-testing testant les refus = attendu),
  mal attribués à collectProduction dans la sortie Jest globale `--runInBand`. collectProduction
  utilise l'Admin SDK (bypass rules), ses 14 tests passent sans DENIED. Aucune TD distincte.
- upgradeInventoryCap (test 20) / sellToMarket (tests 20-21) : flakes de latence Firestore au
  cold-start (Promise.allSettled concurrents), non reproductibles. Pas de correction préventive
  d'un défaut non reproductible. Remède réel à la mise en place CI : warm-up déterministe de
  l'émulateur (attente active "All emulators ready" + un read jetable avant la suite, patron
  ÉTAPE 10) — dans le harness CI, pas dans les tests.

---

### TD-004 — Drift de temps résiduel non conservé dans lastProcessedAt

**Identifié :** 2026-05-19 (post-correction bug duplication offline)
**Composant :** `firebase/functions/src/shared/production.ts`

**RÉSOLU 2026-06-08 (ÉTAPE 17.B backend) :** `processBuildingSlots` corrigé pour
préserver le résiduel : `lastProcessedAt = createTimestamp(referenceTimestamp.toMillis() + completedCycles * durationMs)`
au lieu de `now`. Factory `createTimestamp: (ms: number) => firestore.Timestamp`
injectée comme 4e paramètre (helper reste pur — pas d'`import * as admin`). Détecteur
d'écriture par identité d'objet (`=== now`) remplacé par flag explicite
`hasProcessedCycles: boolean` dans `ProcessBuildingResult`. Commit : 4b7d66a.
3 tests dédiés ajoutés (8, 9, 10) — résiduel préservé, cycle exact, Option B perte sèche.
207/207 verts, 2 cycles à froid.
