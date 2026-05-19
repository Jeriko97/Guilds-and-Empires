/**
 * @deprecated Cette fonction est une preuve de concept pré-spec.
 * Elle sera supprimée à la fin de Phase 1 Vertical Slice quand son
 * rôle sera couvert par les Cloud Functions définies dans le
 * document phase-1-technical-implementation.md.
 * Collection /profiles/{uid} : à NE PAS étendre ni réutiliser.
 * Date prévue de suppression : fin Phase 1.
 */
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";
import type { ClaimDailyBonusResult, PlayerProfile, TransactionLog } from "./types";

// defineInt({ default }) est ignoré à l'exécution dans firebase-functions@7 :
// IntParam.runtimeValue() lit process.env[name] || "0", jamais options.default.
// On utilise des constantes jusqu'à ce que Firebase Remote Config soit intégré.
const DAILY_BONUS_GOLD = 100;
const COOLDOWN_HOURS   = 24;

const SCHEMA_VERSION = 1;

export const claimDailyBonus = onCall<{ nonce: string }>(
  // invoker: "public" est OBLIGATOIRE pour Firebase Functions v2 (Cloud Run).
  // Sans ça, Cloud Run rejette toute requête externe avec 403 avant d'atteindre
  // le handler Node.js. Unity reçoit alors un INTERNAL non parseable.
  { invoker: "public" },
  async (request): Promise<ClaimDailyBonusResult> => {

    // ── 1. Authentification ───────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;

    // ── 2. Validation du nonce ────────────────────────────────────────────────
    // Le nonce est un UUID généré côté client, jamais réutilisé.
    // Il protège contre les attaques de double-dépense (replay attack).
    const { nonce } = request.data;
    if (!nonce || typeof nonce !== "string" || nonce.length < 16 || nonce.length > 64) {
      throw new HttpsError("invalid-argument", "Nonce invalide.");
    }

    const db = admin.firestore();
    const profileRef    = db.collection("profiles").doc(uid);
    const nonceRef      = db.collection("transactionLogs").doc(nonce);

    // ── 3. Transaction atomique ───────────────────────────────────────────────
    // Tout se passe dans une seule transaction Firestore :
    //   - lecture du log d'idempotency (nonce déjà traité ?)
    //   - lecture du profil (gold actuel, lastClaimedAt)
    //   - validation des règles métier
    //   - écriture atomique profil + log
    return db.runTransaction(async (tx) => {
      try {

      const [nonceSnap, profileSnap] = await Promise.all([
        tx.get(nonceRef),
        tx.get(profileRef),
      ]);

      // ── 3a. Idempotency : nonce déjà traité ──────────────────────────────
      // Si le client renvoie la même requête (retry après timeout réseau),
      // on retourne le résultat déjà calculé sans retraiter.
      if (nonceSnap.exists) {
        const logged = nonceSnap.data() as TransactionLog;
        if (logged.uid !== uid) {
          // Nonce appartient à un autre joueur — tentative de réutilisation malveillante.
          throw new HttpsError("permission-denied", "Nonce invalide.");
        }
        return logged.result as unknown as ClaimDailyBonusResult;
      }

      // ── 3b. Vérification du cooldown ──────────────────────────────────────
      // Le serveur lit lastClaimedDailyBonusAt depuis Firestore.
      // Le client n'envoie JAMAIS de timestamp — le serveur ne lui fait pas confiance.
      const profile = profileSnap.exists
        ? (profileSnap.data() as PlayerProfile)
        : null;

      const lastClaimedAt = profile?.lastClaimedDailyBonusAt ?? null;
      if (lastClaimedAt) {
        const cooldownMs  = COOLDOWN_HOURS * 3_600_000;
        const elapsedMs   = Date.now() - lastClaimedAt.toMillis();
        if (elapsedMs < cooldownMs) {
          const remainingH = Math.ceil((cooldownMs - elapsedMs) / 3_600_000);
          throw new HttpsError(
            "failed-precondition",
            `Bonus déjà réclamé. Prochain bonus dans ${remainingH}h.`
          );
        }
      }

      // ── 3c. Calcul serveur-side ───────────────────────────────────────────
      // Le montant est déterminé par le serveur uniquement.
      // Le client envoie uniquement le nonce — jamais un montant.
      const goldDelta   = DAILY_BONUS_GOLD;
      const currentGold = profile?.gold ?? 0;
      const newGold     = currentGold + goldDelta;
      const serverTs    = admin.firestore.FieldValue.serverTimestamp();

      const result: ClaimDailyBonusResult = { goldDelta, newGold };

      // ── 3d. Écriture atomique ─────────────────────────────────────────────
      // Les deux writes sont dans la même transaction :
      // si l'un échoue, les deux sont annulés → pas de gold accordé sans log, ni l'inverse.
      tx.set(profileRef, {
        gold: newGold,
        lastClaimedDailyBonusAt: serverTs,
        schemaVersion: SCHEMA_VERSION,
      }, { merge: true });

      tx.set(nonceRef, {
        uid,
        action: "claimDailyBonus",
        result: result as unknown as Record<string, unknown>,
        processedAt: serverTs,
      });

      return result;

      } catch (err) {
        // Re-throw HttpsError tel quel — Firebase le traduit correctement côté client.
        if (err instanceof HttpsError) throw err;
        // Log l'erreur inattendue avant que Firebase la wrappe en INTERNAL opaque.
        logger.error("claimDailyBonus: erreur inattendue dans la transaction", {
          uid,
          nonce,
          error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
        });
        throw err;
      }
    });
  }
);
