import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth } from "../shared/validators";
import type { PlayerDocument } from "../shared/types";
import {
  INVENTORY_UPGRADE_COSTS,
  INVENTORY_UPGRADE_AMOUNTS,
} from "../shared/inventoryUpgrades";
import type { UpgradeableResource } from "../shared/inventoryUpgrades";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

export type UpgradeInventoryCapRequest = CallableRequest<{
  resourceType: "logs" | "planks" | "reconstructionKits";
  upgradeIndex: 0 | 1;
  idempotencyKey: string;
}>;

export type UpgradeInventoryCapResponse = {
  newCap: number;
  goldSpent: number;
  newGold: number;
  newUpgradesApplied: number;
  alreadyUpgraded: boolean;
};

// ── Constantes locales ────────────────────────────────────────────────────────

const VALID_RESOURCE_TYPES: readonly UpgradeableResource[] = [
  "logs",
  "planks",
  "reconstructionKits",
];

// ── Interface trace d'upgrade — /players/{uid}/inventoryUpgrades/{key} ────────

interface InventoryUpgradeDocument {
  uid: string;
  resourceType: UpgradeableResource;
  upgradeIndex: number;
  goldSpent: number;
  capIncrease: number;
  createdAt: admin.firestore.Timestamp;
}

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

export async function upgradeInventoryCapHandler(
  request: UpgradeInventoryCapRequest
): Promise<UpgradeInventoryCapResponse> {

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Timestamp serveur — une seule fois, hors tx (V1) ──────────────────
  const now = admin.firestore.Timestamp.now();

  // ── 3. Validation entrée (hors tx) ────────────────────────────────────────
  const { resourceType, upgradeIndex, idempotencyKey } = request.data;

  if (!VALID_RESOURCE_TYPES.includes(resourceType as UpgradeableResource)) {
    throw new HttpsError(
      "invalid-argument",
      `resourceType invalide : '${resourceType}'. Valeurs acceptées : ${VALID_RESOURCE_TYPES.join(", ")}.`
    );
  }
  if (
    typeof upgradeIndex !== "number" ||
    !Number.isInteger(upgradeIndex)   ||
    upgradeIndex < 0                  ||
    upgradeIndex > 1
  ) {
    throw new HttpsError("invalid-argument", "upgradeIndex doit être 0 ou 1.");
  }

  const validResource = resourceType as UpgradeableResource;
  const costTable     = INVENTORY_UPGRADE_COSTS[validResource]   as readonly number[];
  const amountTable   = INVENTORY_UPGRADE_AMOUNTS[validResource] as readonly number[];

  if (upgradeIndex >= costTable.length) {
    throw new HttpsError(
      "invalid-argument",
      "upgrade tier not available for this resource"
    );
  }

  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    throw new HttpsError("invalid-argument", "idempotencyKey requis.");
  }

  // ── 4. Coûts et montant calculés hors tx (constantes immutables) ──────────
  const cost   = costTable[upgradeIndex];
  const amount = amountTable[upgradeIndex];

  const db             = admin.firestore();
  const playerRef      = db.collection("players").doc(uid);
  const upgradeRecordRef = db
    .collection("players").doc(uid)
    .collection("inventoryUpgrades").doc(idempotencyKey);

  try {
    return await db.runTransaction(async (tx): Promise<UpgradeInventoryCapResponse> => {

      // ── 5a. Reads en parallèle (V3 — anti-TOCTOU) ────────────────────────
      const [playerSnap, upgradeRecordSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(upgradeRecordRef),
      ]);

      // ── 5b. Player existe ─────────────────────────────────────────────────
      if (!playerSnap.exists) {
        throw new HttpsError("not-found", "player document missing");
      }
      const player = playerSnap.data() as PlayerDocument;

      // ── 5c. Idempotency technique (subcollection) — AVANT check métier (V4) ──
      if (upgradeRecordSnap.exists) {
        const record = upgradeRecordSnap.data() as InventoryUpgradeDocument;
        if (
          record.uid          === uid           &&
          record.resourceType === validResource &&
          record.upgradeIndex === upgradeIndex
        ) {
          return {
            newCap:             player.inventory[validResource].cap,
            goldSpent:          record.goldSpent,
            newGold:            player.gold,
            newUpgradesApplied: player.inventory[validResource].upgradesApplied ?? 0,
            alreadyUpgraded:    true,
          };
        }
        throw new HttpsError(
          "failed-precondition",
          "idempotency key already used with different payload"
        );
      }

      // ── 5d. Idempotency métier (double achat cross-device) ────────────────
      const currentApplied = player.inventory[validResource].upgradesApplied ?? 0;
      if (currentApplied > upgradeIndex) {
        throw new HttpsError("failed-precondition", "upgrade tier already applied");
      }
      if (currentApplied < upgradeIndex) {
        throw new HttpsError("failed-precondition", "previous upgrade tier required");
      }

      // ── 5e. Gold suffisant ────────────────────────────────────────────────
      if (player.gold < cost) {
        throw new HttpsError("failed-precondition", "insufficient gold");
      }

      // ── 5f. Mutations — spread imbriqué explicite (V2) ───────────────────
      const updatedInventory = {
        ...player.inventory,
        [validResource]: {
          ...player.inventory[validResource],
          cap:             player.inventory[validResource].cap + amount,
          upgradesApplied: currentApplied + 1,
        },
      };

      tx.update(playerRef, {
        gold:      player.gold - cost,
        inventory: updatedInventory,
      });

      const upgradeDoc: InventoryUpgradeDocument = {
        uid,
        resourceType:  validResource,
        upgradeIndex,
        goldSpent:     cost,
        capIncrease:   amount,
        createdAt:     now,
      };
      tx.set(upgradeRecordRef, upgradeDoc);

      return {
        newCap:             player.inventory[validResource].cap + amount,
        goldSpent:          cost,
        newGold:            player.gold - cost,
        newUpgradesApplied: currentApplied + 1,
        alreadyUpgraded:    false,
      };
    });

  } catch (err) {
    if (err instanceof HttpsError) throw err;

    logger.error("upgradeInventoryCap: erreur inattendue", {
      uid,
      resourceType,
      upgradeIndex,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const upgradeInventoryCap = onCall(
  { invoker: "public" },
  upgradeInventoryCapHandler
);
