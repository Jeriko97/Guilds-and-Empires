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
