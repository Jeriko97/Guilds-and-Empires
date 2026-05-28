import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth } from "../shared/validators";
import type { PlayerDocument, FavorRank } from "../shared/types";
import { GUILD_CHARTER_COST, GUILD_CHARTER_FAVOR_THRESHOLD } from "../shared/guildCharter";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

export type PurchaseGuildCharterRequest = CallableRequest<{
  idempotencyKey: string;
}>;

export type PurchaseGuildCharterResponse = {
  goldSpent: number;
  newGold: number;
  guildCharterPurchasedAt: admin.firestore.Timestamp;
  alreadyPurchased: boolean;
};

// ── Interface trace d'achat — /players/{uid}/guildPurchases/{idempotencyKey} ──

interface GuildPurchaseDocument {
  uid: string;
  goldSpent: number;
  favorAtPurchase: number;
  favorRankAtPurchase: FavorRank;
  createdAt: admin.firestore.Timestamp;
}

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

export async function purchaseGuildCharterHandler(
  request: PurchaseGuildCharterRequest
): Promise<PurchaseGuildCharterResponse> {

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Timestamp serveur — une seule fois, hors tx (V1) ──────────────────
  const now = admin.firestore.Timestamp.now();

  // ── 3. Validation entrée (hors tx) ────────────────────────────────────────
  const { idempotencyKey } = request.data;

  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    throw new HttpsError("invalid-argument", "idempotencyKey requis.");
  }

  const db               = admin.firestore();
  const playerRef        = db.collection("players").doc(uid);
  const guildPurchaseRef = db
    .collection("players").doc(uid)
    .collection("guildPurchases").doc(idempotencyKey);

  try {
    return await db.runTransaction(async (tx): Promise<PurchaseGuildCharterResponse> => {

      // ── 4a. Reads en parallèle (V3 — anti-TOCTOU) ────────────────────────
      const [playerSnap, guildPurchaseSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(guildPurchaseRef),
      ]);

      // ── 4b. Player existe ─────────────────────────────────────────────────
      if (!playerSnap.exists) {
        throw new HttpsError("not-found", "player document missing");
      }
      const player = playerSnap.data() as PlayerDocument;

      // ── 4c. Idempotency technique — AVANT check métier (V4) ──────────────
      if (guildPurchaseSnap.exists) {
        const record = guildPurchaseSnap.data() as GuildPurchaseDocument;
        if (record.uid === uid) {
          return {
            goldSpent:               record.goldSpent,
            newGold:                 player.gold,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            guildCharterPurchasedAt: player.guildCharterPurchasedAt!,
            alreadyPurchased:        true,
          };
        }
        throw new HttpsError(
          "failed-precondition",
          "idempotency key already used by another player"
        );
      }

      // ── 4d. Idempotency métier ────────────────────────────────────────────
      if (player.guildCharterUnlocked === true) {
        throw new HttpsError("failed-precondition", "guild charter already purchased");
      }

      // ── 4e. Check favor (V5 — favor avant gold) ───────────────────────────
      if (player.imperialFavor < GUILD_CHARTER_FAVOR_THRESHOLD) {
        throw new HttpsError("failed-precondition", "insufficient imperial favor");
      }

      // ── 4f. Check gold ────────────────────────────────────────────────────
      if (player.gold < GUILD_CHARTER_COST) {
        throw new HttpsError("failed-precondition", "insufficient gold");
      }

      // ── 4g. Mutations (V2 — champs explicites) ────────────────────────────
      tx.update(playerRef, {
        gold:                    player.gold - GUILD_CHARTER_COST,
        guildCharterUnlocked:    true,
        guildCharterPurchasedAt: now,
      });

      const purchaseDoc: GuildPurchaseDocument = {
        uid,
        goldSpent:           GUILD_CHARTER_COST,
        favorAtPurchase:     player.imperialFavor,
        favorRankAtPurchase: player.favorRank,
        createdAt:           now,
      };
      tx.set(guildPurchaseRef, purchaseDoc);

      return {
        goldSpent:               GUILD_CHARTER_COST,
        newGold:                 player.gold - GUILD_CHARTER_COST,
        guildCharterPurchasedAt: now,
        alreadyPurchased:        false,
      };
    });

  } catch (err) {
    if (err instanceof HttpsError) throw err;

    logger.error("purchaseGuildCharter: erreur inattendue", {
      uid,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const purchaseGuildCharter = onCall(
  { invoker: "public" },
  purchaseGuildCharterHandler
);
