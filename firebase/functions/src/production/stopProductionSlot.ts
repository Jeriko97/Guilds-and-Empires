import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import {
  requireAuth,
  requireSchemaVersion,
  requireValidSlotIndex,
  requireValidIdempotencyKey,
  requireValidDocumentId,
} from "../shared/validators";
import { checkRateLimit } from "../shared/rateLimiter";
import { computeSlotStop, corruptSlotDetails } from "../shared/production";
import type { ResourceKey, SlotStopResult } from "../shared/production";
import type {
  PlayerDocument,
  BuildingDocument,
  InventoryState,
  ProductionOpDocument,
  ProductionStopOpDocument,
} from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

/** Données envoyées par le client. Toutes les valeurs sont unknown — validées au runtime. */
interface StopProductionSlotData {
  buildingId:     unknown;
  slotIndex:      unknown;
  /** UUID par intention, généré par le client (D-ETAPE19-003). */
  idempotencyKey: unknown;
}

export type StopProductionSlotRequest  = CallableRequest<StopProductionSlotData>;
export type StopProductionSlotResponse = {
  /** Cycles terminés crédités avant l'arrêt, sur tous les slots du bâtiment (règlement complet). */
  collected: Partial<Record<ResourceKey, number>>;
  /** Production perdue à saturation lors de ce règlement. */
  discarded: Partial<Record<ResourceKey, number>>;
  /** Intrants des cycles non commencés rendus, dans la limite du plafond. */
  refunded:  Partial<Record<ResourceKey, number>>;
  /** Intrants à rendre perdus au plafond. */
  refundDiscarded: Partial<Record<ResourceKey, number>>;
  /** Building mis à jour : tous les slots réglés, slot arrêté libéré (sans id Firestore — injecté par le service client). */
  building:  BuildingDocument;
  inventory: InventoryState;
  /** true = clé d'idempotence déjà appliquée avec le même contenu : aucun effet, état courant renvoyé. */
  alreadyApplied: boolean;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const RATE_LIMIT_SECONDS = 2;

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

/**
 * Arrête un slot occupé et le libère (ÉTAPE 19.2, D-ETAPE19-002).
 *
 * - Seule l'intention vient du client (buildingId, slotIndex, idempotencyKey) : aucun temps,
 *   aucune quantité.
 * - Idempotence (D-ETAPE19-003) : trace productionOps lue juste après le joueur, AVANT les
 *   contrôles métier — un renvoi après un arrêt réussi trouve le slot libre et doit recevoir
 *   alreadyApplied = true.
 * - Calcul entièrement délégué à computeSlotStop (shared/production.ts) : règlement de tous les slots
 *   du bâtiment comme la collecte (D-ETAPE19-007), remboursement plafonné, libération. Un état
 *   corrompu sur n'importe quel slot, voisin compris, refuse l'arrêt sans écriture. Le handler ne
 *   fait que les lectures, les contrôles et les écritures.
 * - La transaction est atomique : toute vérification échouée annule l'ensemble.
 */
export async function stopProductionSlotHandler(
  request: StopProductionSlotRequest
): Promise<StopProductionSlotResponse> {

  // ── 1. Authentification ───────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Rate limit — 1 appel / 2s par uid ─────────────────────────────────
  await checkRateLimit(uid, "stopProductionSlot", RATE_LIMIT_SECONDS);

  // ── 3. Validation des inputs ──────────────────────────────────────────────
  const { buildingId, slotIndex, idempotencyKey } = request.data;

  requireValidDocumentId(buildingId, "buildingId"); // règle commune (D-ETAPE19-007)
  requireValidSlotIndex(slotIndex);              // asserts slotIndex is 0 | 1 | 2
  requireValidIdempotencyKey(idempotencyKey);    // UUID strict (D-ETAPE19-005)

  const db          = admin.firestore();
  const playerRef   = db.collection("players").doc(uid);
  const buildingRef = db.collection("players").doc(uid).collection("buildings").doc(buildingId);
  const opRef       = db.collection("players").doc(uid).collection("productionOps").doc(idempotencyKey);

  try {

    // ── 4. Transaction atomique ───────────────────────────────────────────
    return await db.runTransaction(async (tx): Promise<StopProductionSlotResponse> => {

      // 4a. Lecture player + building + trace d'idempotence en parallèle
      const [playerSnap, buildingSnap, opSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(buildingRef),
        tx.get(opRef),
      ]);

      // 4b. Player existe + schema valide
      if (!playerSnap.exists) {
        throw new HttpsError("not-found", "Document joueur introuvable.");
      }
      const playerData = playerSnap.data() as PlayerDocument;
      requireSchemaVersion(playerData);

      // 4b'. Idempotence — AVANT les contrôles métier (D-ETAPE19-003).
      if (opSnap.exists) {
        const op = opSnap.data() as ProductionOpDocument;
        const samePayload =
          op.uid        === uid        &&
          op.op         === "stop"     &&
          op.buildingId === buildingId &&
          op.slotIndex  === slotIndex;
        if (!samePayload) {
          throw new HttpsError(
            "failed-precondition",
            "idempotency key already used with different payload"
          );
        }
        if (!buildingSnap.exists) {
          throw new HttpsError(
            "not-found",
            `Bâtiment '${buildingId}' introuvable pour ce joueur.`
          );
        }
        return {
          collected:       {},
          discarded:       {},
          refunded:        {},
          refundDiscarded: {},
          building:        buildingSnap.data() as BuildingDocument,
          inventory:       playerData.inventory,
          alreadyApplied:  true,
        };
      }

      // 4c. Building existe ?
      if (!buildingSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Bâtiment '${buildingId}' introuvable pour ce joueur.`
        );
      }
      const buildingData = buildingSnap.data() as BuildingDocument;

      // 4d. Slot existe et occupé ?
      const targetSlot = buildingData.slots.find((s) => s.slotIndex === slotIndex);
      if (targetSlot === undefined) {
        throw new HttpsError(
          "not-found",
          `Slot ${slotIndex} introuvable dans le bâtiment '${buildingId}'.`
        );
      }
      if (targetSlot.recipeId === null) {
        throw new HttpsError(
          "failed-precondition",
          `Le slot ${slotIndex} est libre : rien à arrêter.`
        );
      }

      // 4e. Calcul partagé — `now` injecté ici (call site), jamais dans le helper (TD-007).
      const now = admin.firestore.Timestamp.now();
      const createTimestamp = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

      let stop: SlotStopResult;
      try {
        stop = computeSlotStop(buildingData, playerData.inventory, slotIndex, now, createTimestamp);
      } catch (helperErr) {
        // Le slot fautif (corrupt.slotIndex) peut être un voisin du slot demandé (règlement complet).
        const corrupt = corruptSlotDetails(helperErr);
        if (corrupt) {
          logger.error("stopProductionSlot: état de slot corrompu", {
            uid, buildingId, stoppedSlotIndex: slotIndex, ...corrupt,
          });
        }
        throw helperErr; // Error (recette inconnue) → internal, journalisée par le catch externe.
      }

      const op: ProductionStopOpDocument = {
        uid,
        op:        "stop",
        buildingId,
        slotIndex,
        recipeId:  targetSlot.recipeId,
        createdAt: now,
      };

      // 4f. Écritures atomiques
      tx.update(buildingRef, { slots: stop.updatedSlots });
      tx.update(playerRef,   { inventory: stop.updatedInventory });
      tx.set(opRef, op);

      // ── 5. Retour ───────────────────────────────────────────────────────
      return {
        collected:       stop.collected,
        discarded:       stop.discarded,
        refunded:        stop.refunded,
        refundDiscarded: stop.refundDiscarded,
        building:        { ...buildingData, slots: stop.updatedSlots },
        inventory:       stop.updatedInventory,
        alreadyApplied:  false,
      };
    });

  } catch (err) {
    // HttpsError remontés tels quels (auth, rate-limit, schema, validations, état corrompu, etc.).
    if (err instanceof HttpsError) throw err;

    logger.error("stopProductionSlot: erreur inattendue", {
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

export const stopProductionSlot = onCall(
  { invoker: "public" },
  stopProductionSlotHandler
);
