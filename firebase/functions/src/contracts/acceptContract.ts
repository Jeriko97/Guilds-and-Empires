import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth } from "../shared/validators";
import type {
  PlayerDocument,
  ContractPoolDocument,
  WorldEventDocument,
  ContractDocument,
  FavorRank,
  ContractTier,
} from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

export type AcceptContractRequest = CallableRequest<{
  contractTemplateId: string;
}>;

export type AcceptContractResponse = {
  playerContractId: string;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const TIER_ALLOWED_RANKS: Record<ContractTier, readonly FavorRank[]> = {
  standard:   ["local_supplier", "approved_merchant", "imperial_entrepreneur", "guild_charter_eligible"],
  reinforced: ["approved_merchant", "imperial_entrepreneur", "guild_charter_eligible"],
  priority:   ["approved_merchant", "imperial_entrepreneur", "guild_charter_eligible"],
};

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

/**
 * Accepte un contrat depuis le pool global et crée un document joueur actif.
 *
 * - Server-authoritative : le client envoie uniquement contractTemplateId.
 * - Atomique : toutes les lectures puis toutes les validations puis toutes les écritures.
 * - check-then-mutate : zéro écriture avant que toutes les conditions soient vérifiées.
 * - Priority slots : incrémentés via FieldValue.increment dans la même transaction.
 */
export async function acceptContractHandler(
  request: AcceptContractRequest
): Promise<AcceptContractResponse> {

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Payload validation ─────────────────────────────────────────────────
  const { contractTemplateId } = request.data;
  if (typeof contractTemplateId !== "string" || contractTemplateId.trim() === "") {
    throw new HttpsError("invalid-argument", "contractTemplateId required");
  }

  const db = admin.firestore();
  const playerRef    = db.collection("players").doc(uid);
  const templateRef  = db.collection("contractPool").doc(contractTemplateId);
  const activeContractsQuery = db
    .collection("players").doc(uid)
    .collection("contracts")
    .where("contractTemplateId", "==", contractTemplateId)
    .where("status", "==", "active");

  try {
    const playerContractId = await db.runTransaction(async (tx): Promise<string> => {

      // ── Reads — tous avant les écritures (contrainte Firestore) ───────────
      const [playerSnap, templateSnap, activeContractsSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(templateRef),
        tx.get(activeContractsQuery),
      ]);

      // ── 3. Player existe ──────────────────────────────────────────────────
      if (!playerSnap.exists) {
        throw new HttpsError("failed-precondition", "player document not found");
      }
      const rawPlayerData = playerSnap.data()!;

      // ── 4. favorRank présent — pas de fallback, pas de migration implicite ─
      if (!rawPlayerData.favorRank) {
        throw new HttpsError("failed-precondition", "player favorRank missing");
      }
      const playerData  = rawPlayerData as PlayerDocument;
      const favorRank   = playerData.favorRank;

      // ── 5. Template existe ────────────────────────────────────────────────
      if (!templateSnap.exists) {
        throw new HttpsError("not-found", "contract template not found");
      }
      const template = templateSnap.data() as ContractPoolDocument;

      // ── 6. Template actif + dans la fenêtre de validité ───────────────────
      const now = admin.firestore.Timestamp.now();
      const isValidWindow =
        template.isActive === true &&
        template.validFrom.toMillis() <= now.toMillis() &&
        (template.validUntil === null || template.validUntil.toMillis() > now.toMillis());

      if (!isValidWindow) {
        throw new HttpsError("failed-precondition", "contract template not available");
      }

      // ── 7. favorRank suffisant pour le tier ───────────────────────────────
      const allowedRanks = TIER_ALLOWED_RANKS[template.tier];
      if (!allowedRanks || !allowedRanks.includes(favorRank)) {
        throw new HttpsError("permission-denied", "favor rank insufficient for tier");
      }

      // ── 8. Pas de contrat actif pour ce template ──────────────────────────
      if (!activeContractsSnap.empty) {
        throw new HttpsError("failed-precondition", "contract already active for this template");
      }

      // ── 9. Priority : vérifier event + slots disponibles ─────────────────
      // Lecture conditionnelle — toujours avant les écritures.
      let eventRef: admin.firestore.DocumentReference | null = null;

      if (template.tier === "priority") {
        if (template.associatedEventId === null) {
          throw new HttpsError(
            "failed-precondition",
            "priority contract without associated event"
          );
        }

        eventRef = db.collection("activeWorldEvents").doc(template.associatedEventId);
        const eventSnap = await tx.get(eventRef);

        if (!eventSnap.exists) {
          throw new HttpsError("not-found", "world event not found");
        }
        const eventData = eventSnap.data() as WorldEventDocument;
        if (eventData.priorityContractSlots.claimed >= eventData.priorityContractSlots.total) {
          throw new HttpsError("resource-exhausted", "priority slots exhausted");
        }
      }

      // ── 10. Génération de l'ID joueur — côté serveur uniquement ──────────
      const newContractId = crypto.randomUUID();

      // ── 11. Création du doc /players/{uid}/contracts/{playerContractId} ───
      const contractRef = db
        .collection("players").doc(uid)
        .collection("contracts").doc(newContractId);

      const contractDoc: ContractDocument = {
        contractTemplateId,
        tier:              template.tier,
        resourceType:      template.resourceType,
        quantityRequired:  template.quantityRequired,
        quantityDelivered: 0,
        rewardGold:        template.rewardGold,
        rewardFavor:       template.rewardFavor,
        status:            "active",
        acceptedAt:        now,
        expiresAt:         template.validUntil,
        completedAt:       null,
        idempotencyKey:    newContractId,
      };

      tx.set(contractRef, contractDoc);

      // ── 12. Priority : incrémenter claimed ───────────────────────────────
      if (template.tier === "priority" && eventRef !== null) {
        tx.update(eventRef, {
          "priorityContractSlots.claimed": admin.firestore.FieldValue.increment(1),
        });
      }

      return newContractId;
    });

    return { playerContractId };

  } catch (err) {
    if (err instanceof HttpsError) throw err;

    logger.error("acceptContract: erreur inattendue", {
      uid,
      contractTemplateId,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const acceptContract = onCall(
  { invoker: "public" },
  acceptContractHandler
);
