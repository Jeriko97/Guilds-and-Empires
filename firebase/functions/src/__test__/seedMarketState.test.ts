import * as admin from "firebase-admin";

import { buildInitialMarketState, seedMarketStateIfAbsent } from "../seed/marketStateSeed";
import { parseSeedArgs } from "../seed/runSeedMarketState";
import { updateMarketPricesHandler } from "../market/updateMarketPrices";
import { sellToMarketHandler } from "../market/sellToMarket";
import type { SellToMarketRequest } from "../market/sellToMarket";
import { MARKET_PRICE_BOUNDS } from "../shared/marketPrices";
import { clearTestData, createTestPlayer, db, makeRequest } from "./helpers";
import type { InventoryState, MarketStateDocument } from "../shared/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SEED_TS = admin.firestore.Timestamp.fromMillis(1_700_000_000_000);
const TICK_TS = admin.firestore.Timestamp.fromMillis(1_700_000_300_000);

const marketStateRef = () => db.collection("marketState").doc("state");

async function clearSeedTestData(): Promise<void> {
  const [marketSnap, tradeSnap] = await Promise.all([
    db.collection("marketState").get(),
    db.collectionGroup("marketTrades").get(),
  ]);
  const batch = db.batch();
  marketSnap.docs.forEach((d) => batch.delete(d.ref));
  tradeSnap.docs.forEach((d) => batch.delete(d.ref));
  if (marketSnap.docs.length + tradeSnap.docs.length > 0) await batch.commit();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([clearTestData(), clearSeedTestData()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("seedMarketState (TD-018)", () => {

  // ── A. Contenu du document ───────────────────────────────────────────────

  it("1. Doc absent → 'created', doc conforme au schéma et aux valeurs de phase-1-economy-values (5 / 12 / 20)", async () => {
    const result = await seedMarketStateIfAbsent(db, SEED_TS);
    expect(result).toBe("created");

    const snap = await marketStateRef().get();
    expect(snap.exists).toBe(true);
    const data = snap.data() as MarketStateDocument;

    expect(data.schemaVersion).toBe(1);
    expect(data.lastUpdatedAt.isEqual(SEED_TS)).toBe(true);
    expect(data.prices).toEqual({
      logs:               { currentPrice: 5,  basePrice: 5,  trend: "stable" },
      planks:             { currentPrice: 12, basePrice: 12, trend: "stable" },
      reconstructionKits: { currentPrice: 20, basePrice: 20, trend: "stable" },
    });
    expect(data.priceHistory).toEqual({ logs: [], planks: [], reconstructionKits: [] });
  });

  it("2. buildInitialMarketState lit MARKET_PRICE_BOUNDS (source unique) pour chaque ressource", () => {
    const doc = buildInitialMarketState(SEED_TS);
    for (const resource of Object.keys(MARKET_PRICE_BOUNDS) as (keyof typeof MARKET_PRICE_BOUNDS)[]) {
      expect(doc.prices[resource].currentPrice).toBe(MARKET_PRICE_BOUNDS[resource].basePrice);
      expect(doc.prices[resource].basePrice).toBe(MARKET_PRICE_BOUNDS[resource].basePrice);
    }
  });

  // ── B. Idempotence ───────────────────────────────────────────────────────

  it("3. Doc existant (prix ayant dérivé) → 'already-exists', doc strictement inchangé", async () => {
    const live: MarketStateDocument = {
      ...buildInitialMarketState(SEED_TS),
      prices: {
        logs:               { currentPrice: 7,  basePrice: 5,  trend: "rising" },
        planks:             { currentPrice: 15, basePrice: 12, trend: "rising" },
        reconstructionKits: { currentPrice: 20, basePrice: 20, trend: "stable" },
      },
      priceHistory: { logs: [6, 7], planks: [14, 15], reconstructionKits: [20, 20] },
    };
    await marketStateRef().set(live);
    const before = (await marketStateRef().get()).updateTime!;

    const result = await seedMarketStateIfAbsent(db, TICK_TS);
    expect(result).toBe("already-exists");

    const after = await marketStateRef().get();
    expect(after.updateTime!.isEqual(before)).toBe(true);
    expect(after.data()).toEqual(live);
  });

  it("4. Seeds concurrents → exactement un 'created', le reste 'already-exists'", async () => {
    const results = await Promise.allSettled([
      seedMarketStateIfAbsent(db, SEED_TS),
      seedMarketStateIfAbsent(db, SEED_TS),
      seedMarketStateIfAbsent(db, SEED_TS),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const values = results.map((r) => (r as PromiseFulfilledResult<string>).value);
    expect(values.filter((v) => v === "created")).toHaveLength(1);
    expect(values.filter((v) => v === "already-exists")).toHaveLength(2);
  });

  it("4b. Erreur autre que ALREADY_EXISTS → propagée, jamais avalée en 'already-exists'", async () => {
    const permissionDenied = Object.assign(new Error("PERMISSION_DENIED"), { code: 7 });
    const failingDb = {
      collection: () => ({ doc: () => ({ create: async () => { throw permissionDenied; } }) }),
    } as unknown as admin.firestore.Firestore;

    await expect(seedMarketStateIfAbsent(failingDb, SEED_TS)).rejects.toBe(permissionDenied);
  });

  // ── C. Compatibilité avec les consommateurs ──────────────────────────────

  it("5. Doc seedé accepté par updateMarketPricesHandler (tick à l'équilibre : prix stables, historique = 1)", async () => {
    await seedMarketStateIfAbsent(db, SEED_TS);

    await updateMarketPricesHandler(() => 0.5, TICK_TS);

    const data = (await marketStateRef().get()).data() as MarketStateDocument;
    expect(data.lastUpdatedAt.isEqual(TICK_TS)).toBe(true);
    expect(data.prices.logs.currentPrice).toBe(5);
    expect(data.prices.planks.currentPrice).toBe(12);
    expect(data.prices.reconstructionKits.currentPrice).toBe(20);
    expect(data.priceHistory).toEqual({ logs: [5], planks: [12], reconstructionKits: [20] });
  });

  it("6. Doc seedé accepté par sellToMarketHandler (2 logs × 5 gold → 10 gold, inventaire décrémenté)", async () => {
    const uid = "SEED_sell_logs";
    const inventory: InventoryState = {
      logs:               { quantity: 10, cap: 50 },
      planks:             { quantity: 0,  cap: 30 },
      reconstructionKits: { quantity: 0,  cap: 10 },
    };
    await createTestPlayer(uid, { gold: 0, inventory });
    await seedMarketStateIfAbsent(db, SEED_TS);

    const request = {
      ...makeRequest(uid),
      data: { resourceType: "logs", quantity: 2, idempotencyKey: "seed-sell-1" },
    } as SellToMarketRequest;
    const result = await sellToMarketHandler(request);

    expect(result.priceApplied).toBe(5);
    expect(result.goldEarned).toBe(10);
    expect(result.newGold).toBe(10);
    expect(result.inventory.logs.quantity).toBe(8);

    const player = (await db.collection("players").doc(uid).get()).data()!;
    expect(player.gold).toBe(10);
    expect(player.inventory.logs.quantity).toBe(8);
  });

  // ── D. Garde-fous du script CLI (pur, sans émulateur) ────────────────────

  const NO_EMULATOR = {};
  const EMULATOR    = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };

  it("7. Sans --project → refus", () => {
    expect(parseSeedArgs(["--apply"], EMULATOR).ok).toBe(false);
    expect(parseSeedArgs(["--project", "--apply"], EMULATOR).ok).toBe(false);
  });

  it("8. Projet de production, --apply sans --confirm-production → refus", () => {
    const r = parseSeedArgs(["--project", "guildsandempires-ca543", "--apply"], NO_EMULATOR);
    expect(r.ok).toBe(false);
  });

  it("9. Projet de production sans --apply → dry-run autorisé (aucune écriture)", () => {
    const r = parseSeedArgs(["--project", "guildsandempires-ca543"], NO_EMULATOR);
    expect(r).toEqual({ ok: true, plan: { project: "guildsandempires-ca543", apply: false, target: "production" } });
  });

  it("10. Projet de production, --apply --confirm-production → écriture autorisée", () => {
    const r = parseSeedArgs(["--project", "guildsandempires-ca543", "--apply", "--confirm-production"], NO_EMULATOR);
    expect(r).toEqual({ ok: true, plan: { project: "guildsandempires-ca543", apply: true, target: "production" } });
  });

  it("11. Projet demo-* : refus hors émulateur, autorisé sur émulateur", () => {
    expect(parseSeedArgs(["--project", "demo-guilds-empires", "--apply"], NO_EMULATOR).ok).toBe(false);
    expect(parseSeedArgs(["--project", "demo-guilds-empires", "--apply"], EMULATOR)).toEqual({
      ok: true, plan: { project: "demo-guilds-empires", apply: true, target: "emulator" },
    });
  });

  it("12. GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT contredisant --project → refus", () => {
    const argv = ["--project", "demo-guilds-empires", "--apply"];
    expect(parseSeedArgs(argv, { ...EMULATOR, GCLOUD_PROJECT: "guildsandempires-ca543" }).ok).toBe(false);
    expect(parseSeedArgs(argv, { ...EMULATOR, GOOGLE_CLOUD_PROJECT: "guildsandempires-ca543" }).ok).toBe(false);
    expect(parseSeedArgs(argv, { ...EMULATOR, GCLOUD_PROJECT: "demo-guilds-empires" }).ok).toBe(true);
  });
});
