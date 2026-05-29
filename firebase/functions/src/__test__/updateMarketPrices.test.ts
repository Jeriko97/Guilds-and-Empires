import * as admin from "firebase-admin";

import { updateMarketPricesHandler } from "../market/updateMarketPrices";
import { MARKET_PRICE_BOUNDS } from "../shared/marketPrices";
import { db } from "./helpers";
import type { MarketStateDocument, WorldEventDocument } from "../shared/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Timestamp fixe pour déterminisme — NOW se situe entre endsAt et decayEndsAt dans les tests de decay
const NOW_TS = admin.firestore.Timestamp.fromMillis(1_700_000_000_000);

// Seed aligné sur phase-1-economy-values.md (résolution TD-011)
const SEED_MARKET_STATE: MarketStateDocument = {
  schemaVersion: 1,
  lastUpdatedAt: admin.firestore.Timestamp.fromMillis(0),
  prices: {
    logs:               { currentPrice: MARKET_PRICE_BOUNDS.logs.basePrice,               basePrice: MARKET_PRICE_BOUNDS.logs.basePrice,               trend: "stable" },
    planks:             { currentPrice: MARKET_PRICE_BOUNDS.planks.basePrice,             basePrice: MARKET_PRICE_BOUNDS.planks.basePrice,             trend: "stable" },
    reconstructionKits: { currentPrice: MARKET_PRICE_BOUNDS.reconstructionKits.basePrice, basePrice: MARKET_PRICE_BOUNDS.reconstructionKits.basePrice, trend: "stable" },
  },
  priceHistory: { logs: [], planks: [], reconstructionKits: [] },
};

// ── Helpers locaux ────────────────────────────────────────────────────────────

async function clearMarketData(): Promise<void> {
  const [marketSnap, eventsSnap] = await Promise.all([
    db.collection("marketState").get(),
    db.collection("activeWorldEvents").get(),
  ]);
  const batch = db.batch();
  marketSnap.docs.forEach((d) => batch.delete(d.ref));
  eventsSnap.docs.forEach((d) => batch.delete(d.ref));
  if (marketSnap.docs.length + eventsSnap.docs.length > 0) await batch.commit();
}

async function seedMarketState(overrides: Partial<MarketStateDocument> = {}): Promise<void> {
  await db.collection("marketState").doc("state").set({ ...SEED_MARKET_STATE, ...overrides });
}

