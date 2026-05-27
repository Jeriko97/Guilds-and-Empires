import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth } from "../shared/validators";
import type { PlayerDocument, MarketStateDocument } from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

export type MarketResourceType = "logs" | "planks" | "reconstructionKits";

export type SellToMarketRequest = CallableRequest<{
  resourceType: MarketResourceType;
  quantity: number;
  idempotencyKey: string;
}>;

export type SellToMarketResponse = {
  goldEarned: number;
  priceApplied: number;
  newGold: number;
  alreadySold: boolean;
};

// ── Constantes ────────────────────────────────────────────────────────────────

export const MAX_MARKET_SELL_QUANTITY = 100;
export const MARKET_SALES_RATE_LIMIT  = 20;
export const MARKET_SALES_WINDOW_MS   = 60 * 60 * 1000;

const VALID_RESOURCE_TYPES: readonly MarketResourceType[] = [
  "logs",
  "planks",
  "reconstructionKits",
];

// ── Interface trace de vente — /players/{uid}/marketTrades/{idempotencyKey} ───

interface MarketTradeDocument {
  uid: string;
  resourceType: MarketResourceType;
  quantity: number;
  priceApplied: number;
  goldEarned: number;
  createdAt: admin.firestore.Timestamp;
}

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

export async function sellToMarketHandler(
  request: SellToMarketRequest
): Promise<SellToMarketResponse> {

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Timestamp serveur — une seule fois, hors tx (déterminisme TD-007) ──
  const now = admin.firestore.Timestamp.now();

  // ── 3. Validation entrée (hors tx) ────────────────────────────────────────
  const { resourceType, quantity, idempotencyKey } = request.data;

  if (!VALID_RESOURCE_TYPES.includes(resourceType as MarketResourceType)) {
    throw new HttpsError(
      "invalid-argument",
      `resourceType invalide : '${resourceType}'. Valeurs acceptées : ${VALID_RESOURCE_TYPES.join(", ")}.`
    );
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    throw new HttpsError("invalid-argument", "quantity doit être un entier.");
  }
  if (quantity <= 0) {
    throw new HttpsError("invalid-argument", "quantity doit être supérieur à 0.");
  }
  if (quantity > MAX_MARKET_SELL_QUANTITY) {
    throw new HttpsError(
      "invalid-argument",
      `quantity ne doit pas dépasser ${MAX_MARKET_SELL_QUANTITY}.`
    );
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    throw new HttpsError("invalid-argument", "idempotencyKey requis.");
  }

  const db             = admin.firestore();
  const playerRef      = db.collection("players").doc(uid);
  const marketStateRef = db.collection("marketState").doc("state");
  const tradeRef       = db
    .collection("players").doc(uid)
    .collection("marketTrades").doc(idempotencyKey);

  try {
    return await db.runTransaction(async (tx): Promise<SellToMarketResponse> => {

      // ── 4a. Reads en parallèle (pattern ÉTAPE 9) ──────────────────────────
      const [playerSnap, marketStateSnap, tradeSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(marketStateRef),
        tx.get(tradeRef),
      ]);

      // ── 4b. Player existe ─────────────────────────────────────────────────
      if (!playerSnap.exists) {
        throw new HttpsError("not-found", "player document missing");
      }
      const player = playerSnap.data() as PlayerDocument;

      // ── 4c. Idempotency ───────────────────────────────────────────────────
      if (tradeSnap.exists) {
        const trade = tradeSnap.data() as MarketTradeDocument;
        if (
          trade.uid          === uid          &&
          trade.resourceType === resourceType &&
          trade.quantity     === quantity
        ) {
          return {
            goldEarned:   trade.goldEarned,
            priceApplied: trade.priceApplied,
            newGold:      player.gold,
            alreadySold:  true,
          };
        }
        throw new HttpsError(
          "failed-precondition",
          "idempotency key already used with different payload"
        );
      }

      // ── 4d. Market state existe ───────────────────────────────────────────
      if (!marketStateSnap.exists) {
        throw new HttpsError("failed-precondition", "market state not initialized");
      }
      const marketState = marketStateSnap.data() as MarketStateDocument;

      // ── 4e. Inventory suffisant ───────────────────────────────────────────
      if (player.inventory[resourceType].quantity < quantity) {
        throw new HttpsError("failed-precondition", "insufficient inventory");
      }

      // ── 4f. Pruning du rate limit ─────────────────────────────────────────
      const rawSales    = player.marketSalesLastHour ?? [];
      const prunedSales = rawSales.filter(
        (ts) => now.toMillis() - ts.toMillis() < MARKET_SALES_WINDOW_MS
      );

      // ── 4g. Rate limit ────────────────────────────────────────────────────
      if (prunedSales.length >= MARKET_SALES_RATE_LIMIT) {
        throw new HttpsError("resource-exhausted", "market sales rate limit exceeded");
      }

      // ── 4h. Prix figé depuis marketState (server-authoritative) ──────────
      const price = marketState.prices[resourceType].currentPrice;
      if (!Number.isInteger(price)) {
        throw new HttpsError("internal", "non-integer market price");
      }

      // ── 4i. Calcul goldEarned (entier par construction) ───────────────────
      const goldEarned = price * quantity;
      const newGold    = player.gold + goldEarned;

      // ── 4j. Mutations — toutes les validations précèdent ──────────────────
      const updatedInventory = {
        ...player.inventory,
        [resourceType]: {
          ...player.inventory[resourceType],
          quantity: player.inventory[resourceType].quantity - quantity,
        },
      };

      tx.update(playerRef, {
        gold:                newGold,
        inventory:           updatedInventory,
        marketSalesLastHour: [...prunedSales, now],
      });

      const tradeDoc: MarketTradeDocument = {
        uid,
        resourceType,
        quantity,
        priceApplied: price,
        goldEarned,
        createdAt:    now,
      };
      tx.set(tradeRef, tradeDoc);

      return { goldEarned, priceApplied: price, newGold, alreadySold: false };
    });

  } catch (err) {
    if (err instanceof HttpsError) throw err;

    logger.error("sellToMarket: erreur inattendue", {
      uid,
      resourceType,
      quantity,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const sellToMarket = onCall(
  { invoker: "public" },
  sellToMarketHandler
);
