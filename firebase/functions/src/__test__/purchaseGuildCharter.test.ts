import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import {
  purchaseGuildCharterHandler,
} from "../guildCharter/purchaseGuildCharter";
import type { PurchaseGuildCharterRequest } from "../guildCharter/purchaseGuildCharter";
import { FAVOR_THRESHOLDS } from "../shared/favorRank";
import {
  GUILD_CHARTER_COST,
  GUILD_CHARTER_FAVOR_THRESHOLD,
} from "../shared/guildCharter";
import { clearTestData, db, createTestPlayer } from "./helpers";

// ── Helpers locaux ────────────────────────────────────────────────────────────

async function clearGlobalTestData(): Promise<void> {
  const snap = await db.collectionGroup("guildPurchases").get();
  if (snap.docs.length > 0) {
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function makeCharterRequest(
  uid: string,
  idempotencyKey: unknown
): PurchaseGuildCharterRequest {
  return {
    data: {
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([clearTestData(), clearGlobalTestData()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("purchaseGuildCharter", () => {

  // ── A. Happy paths ───────────────────────────────────────────────────────

  it("1. Achat normal : favor=350, gold=500 → success, gold=0, guildCharterUnlocked=true", async () => {
    const uid = "GC_happy_normal";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    const result = await purchaseGuildCharterHandler(
      makeCharterRequest(uid, "key-normal-1")
    );

    expect(result.goldSpent).toBe(GUILD_CHARTER_COST);
    expect(result.newGold).toBe(0);
    expect(result.guildCharterPurchasedAt).not.toBeNull();
    expect(result.alreadyPurchased).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(0);
    expect(player.guildCharterUnlocked).toBe(true);
    expect(player.guildCharterPurchasedAt).not.toBeNull();

    const purchaseSnap = await db
      .collection("players").doc(uid)
      .collection("guildPurchases").doc("key-normal-1")
      .get();
    expect(purchaseSnap.exists).toBe(true);
  });

  it("2. Achat avec excédent : favor=400, gold=600 → success, gold=100, favorAtPurchase=400 (snapshot exact)", async () => {
    const uid = "GC_happy_excess";
    await createTestPlayer(uid, {
      gold: 600,
      imperialFavor: 400,
      favorRank: "guild_charter_eligible",
    });

    const result = await purchaseGuildCharterHandler(
      makeCharterRequest(uid, "key-excess-1")
    );

    expect(result.goldSpent).toBe(GUILD_CHARTER_COST);
    expect(result.newGold).toBe(100);
    expect(result.alreadyPurchased).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(100);

    const purchaseSnap = await db
      .collection("players").doc(uid)
      .collection("guildPurchases").doc("key-excess-1")
      .get();
    // favorAtPurchase = valeur réelle au moment de l'achat, pas le seuil
    expect(purchaseSnap.data()!.favorAtPurchase).toBe(400);
  });

  it("3. Doc guildPurchases contient tous les champs attendus (favorRankAtPurchase = guild_charter_eligible)", async () => {
    const uid = "GC_happy_doc";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    await purchaseGuildCharterHandler(
      makeCharterRequest(uid, "key-doc-check")
    );

    const purchaseSnap = await db
      .collection("players").doc(uid)
      .collection("guildPurchases").doc("key-doc-check")
      .get();
    expect(purchaseSnap.exists).toBe(true);
    const purchase = purchaseSnap.data()!;
    expect(purchase.uid).toBe(uid);
    expect(purchase.goldSpent).toBe(500);
    expect(purchase.favorAtPurchase).toBe(350);
    expect(purchase.favorRankAtPurchase).toBe("guild_charter_eligible");
    expect(purchase.createdAt).not.toBeNull();
  });

  // ── B. Idempotency technique (replay) ────────────────────────────────────

  it("4. Replay même key + même uid → alreadyPurchased=true, gold inchangé entre call 1 et call 2", async () => {
    const uid = "GC_idem_match";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    const call1 = await purchaseGuildCharterHandler(
      makeCharterRequest(uid, "key-idem-replay")
    );
    expect(call1.alreadyPurchased).toBe(false);
    expect(call1.goldSpent).toBe(500);

    const goldAfterCall1 = (await db.collection("players").doc(uid).get()).data()!.gold;

    const call2 = await purchaseGuildCharterHandler(
      makeCharterRequest(uid, "key-idem-replay")
    );
    expect(call2.alreadyPurchased).toBe(true);
    expect(call2.goldSpent).toBe(500);
    expect(call2.newGold).toBe(goldAfterCall1);

    // Firestore inchangé depuis call1
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(goldAfterCall1);
    expect(playerSnap.data()!.guildCharterUnlocked).toBe(true);
  });

  it("5. Doc guildPurchases avec uid stocké différent → failed-precondition 'idempotency key already used by another player'", async () => {
    const uid = "GC_idem_uid_mismatch";
    const foreignUid = "GC_idem_uid_foreign";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    // Plant un doc dans la subcollection de uid avec un uid étranger stocké (défense en profondeur)
    await db
      .collection("players").doc(uid)
      .collection("guildPurchases").doc("key-uid-mismatch")
      .set({
        uid:                 foreignUid,
        goldSpent:           500,
        favorAtPurchase:     350,
        favorRankAtPurchase: "guild_charter_eligible",
        createdAt:           admin.firestore.Timestamp.now(),
      });

    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest(uid, "key-uid-mismatch")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "idempotency key already used by another player",
    } satisfies Partial<HttpsError>);
  });

  // ── C. Idempotency métier (double achat) ─────────────────────────────────

  it("6. UUID neuf + guildCharterUnlocked=true déjà → failed-precondition 'guild charter already purchased'", async () => {
    const uid = "GC_business_already";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
      guildCharterUnlocked: true,
    });

    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest(uid, "key-new-attempt")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "guild charter already purchased",
    } satisfies Partial<HttpsError>);
  });

  // ── D. Validation entrée ─────────────────────────────────────────────────

  it("7. idempotencyKey vide → invalid-argument", async () => {
    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest("GC_val_key", "")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  // ── E. État Firestore et conditions économiques ──────────────────────────

  it("8. Player inexistant → not-found", async () => {
    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest("GC_state_noplayer", "key-1")
      )
    ).rejects.toMatchObject({
      code:    "not-found",
      message: "player document missing",
    } satisfies Partial<HttpsError>);
  });

  it("9. favor=349 (1 sous le seuil), gold=500 → failed-precondition 'insufficient imperial favor'", async () => {
    const uid = "GC_state_lowfavor";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 349,
      favorRank: "imperial_entrepreneur",
    });

    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest(uid, "key-1")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient imperial favor",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(500);                     // aucune mutation
    expect(playerSnap.data()!.guildCharterUnlocked).toBe(false);
  });

  it("10. favor=350, gold=499 (1 sous le coût) → failed-precondition 'insufficient gold'", async () => {
    const uid = "GC_state_lowgold";
    await createTestPlayer(uid, {
      gold: 499,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest(uid, "key-1")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient gold",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(499);
    expect(playerSnap.data()!.guildCharterUnlocked).toBe(false);
  });

  it("11. favor=0, gold=0 → failed-precondition 'insufficient imperial favor' (favor check passe avant gold)", async () => {
    const uid = "GC_state_nothing";
    await createTestPlayer(uid, { gold: 0, imperialFavor: 0 });

    await expect(
      purchaseGuildCharterHandler(
        makeCharterRequest(uid, "key-1")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient imperial favor",
    } satisfies Partial<HttpsError>);
  });

  // ── F. Concurrence (Promise.allSettled, pattern ÉTAPES 10-12) ───────────

  it("12. Deux appels concurrents même idempotencyKey + même uid → 1 commit, 1 idempotent, gold décrémenté UNE fois", async () => {
    const uid = "GC_concur_same";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    const results = await Promise.allSettled([
      purchaseGuildCharterHandler(makeCharterRequest(uid, "key-concur-same")),
      purchaseGuildCharterHandler(makeCharterRequest(uid, "key-concur-same")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBe(2);

    const values = successes.map(
      (r) => (r as PromiseFulfilledResult<{ alreadyPurchased: boolean }>).value
    );
    const normal     = values.filter((v) => !v.alreadyPurchased);
    const idempotent = values.filter((v) =>  v.alreadyPurchased);
    expect(normal.length).toBe(1);
    expect(idempotent.length).toBe(1);

    // Assertions critiques : gold décrémenté UNE SEULE FOIS, 1 seul doc guildPurchases
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);                          // 500 - 500, une fois
    expect(playerSnap.data()!.guildCharterUnlocked).toBe(true);

    const purchaseSnap = await db
      .collection("players").doc(uid)
      .collection("guildPurchases")
      .get();
    expect(purchaseSnap.docs.length).toBe(1);
  }, 30_000);

  it("13. Deux appels concurrents keys distinctes même uid → 1 commit + 1 failed-precondition 'guild charter already purchased', gold décrémenté UNE fois", async () => {
    const uid = "GC_concur_diff";
    await createTestPlayer(uid, {
      gold: 500,
      imperialFavor: 350,
      favorRank: "guild_charter_eligible",
    });

    const results = await Promise.allSettled([
      purchaseGuildCharterHandler(makeCharterRequest(uid, "key-concur-A")),
      purchaseGuildCharterHandler(makeCharterRequest(uid, "key-concur-B")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures  = results.filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason as HttpsError;
    expect(failedReason.code).toBe("failed-precondition");
    expect(failedReason.message).toBe("guild charter already purchased");

    // Assertions critiques : gold décrémenté UNE SEULE FOIS, 1 seul doc guildPurchases
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
    expect(playerSnap.data()!.guildCharterUnlocked).toBe(true);

    const purchaseSnap = await db
      .collection("players").doc(uid)
      .collection("guildPurchases")
      .get();
    expect(purchaseSnap.docs.length).toBe(1);
  }, 30_000);

  // ── G. Régression FAVOR_THRESHOLDS factorisé ─────────────────────────────

  it("14. GUILD_CHARTER_FAVOR_THRESHOLD === FAVOR_THRESHOLDS.guild_charter_eligible === 350", () => {
    expect(FAVOR_THRESHOLDS.guild_charter_eligible).toBe(350);
    expect(GUILD_CHARTER_FAVOR_THRESHOLD).toBe(FAVOR_THRESHOLDS.guild_charter_eligible);
    expect(GUILD_CHARTER_FAVOR_THRESHOLD).toBe(350);
  });

});