async function createActiveEvent(
  eventId: string,
  priceMultipliers: Record<string, number>,
  status: "active" | "decaying" = "active",
  overrides: Partial<WorldEventDocument> = {},
): Promise<void> {
  const endsAt      = admin.firestore.Timestamp.fromMillis(NOW_TS.toMillis() - 1_000);
  const decayEndsAt = admin.firestore.Timestamp.fromMillis(NOW_TS.toMillis() + 3_600_000);
  const doc: WorldEventDocument = {
    eventId,
    eventType:             "imperial_reconstruction_initiative",
    status,
    startedAt:             admin.firestore.Timestamp.fromMillis(NOW_TS.toMillis() - 14_400_000),
    endsAt:                status === "active"
      ? admin.firestore.Timestamp.fromMillis(NOW_TS.toMillis() + 3_600_000)
      : endsAt,
    decayEndsAt:           status === "active" ? null : decayEndsAt,
    priceMultipliers:      priceMultipliers as WorldEventDocument["priceMultipliers"],
    priorityContractSlots: { total: 0, claimed: 0 },
    triggerCondition:      null,
    triggerProcessed:      true,
    ...overrides,
  };
  await db.collection("activeWorldEvents").doc(eventId).set(doc);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await clearMarketData();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("updateMarketPrices", () => {

  // ── F. Happy paths ───────────────────────────────────────────────────────

  it("19. Happy path — marketState seed à basePrice, aucun event → lastUpdatedAt mis à jour, priceHistory grandit", async () => {
    await seedMarketState();

    await updateMarketPricesHandler(() => 0.5, NOW_TS);

    const snap = await db.collection("marketState").doc("state").get();
    expect(snap.exists).toBe(true);
    const data = snap.data()!;

    expect(data.lastUpdatedAt.isEqual(NOW_TS)).toBe(true);

    // Avec random=0.5 (noise neutre) et currentPrice=basePrice → drift = basePrice, noise = 0 → price stable
    expect(data.prices.logs.currentPrice).toBe(5);
    expect(data.prices.planks.currentPrice).toBe(12);
    expect(data.prices.reconstructionKits.currentPrice).toBe(20);

    expect(data.prices.logs.trend).toBe("stable");
    expect(data.prices.planks.trend).toBe("stable");
    expect(data.prices.reconstructionKits.trend).toBe("stable");

    expect(data.priceHistory.logs).toHaveLength(1);
    expect(data.priceHistory.planks).toHaveLength(1);
    expect(data.priceHistory.reconstructionKits).toHaveLength(1);
  });

  it("20. FIFO priceHistory : après 4 appels consécutifs, length=3 (les 3 plus récents)", async () => {
    await seedMarketState();

    for (let i = 0; i < 4; i++) {
      await updateMarketPricesHandler(() => 0.5, NOW_TS);
    }

    const data = (await db.collection("marketState").doc("state").get()).data()!;
    expect(data.priceHistory.logs).toHaveLength(3);
    expect(data.priceHistory.planks).toHaveLength(3);
    expect(data.priceHistory.reconstructionKits).toHaveLength(3);
  });

  // ── G. Events Firestore ──────────────────────────────────────────────────

  it("21. Event status='active' priceMultipliers={logs: 1.8} → logs multiplié, planks inchangé", async () => {
    await seedMarketState();
    await createActiveEvent("UMP_event_logs18", { logs: 1.8 });

    await updateMarketPricesHandler(() => 0.5, NOW_TS);

    const data = (await db.collection("marketState").doc("state").get()).data()!;
    // logs: basePrice=5, drift=5, intermediate=5, *1.8=9 → max(3,9)=9
    expect(data.prices.logs.currentPrice).toBe(9);
    // planks: basePrice=12, drift=12, intermediate=12, *1.0=12 (no event for planks)
    expect(data.prices.planks.currentPrice).toBe(12);
  });

  it("22. Event status='completed' → ignoré (query filtre sur active/decaying uniquement)", async () => {
    await seedMarketState();
    // Créer un event completed manuellement (pas filtré par la query — mais la query le filtre)
    await db.collection("activeWorldEvents").doc("UMP_event_completed").set({
      eventId:    "UMP_event_completed",
      eventType:  "imperial_reconstruction_initiative",
      status:     "completed",
      startedAt:  null,
      endsAt:     null,
      decayEndsAt: null,
      priceMultipliers: { logs: 9.0, planks: 9.0 },
      priorityContractSlots: { total: 0, claimed: 0 },
      triggerCondition: null,
      triggerProcessed: true,
    });

    await updateMarketPricesHandler(() => 0.5, NOW_TS);

    const data = (await db.collection("marketState").doc("state").get()).data()!;
    // Aucun multiplicateur appliqué — prix inchangés (basePrices)
    expect(data.prices.logs.currentPrice).toBe(5);
    expect(data.prices.planks.currentPrice).toBe(12);
  });

  it("23. Event status='decaying' → decay interpolation appliquée (progress≈0.5 → effective≈1.4)", async () => {
    await seedMarketState();

    // endsAt = NOW - 1h, decayEndsAt = NOW + 1h → progress = 1h/(2h) = 0.5
    const endsAtMs      = NOW_TS.toMillis() - 3_600_000;
    const decayEndsAtMs = NOW_TS.toMillis() + 3_600_000;
    await db.collection("activeWorldEvents").doc("UMP_event_decay").set({
      eventId:    "UMP_event_decay",
      eventType:  "imperial_reconstruction_initiative",
      status:     "decaying",
      startedAt:  admin.firestore.Timestamp.fromMillis(endsAtMs - 14_400_000),
      endsAt:     admin.firestore.Timestamp.fromMillis(endsAtMs),
      decayEndsAt: admin.firestore.Timestamp.fromMillis(decayEndsAtMs),
      priceMultipliers: { logs: 1.8, planks: 1.8 },
      priorityContractSlots: { total: 0, claimed: 0 },
      triggerCondition: null,
      triggerProcessed: true,
    });

    await updateMarketPricesHandler(() => 0.5, NOW_TS);

    const data = (await db.collection("marketState").doc("state").get()).data()!;
    // logs: basePrice=5, drift=5, intermediate=5
    // effectiveMultiplier = 1.8 - (1.8-1)*0.5 = 1.8 - 0.4 = 1.4
    // withEvent = 5 * 1.4 = 7.0 → round = 7
    expect(data.prices.logs.currentPrice).toBe(7);
    expect(data.prices.planks.currentPrice).toBe(Math.round(12 * 1.4)); // 17
  });

  // ── H. Cas limites Firestore ─────────────────────────────────────────────

  it("24. marketState inexistant → log warning et return (pas d'exception, doc reste absent)", async () => {
    // marketState absent — handler doit retourner silencieusement
    await expect(
      updateMarketPricesHandler(() => 0.5, NOW_TS)
    ).resolves.toBeUndefined();

    const snap = await db.collection("marketState").doc("state").get();
    expect(snap.exists).toBe(false);
  });

  it("25. activeWorldEvents collection vide → prix calculés sans multiplicateur", async () => {
    await seedMarketState({ prices: {
      logs:               { currentPrice: 7, basePrice: 5, trend: "rising" },
      planks:             { currentPrice: 15, basePrice: 12, trend: "rising" },
      reconstructionKits: { currentPrice: 20, basePrice: 20, trend: "stable" },
    }});
    // Aucun event

    await updateMarketPricesHandler(() => 0.5, NOW_TS);

    const data = (await db.collection("marketState").doc("state").get()).data()!;
    // logs: drift = 7 + (5-7)*0.1 = 6.8, noise=0 → round(6.8)=7
    expect(data.prices.logs.currentPrice).toBe(7);
    // planks: drift = 15 + (12-15)*0.1 = 14.7, noise=0 → round(14.7)=15
    expect(data.prices.planks.currentPrice).toBe(15);
    // kits: fixe = 20
    expect(data.prices.reconstructionKits.currentPrice).toBe(20);
  });

  it("26. marketState corrompu (prices.logs.currentPrice absent) → throw Error avec message explicite", async () => {
    // Doc existant mais structure incomplète
    await db.collection("marketState").doc("state").set({
      schemaVersion: 1,
      lastUpdatedAt: admin.firestore.Timestamp.now(),
      prices: {
        // logs absent intentionnellement
        planks:             { currentPrice: 12, basePrice: 12, trend: "stable" },
        reconstructionKits: { currentPrice: 20, basePrice: 20, trend: "stable" },
      },
      priceHistory: { logs: [], planks: [], reconstructionKits: [] },
    });

    await expect(
      updateMarketPricesHandler(() => 0.5, NOW_TS)
    ).rejects.toThrow("marketState corrupted: missing prices.logs.currentPrice");
  });

  // ── I. Déterminisme ──────────────────────────────────────────────────────

  it("27. Deux appels successifs avec même random et même état initial → même résultat (idempotence au tick)", async () => {
    await seedMarketState({ prices: {
      logs:               { currentPrice: 7, basePrice: 5, trend: "stable" },
      planks:             { currentPrice: 15, basePrice: 12, trend: "stable" },
      reconstructionKits: { currentPrice: 20, basePrice: 20, trend: "stable" },
    }});

    await updateMarketPricesHandler(() => 0.5, NOW_TS);
    const snap1 = (await db.collection("marketState").doc("state").get()).data()!;
    const prices1 = {
      logs:   snap1.prices.logs.currentPrice,
      planks: snap1.prices.planks.currentPrice,
      kits:   snap1.prices.reconstructionKits.currentPrice,
    };

    // Réinitialiser l'état initial avant le 2e appel
    await seedMarketState({ prices: {
      logs:               { currentPrice: 7, basePrice: 5, trend: "stable" },
      planks:             { currentPrice: 15, basePrice: 12, trend: "stable" },
      reconstructionKits: { currentPrice: 20, basePrice: 20, trend: "stable" },
    }});

    await updateMarketPricesHandler(() => 0.5, NOW_TS);
    const snap2 = (await db.collection("marketState").doc("state").get()).data()!;
    const prices2 = {
      logs:   snap2.prices.logs.currentPrice,
      planks: snap2.prices.planks.currentPrice,
      kits:   snap2.prices.reconstructionKits.currentPrice,
    };

    expect(prices1).toEqual(prices2);
  });

});
