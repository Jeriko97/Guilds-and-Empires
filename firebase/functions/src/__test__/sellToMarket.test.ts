import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import {
  sellToMarketHandler,
  MAX_MARKET_SELL_QUANTITY,
  MARKET_SALES_RATE_LIMIT,
} from "../market/sellToMarket";
import type { SellToMarketRequest, MarketResourceType } from "../market/sellToMarket";
import { clearTestData, db, createTestPlayer } from "./helpers";
import type { MarketStateDocument, InventoryState } from "../shared/types";

// ── Helpers locaux ────────────────────────────────────────────────────────────

async function clearGlobalTestData(): Promise<void> {
  const [marketStateSnap, tradeSnap] = await Promise.all([
    db.collection("marketState").get(),
    db.collectionGroup("marketTrades").get(),
  ]);
  const batch = db.batch();
  marketStateSnap.docs.forEach((doc) => batch.delete(doc.ref));
  tradeSnap.docs.forEach((doc) => batch.delete(doc.ref));
  if (marketStateSnap.docs.length + tradeSnap.docs.length > 0) await batch.commit();
}

async function createMarketState(
  overrides: Partial<MarketStateDocument> = {}
): Promise<void> {
  const base: MarketStateDocument = {
    schemaVersion: 1,
    lastUpdatedAt: admin.firestore.Timestamp.now(),
    prices: {
      logs:               { currentPrice: 10, basePrice: 10, trend: "stable" },
      planks:             { currentPrice: 25, basePrice: 25, trend: "stable" },
      reconstructionKits: { currentPrice: 50, basePrice: 50, trend: "stable" },
    },
    priceHistory: {
      logs:               [],
      planks:             [],
      reconstructionKits: [],
    },
    ...overrides,
  };
  await db.collection("marketState").doc("state").set(base);
}

const BASE_INVENTORY: InventoryState = {
  logs:               { quantity: 0, cap: 200 },
  planks:             { quantity: 0, cap: 200 },
  reconstructionKits: { quantity: 0, cap: 200 },
};

function makeSellRequest(
  uid: string,
  resourceType: unknown,
  quantity: unknown,
  idempotencyKey: unknown
): SellToMarketRequest {
  return {
    data: {
      resourceType: resourceType as MarketResourceType,
      quantity:     quantity     as number,
      idempotencyKey: idempotencyKey as string,
    },
    auth: {
      uid,
      rawToken: "",
      token: {
        uid,
        name:           "Test Player",
        email:          `${uid}@test.com`,
        email_verified: false,
        firebase:       { identities: {}, sign_in_provider: "custom" },
        iss: "", aud: "", sub: uid, iat: 0, exp: 0, auth_time: 0,
      },
    },
    rawRequest:       {} as never,
    acceptsStreaming: false,
  };
}

