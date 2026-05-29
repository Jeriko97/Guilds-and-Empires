import type { firestore } from "firebase-admin";

import {
  MARKET_PRICE_BOUNDS,
  MARKET_PRICE_DRIFT_FACTOR,
  MARKET_PRICE_NOISE_AMPLITUDE,
} from "./marketPrices";
import type { MarketResource } from "./marketPrices";

type RandomFn = () => number;

export type EventMultiplier = {
  multiplier: number;
  status: "active" | "decaying";
  endsAt: firestore.Timestamp;
  decayEndsAt: firestore.Timestamp;
};

export type Trend = "rising" | "stable" | "falling";

export function computeTrend(currentPrice: number, newPrice: number): Trend {
  if (newPrice > currentPrice) return "rising";
  if (newPrice < currentPrice) return "falling";
  return "stable";
}

function effectiveMultiplierForEvent(
  event: EventMultiplier,
  now: firestore.Timestamp,
): number {
  if (event.status === "active") return event.multiplier;
  const endsAtMs      = event.endsAt.toMillis();
  const decayEndsAtMs = event.decayEndsAt.toMillis();
  const nowMs         = now.toMillis();
  const progress      = Math.min(1, Math.max(0, (nowMs - endsAtMs) / (decayEndsAtMs - endsAtMs)));
  return event.multiplier - (event.multiplier - 1) * progress;
}

export function computeMarketPrice(
  resource: MarketResource,
  currentPrice: number,
  events: EventMultiplier[],
  random: RandomFn,
  now: firestore.Timestamp,
): number {
  const { basePrice, min, max } = MARKET_PRICE_BOUNDS[resource];

  const effectiveMultiplier = events.reduce(
    (acc, event) => acc * effectiveMultiplierForEvent(event, now),
    1.0,
  );

  // Fixed-floor resource (kits): no drift, no noise
  if (min === max) {
    return Math.round(basePrice * effectiveMultiplier);
  }

  const drift        = currentPrice + (basePrice - currentPrice) * MARKET_PRICE_DRIFT_FACTOR;
  const noise        = currentPrice * (random() * 2 * MARKET_PRICE_NOISE_AMPLITUDE - MARKET_PRICE_NOISE_AMPLITUDE);
  const intermediate = Math.min(max, Math.max(min, drift + noise));
  const withEvent    = intermediate * effectiveMultiplier;

  // Floor de sécurité — pas de ceiling (event boost intentionnel)
  return Math.round(Math.max(min, withEvent));
}
