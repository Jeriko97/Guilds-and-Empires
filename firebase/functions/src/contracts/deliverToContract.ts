import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth } from "../shared/validators";
import { computeFavorRank } from "../shared/favorRank";
import type { PlayerDocument, ContractDocument, FavorRank } from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

export type DeliverToContractRequest = CallableRequest<{
  playerContractId: string;
  idempotencyKey: string;
}>;

export type DeliverToContractResponse = {
  alreadyDelivered: boolean;
  rewardsGranted: boolean;
  goldEarned: number;
  favorEarned: number;
  newFavorRank: FavorRank | null;
};

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

export async function deliverToContractHandler(
  request: DeliverToContractRequest
): Promise<DeliverToContractResponse> {

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Payload validation ─────────────────────────────────────────────────
  const { playerContractId, idempotencyKey } = request.data;
  if (typeof playerContractId !== "string" || playerContractId.trim() === "") {
    throw new HttpsError("invalid-argument", "playerContractId required");
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    throw new HttpsError("invalid-argument", "idempotencyKey required");
  }

  const db = admin.firestore();
  const playerRef   = db.collection("players").doc(uid);
  const contractRef = db.collection("players").doc(uid)
    .collection("contracts").doc(playerContractId);

  try {
    return await db.runTransaction(async (tx): Promise<DeliverToContractResponse> => {

      // Capture timestamp avant les reads — invariant déterminisme (philosophie TD-007)
      const now = admin.firestore.Timestamp.now();

      // ── Reads — tous avant les écritures (contrainte Firestore) ───────────
      const [playerSnap, contractSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(contractRef),
      ]);

      // ── 4. Player existe ──────────────────────────────────────────────────
      if (!playerSnap.exists) {
        throw new HttpsError("failed-precondition", "player document not found");
      }
      const rawPlayerData = playerSnap.data()!;

      // ── 5. favorRank présent — pas de fallback, pas de migration implicite ─
      if (!rawPlayerData.favorRank) {
        throw new HttpsError("failed-precondition", "player favorRank missing");
      }
      const player = rawPlayerData as PlayerDocument;

      // ── 6. Contract existe ────────────────────────────────────────────────
      if (!contractSnap.exists) {
        throw new HttpsError("not-found", "contract not found");
      }
      const contract = contractSnap.data() as ContractDocument;

      // ── 7-10. Branchement selon status (check avant mutation) ─────────────

      if (contract.status === "completed") {
        if (contract.idempotencyKey === idempotencyKey) {
          // Succès idempotent — aucune écriture, transaction sort proprement
          return {
            alreadyDelivered: true,
            rewardsGranted:   false,
            goldEarned:       0,
            favorEarned:      0,
            newFavorRank:     null,
          };
        }
        throw new HttpsError(
          "failed-precondition",
          "contract already completed with different idempotency key"
        );
      }

      if (contract.status === "expired") {
        throw new HttpsError("failed-precondition", "contract expired");
      }

      if (contract.status === "active") {
        // Vérifier expiration via expiresAt — utilise `now` capturé (déterminisme)
        if (contract.expiresAt !== null && contract.expiresAt.toMillis() <= now.toMillis()) {
          throw new HttpsError("failed-precondition", "contract expired");
        }

        // Vérifier inventaire
        if (player.inventory.reconstructionKits.quantity < contract.quantityRequired) {
          throw new HttpsError("failed-precondition", "insufficient resources");
        }
      } else {
        // Garde-fou défensif — ne devrait jamais arriver avec des données valides
        throw new HttpsError("internal", "contract status invalid");
      }

      // ── Mutations — toutes les lectures et validations précèdent ──────────

      const newKitsQuantity =
        player.inventory.reconstructionKits.quantity - contract.quantityRequired;

      const newGold      = player.gold + contract.rewardGold;
      const newFavor     = player.imperialFavor + contract.rewardFavor;
      const newFavorRank = computeFavorRank(newFavor);
      const favorRankChanged = newFavorRank !== player.favorRank;

      // Pattern nested cloné — évite les subtilités dot-path Firestore en transaction
      const updatedInventory = {
        ...player.inventory,
        reconstructionKits: {
          ...player.inventory.reconstructionKits,
          quantity: newKitsQuantity,
        },
      };

      tx.update(playerRef, {
        gold:                   newGold,
        imperialFavor:          newFavor,
        inventory:              updatedInventory,
        favorRank:              newFavorRank,
        firstContractCompleted: true,
      });

      tx.update(contractRef, {
        status:            "completed",
        quantityDelivered: contract.quantityRequired,
        completedAt:       now,
        idempotencyKey,
      });

      return {
        alreadyDelivered: false,
        rewardsGranted:   true,
        goldEarned:       contract.rewardGold,
        favorEarned:      contract.rewardFavor,
        newFavorRank:     favorRankChanged ? newFavorRank : null,
      };
    });

  } catch (err) {
    if (err instanceof HttpsError) throw err;

    logger.error("deliverToContract: erreur inattendue", {
      uid,
      playerContractId,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const deliverToContract = onCall(
  { invoker: "public" },
  deliverToContractHandler
);