function makeUnauthSellRequest(): SellToMarketRequest {
  return {
    data:             { resourceType: "logs", quantity: 10, idempotencyKey: "key-1" },
    auth:             undefined,
    rawRequest:       {} as never,
    acceptsStreaming: false,
  } as unknown as SellToMarketRequest;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([clearTestData(), clearGlobalTestData()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sellToMarket", () => {

  // ── A. Happy paths ───────────────────────────────────────────────────────

  it("1. Vente standard logs → inventory décrémenté, gold crédité, trade doc créé, marketSalesLastHour mis à jour", async () => {
    const uid = "SELLM_happy_logs";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 50, cap: 200 } },
    });
    await createMarketState();

    const result = await sellToMarketHandler(
      makeSellRequest(uid, "logs", 5, "key-logs-1")
    );

    expect(result.goldEarned).toBe(50);    // 10 * 5
    expect(result.priceApplied).toBe(10);
    expect(result.newGold).toBe(50);
    expect(result.alreadySold).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(50);
    expect(player.inventory.logs.quantity).toBe(45);          // 50 - 5
    expect(player.inventory.planks.quantity).toBe(0);         // inchangé
    expect(player.inventory.reconstructionKits.quantity).toBe(0); // inchangé
    expect(player.marketSalesLastHour).toHaveLength(1);

    const tradeSnap = await db
      .collection("players").doc(uid)
      .collection("marketTrades").doc("key-logs-1")
      .get();
    expect(tradeSnap.exists).toBe(true);
    const trade = tradeSnap.data()!;
    expect(trade.uid).toBe(uid);
    expect(trade.resourceType).toBe("logs");
    expect(trade.quantity).toBe(5);
    expect(trade.priceApplied).toBe(10);
    expect(trade.goldEarned).toBe(50);
    expect(trade.createdAt).not.toBeNull();
  });

  it("2. Vente planks → inventory décrémenté, gold crédité au tarif planks", async () => {
    const uid = "SELLM_happy_planks";
    await createTestPlayer(uid, {
      gold:      100,
      inventory: { ...BASE_INVENTORY, planks: { quantity: 20, cap: 200 } },
    });
    await createMarketState();

    const result = await sellToMarketHandler(
      makeSellRequest(uid, "planks", 4, "key-planks-1")
    );

    expect(result.goldEarned).toBe(100);   // 25 * 4
    expect(result.priceApplied).toBe(25);
    expect(result.newGold).toBe(200);
    expect(result.alreadySold).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(200);
    expect(player.inventory.planks.quantity).toBe(16);     // 20 - 4
    expect(player.inventory.logs.quantity).toBe(0);        // inchangé
  });

  it("3. Vente reconstructionKits → inventory décrémenté, gold crédité au tarif kits", async () => {
    const uid = "SELLM_happy_kits";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, reconstructionKits: { quantity: 10, cap: 200 } },
    });
    await createMarketState();

    const result = await sellToMarketHandler(
      makeSellRequest(uid, "reconstructionKits", 3, "key-kits-1")
    );

    expect(result.goldEarned).toBe(150);  // 50 * 3
    expect(result.priceApplied).toBe(50);
    expect(result.newGold).toBe(150);
    expect(result.alreadySold).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(7); // 10 - 3
  });

  it("4. Vente avec quantity = MAX_MARKET_SELL_QUANTITY → passe sans erreur", async () => {
    const uid = "SELLM_happy_maxqty";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: MAX_MARKET_SELL_QUANTITY, cap: 200 } },
    });
    await createMarketState();

    const result = await sellToMarketHandler(
      makeSellRequest(uid, "logs", MAX_MARKET_SELL_QUANTITY, "key-maxqty-1")
    );

    expect(result.alreadySold).toBe(false);
    expect(result.goldEarned).toBe(10 * MAX_MARKET_SELL_QUANTITY);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(0);
  });

  // ── B. Idempotency ───────────────────────────────────────────────────────

  it("5. Replay même key + même payload → alreadySold=true, gold inchangé entre call 1 et call 2", async () => {
    const uid = "SELLM_idem_match";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 50, cap: 200 } },
    });
    await createMarketState();

    const call1 = await sellToMarketHandler(
      makeSellRequest(uid, "logs", 5, "key-idem-1")
    );
    expect(call1.alreadySold).toBe(false);
    expect(call1.goldEarned).toBe(50);

    const goldAfterCall1 = (await db.collection("players").doc(uid).get()).data()!.gold;

    const call2 = await sellToMarketHandler(
      makeSellRequest(uid, "logs", 5, "key-idem-1")
    );
    expect(call2.alreadySold).toBe(true);
    expect(call2.goldEarned).toBe(50);
    expect(call2.priceApplied).toBe(10);
    expect(call2.newGold).toBe(goldAfterCall1); // gold inchangé

    // État Firestore inchangé depuis call1
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(goldAfterCall1);
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(45); // décrémenté une fois
  });

  it("6. Replay même key + quantity différente → failed-precondition", async () => {
    const uid = "SELLM_idem_qty_diff";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 50, cap: 200 } },
    });
    await createMarketState();

    await sellToMarketHandler(makeSellRequest(uid, "logs", 5, "key-diff-qty"));

    await expect(
      sellToMarketHandler(makeSellRequest(uid, "logs", 10, "key-diff-qty"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "idempotency key already used with different payload",
    } satisfies Partial<HttpsError>);
  });

  it("7. Replay même key + resourceType différent → failed-precondition", async () => {
    const uid = "SELLM_idem_type_diff";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: {
        logs:               { quantity: 50, cap: 200 },
        planks:             { quantity: 50, cap: 200 },
        reconstructionKits: { quantity: 0,  cap: 200 },
      },
    });
    await createMarketState();

    await sellToMarketHandler(makeSellRequest(uid, "logs", 5, "key-diff-type"));

    await expect(
      sellToMarketHandler(makeSellRequest(uid, "planks", 5, "key-diff-type"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "idempotency key already used with different payload",
    } satisfies Partial<HttpsError>);
  });

  // ── C. Validation entrée ─────────────────────────────────────────────────

  it("8. resourceType invalide → invalid-argument", async () => {
    await expect(
      sellToMarketHandler(makeSellRequest("SELLM_val_type", "iron_ore", 5, "key-1"))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("9. quantity non-entier (0.5) → invalid-argument", async () => {
    await expect(
      sellToMarketHandler(makeSellRequest("SELLM_val_float", "logs", 0.5, "key-1"))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("10. quantity = 0 → invalid-argument", async () => {
    await expect(
      sellToMarketHandler(makeSellRequest("SELLM_val_zero", "logs", 0, "key-1"))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("11. quantity négative → invalid-argument", async () => {
    await expect(
      sellToMarketHandler(makeSellRequest("SELLM_val_neg", "logs", -1, "key-1"))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("12. quantity > MAX_MARKET_SELL_QUANTITY → invalid-argument", async () => {
    await expect(
      sellToMarketHandler(
        makeSellRequest("SELLM_val_overmax", "logs", MAX_MARKET_SELL_QUANTITY + 1, "key-1")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("13. idempotencyKey vide → invalid-argument", async () => {
    await expect(
      sellToMarketHandler(makeSellRequest("SELLM_val_key", "logs", 5, ""))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  // ── D. État Firestore ────────────────────────────────────────────────────

  it("14. Player inexistant → not-found", async () => {
    await createMarketState();

    await expect(
      sellToMarketHandler(makeSellRequest("SELLM_state_noplayer", "logs", 5, "key-1"))
    ).rejects.toMatchObject({
      code:    "not-found",
      message: "player document missing",
    } satisfies Partial<HttpsError>);
  });

  it("15. marketState inexistant → failed-precondition", async () => {
    const uid = "SELLM_state_nomarket";
    await createTestPlayer(uid, {
      inventory: { ...BASE_INVENTORY, logs: { quantity: 50, cap: 200 } },
    });
    // marketState intentionnellement absent

    await expect(
      sellToMarketHandler(makeSellRequest(uid, "logs", 5, "key-1"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "market state not initialized",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(50);
  });

  it("16. Inventory insuffisant (quantity > stock) → failed-precondition", async () => {
    const uid = "SELLM_state_noinventory";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 3, cap: 200 } },
    });
    await createMarketState();

    await expect(
      sellToMarketHandler(makeSellRequest(uid, "logs", 5, "key-1"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient inventory",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(3);
  });

  // ── E. Rate limit ────────────────────────────────────────────────────────

  it("17. 20 ventes récentes en <1h, 21e échoue → resource-exhausted", async () => {
    const uid = "SELLM_rl_20recent";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 200, cap: 200 } },
    });
    await createMarketState();

    const nowMs = Date.now();
    const recentTimestamps = Array.from({ length: MARKET_SALES_RATE_LIMIT }, (_, i) =>
      admin.firestore.Timestamp.fromMillis(nowMs - (i + 1) * 60_000) // 1-20 minutes ago
    );
    await db.collection("players").doc(uid).update({
      marketSalesLastHour: recentTimestamps,
    });

    await expect(
      sellToMarketHandler(makeSellRequest(uid, "logs", 1, "key-rl-21"))
    ).rejects.toMatchObject({
      code:    "resource-exhausted",
      message: "market sales rate limit exceeded",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(200);
  });

  it("18. 20 ventes anciennes (>1h) prunées, nouvelle vente passe → marketSalesLastHour.length == 1", async () => {
    const uid = "SELLM_rl_20old";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 50, cap: 200 } },
    });
    await createMarketState();

    const twoHoursAgoMs = Date.now() - 2 * 60 * 60 * 1000;
    const oldTimestamps = Array.from({ length: MARKET_SALES_RATE_LIMIT }, () =>
      admin.firestore.Timestamp.fromMillis(twoHoursAgoMs)
    );
    await db.collection("players").doc(uid).update({
      marketSalesLastHour: oldTimestamps,
    });

    const result = await sellToMarketHandler(
      makeSellRequest(uid, "logs", 1, "key-rl-old-1")
    );

    expect(result.alreadySold).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.marketSalesLastHour).toHaveLength(1); // old prunés, seul le nouveau reste
    expect(playerSnap.data()!.gold).toBe(10);
  });

  it("19. Mix 10 ventes anciennes + 15 récentes : 5 nouvelles passent, 6e échoue → resource-exhausted", async () => {
    const uid = "SELLM_rl_mix";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 200, cap: 200 } },
    });
    await createMarketState();

    const nowMs         = Date.now();
    const twoHoursAgoMs = nowMs - 2 * 60 * 60 * 1000;
    const thirtyMinAgoMs = nowMs - 30 * 60 * 1000;

    const oldTimestamps    = Array.from({ length: 10 }, () =>
      admin.firestore.Timestamp.fromMillis(twoHoursAgoMs)
    );
    const recentTimestamps = Array.from({ length: 15 }, () =>
      admin.firestore.Timestamp.fromMillis(thirtyMinAgoMs)
    );

    await db.collection("players").doc(uid).update({
      marketSalesLastHour: [...oldTimestamps, ...recentTimestamps],
    });

    // 5 nouvelles ventes → portent le compte de récentes à 16, 17, 18, 19, 20
    for (let i = 0; i < 5; i++) {
      const result = await sellToMarketHandler(
        makeSellRequest(uid, "logs", 1, `key-mix-${i}`)
      );
      expect(result.alreadySold).toBe(false);
    }

    // La 6e dépasse le seuil (20 récentes déjà présentes)
    await expect(
      sellToMarketHandler(makeSellRequest(uid, "logs", 1, "key-mix-5"))
    ).rejects.toMatchObject({
      code:    "resource-exhausted",
      message: "market sales rate limit exceeded",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(195); // 200 - 5
  });

  // ── F. Concurrence (Promise.allSettled, pattern ÉTAPE 10) ───────────────

  it("20. Deux ventes concurrentes même idempotencyKey + même payload → 1 commit normal + 1 idempotent, gold crédité une fois", async () => {
    const uid = "SELLM_concur_same";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 50, cap: 200 } },
    });
    await createMarketState();

    const results = await Promise.allSettled([
      sellToMarketHandler(makeSellRequest(uid, "logs", 10, "key-concur-same")),
      sellToMarketHandler(makeSellRequest(uid, "logs", 10, "key-concur-same")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBe(2); // les deux réussissent

    const values = successes.map(
      (r) => (r as PromiseFulfilledResult<{ alreadySold: boolean; goldEarned: number }>).value
    );
    const normal     = values.filter((v) => !v.alreadySold);
    const idempotent = values.filter((v) => v.alreadySold);
    expect(normal.length).toBe(1);
    expect(idempotent.length).toBe(1);

    // Vérification critique : gold crédité UNE SEULE FOIS, inventory décrémenté UNE SEULE FOIS
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(100);                      // 10 * 10, une fois
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(40);    // 50 - 10, une fois
  }, 30_000);

  it("21. Deux ventes concurrentes idempotencyKeys différents : si stock insuffisant → 1 commit + 1 failed-precondition", async () => {
    const uid = "SELLM_concur_diff";
    await createTestPlayer(uid, {
      gold:      0,
      inventory: { ...BASE_INVENTORY, logs: { quantity: 10, cap: 200 } }, // juste assez pour une vente
    });
    await createMarketState();

    const results = await Promise.allSettled([
      sellToMarketHandler(makeSellRequest(uid, "logs", 10, "key-concur-A")),
      sellToMarketHandler(makeSellRequest(uid, "logs", 10, "key-concur-B")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures  = results.filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason as HttpsError;
    expect(failedReason.code).toBe("failed-precondition");
    expect(failedReason.message).toBe("insufficient inventory");

    // Vérification critique : inventory décrémenté UNE SEULE FOIS, gold crédité UNE SEULE FOIS
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.inventory.logs.quantity).toBe(0);  // 10 - 10, une fois
    expect(playerSnap.data()!.gold).toBe(100);                   // 10 * 10, une fois
  }, 30_000);

});
