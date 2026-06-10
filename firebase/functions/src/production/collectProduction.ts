import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth, requireSchemaVersion } from "../shared/validators";
import { checkRateLimit } from "../shared/rateLimiter";
import { processBuildingSlots } from "../shared/production";
import type { ProcessBuildingResult, ResourceKey } from "../shared/production";
import type { PlayerDocument, BuildingDocument, InventoryState } from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

interface CollectProductionData {
  buildingId: unknown;
}

export type CollectProductionRequest  = CallableRequest<CollectProductionData>;
export type CollectProductionResponse = {
  collected: Partial<Record<ResourceKey, number>>;
  discarded: Partial<Record<ResourceKey, number>>;
  building:  BuildingDocument;
  inventory: InventoryState;
};

// ── Constantes ────────────────────────────────────────────────────────────────

// ≈10 appels/min par uid (TD-001 : cooldown simple, pas token bucket — toléré).
const RATE_LIMIT_SECONDS = 6;

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

/**
 * Récolte la production accumulée sur tous les slots actifs d'un bâtiment.
 *
 * - Server-authoritative : tout temps vient du serveur (Timestamp.now() injecté au call site).
 * - Atomique : lecture et écriture dans une seule transaction Firestore.
 * - Aucun slot actif = no-op valide (pas d'erreur, objet vide retourné).
 * - Rate limit hors transaction : un retry de Firestore ne recompterait pas sinon.
 */
export async function collectProductionHandler(
  request: CollectProductionRequest
): Promise<CollectProductionResponse> {

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Rate limit — hors transaction ─────────────────────────────────────
  await checkRateLimit(uid, "collectProduction", RATE_LIMIT_SECONDS);

  // ── 3. Validation buildingId ──────────────────────────────────────────────
  const { buildingId } = request.data;
  if (typeof buildingId !== "string" || buildingId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      `'buildingId' doit être une chaîne non vide. Valeur reçue : ${JSON.stringify(buildingId)}.`
    );
  }

  const db          = admin.firestore();
  const playerRef   = db.collection("players").doc(uid);
  const buildingRef = db.collection("players").doc(uid).collection("buildings").doc(buildingId);

  try {

    // ── 4-6. Transaction read-modify-write ────────────────────────────────
    // tx.get remplace les reads de validation 4-5 — pas de double lecture.
    const transactionResult = await db.runTransaction(
      async (tx): Promise<CollectProductionResponse> => {

        const [playerSnap, buildingSnap] = await Promise.all([
          tx.get(playerRef),
          tx.get(buildingRef),
        ]);

        // Validation 4 — player existe + schéma valide
        if (!playerSnap.exists) {
          throw new HttpsError("not-found", "Document joueur introuvable.");
        }
        const playerData = playerSnap.data() as PlayerDocument;
        requireSchemaVersion(playerData);

        // Validation 5 — building existe
        if (!buildingSnap.exists) {
          throw new HttpsError(
            "not-found",
            `Bâtiment '${buildingId}' introuvable pour ce joueur.`
          );
        }
        const buildingData = buildingSnap.data() as BuildingDocument;

        // Validation 6 — aucun slot actif → no-op valide, pas d'erreur.
        const hasActiveSlot = buildingData.slots.some((s) => s.recipeId !== null);
        if (!hasActiveSlot) {
          return { collected: {}, discarded: {}, building: buildingData, inventory: playerData.inventory };
        }

        // ── Calcul de production différée ─────────────────────────────────
        // `now` injecté ici (call site) — jamais dans le helper (testabilité).
        const now = admin.firestore.Timestamp.now();

        let processResult: ProcessBuildingResult;
        try {
          processResult = processBuildingSlots(buildingData, playerData.inventory, now);
        } catch (helperErr) {
          // Error standard du helper (recipe inconnue = corruption data) → internal.
          throw new HttpsError(
            "internal",
            helperErr instanceof Error ? helperErr.message : "Erreur interne du serveur."
          );
        }

        const { updatedSlots, updatedInventory, collected, discarded } = processResult;

        // Optimisation : skip des écritures si aucun cycle complété.
        // Même détection que resolveLoginState : identité objet sur `now`.
        const anySlotProcessed = updatedSlots.some((s) => s.lastProcessedAt === now);
        if (anySlotProcessed) {
          tx.update(playerRef,   { inventory: updatedInventory });
          tx.update(buildingRef, { slots: updatedSlots });
        }

        const updatedBuilding: BuildingDocument = { ...buildingData, slots: updatedSlots };
        return { collected, discarded, building: updatedBuilding, inventory: updatedInventory };
      }
    );

    return transactionResult;

  } catch (err) {
    if (err instanceof HttpsError) throw err;

    logger.error("collectProduction: erreur inattendue", {
      uid,
      buildingId,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const collectProduction = onCall(
  { invoker: "public" },
  collectProductionHandler
);
