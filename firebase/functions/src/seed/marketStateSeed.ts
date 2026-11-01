import * as admin from "firebase-admin";

import { MARKET_PRICE_BOUNDS } from "../shared/marketPrices";
import type { MarketResource } from "../shared/marketPrices";
import type { MarketStateDocument, ResourcePrice } from "../shared/types";

// ── Seed versionné de marketState/state (TD-018) ──────────────────────────────
// Source unique des valeurs : MARKET_PRICE_BOUNDS (phase-1-economy-values.md §3-§4).
// Aucun prix littéral ici : modifier un prix de départ = modifier MARKET_PRICE_BOUNDS.

export const MARKET_STATE_SEED_SCHEMA_VERSION = 1;

export type SeedMarketStateResult = "created" | "already-exists";

/** gRPC ALREADY_EXISTS — renvoyé par DocumentReference.create() si le doc existe. */
const GRPC_ALREADY_EXISTS = 6;

function initialPrice(resource: MarketResource): ResourcePrice {
  const { basePrice } = MARKET_PRICE_BOUNDS[resource];
  return { currentPrice: basePrice, basePrice, trend: "stable" };
}

/** Document initial — pur, sans I/O. `now` vient de Timestamp.now() (TD-007 : pas de FieldValue). */
export function buildInitialMarketState(now: admin.firestore.Timestamp): MarketStateDocument {
  return {
    schemaVersion: MARKET_STATE_SEED_SCHEMA_VERSION,
    lastUpdatedAt: now,
    prices: {
      logs:               initialPrice("logs"),
      planks:             initialPrice("planks"),
      reconstructionKits: initialPrice("reconstructionKits"),
    },
    priceHistory: { logs: [], planks: [], reconstructionKits: [] },
  };
}

/**
 * Crée marketState/state s'il n'existe pas. Idempotent : un doc existant n'est JAMAIS réécrit
 * (create() est atomique côté serveur — pas de fenêtre read-then-write).
 */
export async function seedMarketStateIfAbsent(
  db: admin.firestore.Firestore,
  now: admin.firestore.Timestamp = admin.firestore.Timestamp.now(),
): Promise<SeedMarketStateResult> {
  const ref = db.collection("marketState").doc("state");
  try {
    await ref.create(buildInitialMarketState(now));
    return "created";
  } catch (err) {
    if ((err as { code?: unknown }).code === GRPC_ALREADY_EXISTS) return "already-exists";
    throw err;
  }
}
