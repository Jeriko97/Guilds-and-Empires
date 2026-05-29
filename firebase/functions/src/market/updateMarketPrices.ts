import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/logger";

import { MARKET_PRICE_BOUNDS } from "../shared/marketPrices";
import type { MarketResource } from "../shared/marketPrices";
import { computeMarketPrice, computeTrend } from "../shared/computeMarketPrice";
import type { EventMultiplier } from "../shared/computeMarketPrice";
import type { WorldEventDocument } from "../shared/types";

type RandomFn = () => number;

export async function updateMarketPricesHandler(
  random: RandomFn = Math.random,
  now: admin.firestore.Timestamp = admin.firestore.Timestamp.now(),
): Promise<void> {
  const db             = admin.firestore();
  const marketStateRef = db.collection("marketState").doc("state");

  // 1. Parallel reads
  const [marketStateSnap, eventsSnap] = await Promise.all([
    marketStateRef.get(),
    db.collection("activeWorldEvents")
      .where("status", "in", ["active", "decaying"])
      .get(),
  ]);

  // 2. Missing marketState → graceful skip (first deployment)
  if (!marketStateSnap.exists) {
    logger.warn("updateMarketPrices: marketState/state not found — skipping (first deployment?)");
    return;
  }

  const marketData = marketStateSnap.data()!;

  // 3. Fail loudly on corrupted structure
  const resources = Object.keys(MARKET_PRICE_BOUNDS) as MarketResource[];
  for (const resource of resources) {
    const currentPrice = marketData.prices?.[resource]?.currentPrice;
    if (currentPrice === undefined || !Number.isInteger(currentPrice)) {
      throw new Error(`marketState corrupted: missing prices.${resource}.currentPrice`);
    }
  }

  // 4. Parse events by resource
  const eventsByResource: Record<MarketResource, EventMultiplier[]> = {
    logs:               [],
    planks:             [],
    reconstructionKits: [],
  };

  for (const eventDoc of eventsSnap.docs) {
    const event = eventDoc.data() as WorldEventDocument;
    // Active events: endsAt required; decayEndsAt is null until the event expires (schema-correct).
    // Decaying events: both timestamps required to interpolate the multiplier.
    if (!event.endsAt) continue;
    if (event.status === "decaying" && !event.decayEndsAt) continue;

    const multipliers = event.priceMultipliers as Record<string, number | undefined>;
    for (const resource of resources) {
      const m = multipliers[resource];
      if (m !== undefined) {
        eventsByResource[resource].push({
          multiplier:  m,
          status:      event.status as "active" | "decaying",
          endsAt:      event.endsAt,
          // For active events, decayEndsAt is null; endsAt is used as placeholder — won't be accessed.
          decayEndsAt: event.decayEndsAt ?? event.endsAt,
        });
      }
    }
  }

  // 5. Compute new prices and histories
  const newPrices: Record<string, unknown>  = {};
  const newPriceHistory: Record<string, number[]> = {};

  for (const resource of resources) {
    const currentPrice = marketData.prices[resource].currentPrice as number;
    const newPrice     = computeMarketPrice(
      resource,
      currentPrice,
      eventsByResource[resource],
      random,
      now,
    );
    const newTrend = computeTrend(currentPrice, newPrice);

    newPrices[resource] = {
      currentPrice: newPrice,
      basePrice:    MARKET_PRICE_BOUNDS[resource].basePrice,
      trend:        newTrend,
    };

    // FIFO priceHistory — max 3 entries
    const history = [...(marketData.priceHistory?.[resource] ?? []), newPrice];
    while (history.length > 3) history.shift();
    newPriceHistory[resource] = history;
  }

  // 6. Write (no transaction needed — scheduled CF is singleton)
  await marketStateRef.set({
    schemaVersion: marketData.schemaVersion ?? 1,
    lastUpdatedAt: now,
    prices:        newPrices,
    priceHistory:  newPriceHistory,
  });
}

export const updateMarketPrices = onSchedule(
  "every 5 minutes",
  async () => {
    await updateMarketPricesHandler();
  },
);
