import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import {
  upgradeInventoryCapHandler,
} from "../inventory/upgradeInventoryCap";
import type { UpgradeInventoryCapRequest } from "../inventory/upgradeInventoryCap";
import { clearTestData, db, createTestPlayer } from "./helpers";

// ── Helpers locaux ────────────────────────────────────────────────────────────

async function clearGlobalTestData(): Promise<void> {
  const upgradeSnap = await db.collectionGroup("inventoryUpgrades").get();
  if (upgradeSnap.docs.length > 0) {
    const batch = db.batch();
    upgradeSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function makeUpgradeRequest(
  uid: string,
  resourceType: unknown,
  upgradeIndex: unknown,
  idempotencyKey: unknown
): UpgradeInventoryCapRequest {
  return {
    data: {
      resourceType:   resourceType   as "logs" | "planks" | "reconstructionKits",
      upgradeIndex:   upgradeIndex   as 0 | 1,
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

describe("upgradeInventoryCap", () => {

  // ── A. Happy paths ───────────────────────────────────────────────────────

  it("1. Upgrade Logs palier 0 → cap 50→75, -40g, upgradesApplied 0→1", async () => {
    const uid = "UPG_happy_logs_0";
    await createTestPlayer(uid, { gold: 100 });

    const result = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-logs-0")
    );

    expect(result.newCap).toBe(75);
    expect(result.goldSpent).toBe(40);
    expect(result.newGold).toBe(60);
    expect(result.newUpgradesApplied).toBe(1);
    expect(result.alreadyUpgraded).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(60);
    expect(player.inventory.logs.cap).toBe(75);
    expect(player.inventory.logs.upgradesApplied).toBe(1);
    expect(player.inventory.planks.cap).toBe(30);                  // inchangé
    expect(player.inventory.reconstructionKits.cap).toBe(10);      // inchangé
  });

  it("2. Upgrade Logs palier 1 après palier 0 → cap 75→100, -80g, upgradesApplied 1→2", async () => {
    const uid = "UPG_happy_logs_1";
    await createTestPlayer(uid, { gold: 200 });

    await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-logs-0-pre")
    );

    const result = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 1, "key-logs-1")
    );

    expect(result.newCap).toBe(100);
    expect(result.goldSpent).toBe(80);
    expect(result.newGold).toBe(80);      // 200 - 40 - 80
    expect(result.newUpgradesApplied).toBe(2);
    expect(result.alreadyUpgraded).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(80);
    expect(player.inventory.logs.cap).toBe(100);
    expect(player.inventory.logs.upgradesApplied).toBe(2);
  });

  it("3. Upgrade Planks palier 0 → cap 30→45, -60g", async () => {
    const uid = "UPG_happy_planks_0";
    await createTestPlayer(uid, { gold: 100 });

    const result = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "planks", 0, "key-planks-0")
    );

    expect(result.newCap).toBe(45);
    expect(result.goldSpent).toBe(60);
    expect(result.newGold).toBe(40);
    expect(result.newUpgradesApplied).toBe(1);
    expect(result.alreadyUpgraded).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(40);
    expect(player.inventory.planks.cap).toBe(45);
    expect(player.inventory.planks.upgradesApplied).toBe(1);
  });

  it("4. Upgrade reconstructionKits palier 0 → cap 10→15, -100g", async () => {
    const uid = "UPG_happy_kits_0";
    await createTestPlayer(uid, { gold: 150 });

    const result = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "reconstructionKits", 0, "key-kits-0")
    );

    expect(result.newCap).toBe(15);
    expect(result.goldSpent).toBe(100);
    expect(result.newGold).toBe(50);
    expect(result.newUpgradesApplied).toBe(1);
    expect(result.alreadyUpgraded).toBe(false);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(50);
    expect(player.inventory.reconstructionKits.cap).toBe(15);
    expect(player.inventory.reconstructionKits.upgradesApplied).toBe(1);
  });

  it("5. Doc inventoryUpgrades correctement créé avec tous les champs", async () => {
    const uid = "UPG_happy_doc";
    await createTestPlayer(uid, { gold: 100 });

    await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-doc-check")
    );

    const upgradeSnap = await db
      .collection("players").doc(uid)
      .collection("inventoryUpgrades").doc("key-doc-check")
      .get();
    expect(upgradeSnap.exists).toBe(true);
    const upgrade = upgradeSnap.data()!;
    expect(upgrade.uid).toBe(uid);
    expect(upgrade.resourceType).toBe("logs");
    expect(upgrade.upgradeIndex).toBe(0);
    expect(upgrade.goldSpent).toBe(40);
    expect(upgrade.capIncrease).toBe(25);
    expect(upgrade.createdAt).not.toBeNull();
  });

  // ── B. Idempotency technique (replay) ────────────────────────────────────

  it("6. Replay même key + même payload → alreadyUpgraded=true, gold inchangé entre call 1 et call 2", async () => {
    const uid = "UPG_idem_match";
    await createTestPlayer(uid, { gold: 100 });

    const call1 = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-idem-1")
    );
    expect(call1.alreadyUpgraded).toBe(false);
    expect(call1.goldSpent).toBe(40);

    const goldAfterCall1 = (await db.collection("players").doc(uid).get()).data()!.gold;

    const call2 = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-idem-1")
    );
    expect(call2.alreadyUpgraded).toBe(true);
    expect(call2.goldSpent).toBe(40);
    expect(call2.newGold).toBe(goldAfterCall1);

    // État Firestore inchangé depuis call1
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(goldAfterCall1);
    expect(playerSnap.data()!.inventory.logs.cap).toBe(75);            // une fois
    expect(playerSnap.data()!.inventory.logs.upgradesApplied).toBe(1); // une fois
  });

  it("7. Replay même key + resourceType différent → failed-precondition", async () => {
    const uid = "UPG_idem_type_diff";
    await createTestPlayer(uid, { gold: 200 });

    await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-diff-type")
    );

    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest(uid, "planks", 0, "key-diff-type")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "idempotency key already used with different payload",
    } satisfies Partial<HttpsError>);
  });

  it("8. Replay même key + upgradeIndex différent → failed-precondition", async () => {
    const uid = "UPG_idem_idx_diff";
    await createTestPlayer(uid, { gold: 200 });

    await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-diff-idx")
    );

    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest(uid, "logs", 1, "key-diff-idx")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "idempotency key already used with different payload",
    } satisfies Partial<HttpsError>);
  });

  // ── C. Idempotency métier (double achat cross-device) ────────────────────

  it("9. UUID neuf + upgradeIndex=0 alors que upgradesApplied=1 → failed-precondition 'upgrade tier already applied'", async () => {
    const uid = "UPG_business_already";
    await createTestPlayer(uid, { gold: 200 });

    await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-first-buy")
    );

    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest(uid, "logs", 0, "key-new-attempt")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "upgrade tier already applied",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(160);                         // 200 - 40, un seul débit
    expect(playerSnap.data()!.inventory.logs.upgradesApplied).toBe(1); // inchangé
  });

  it("10. UUID neuf + upgradeIndex=1 alors que upgradesApplied=0 → failed-precondition 'previous upgrade tier required'", async () => {
    const uid = "UPG_business_prereq";
    await createTestPlayer(uid, { gold: 200 });

    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest(uid, "logs", 1, "key-prereq")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "previous upgrade tier required",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(200);              // aucune mutation
    expect(playerSnap.data()!.inventory.logs.cap).toBe(50); // inchangé
  });

  // ── D. Validation entrée ─────────────────────────────────────────────────

  it("11. resourceType invalide → invalid-argument", async () => {
    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest("UPG_val_type", "iron_ore", 0, "key-1")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("12. upgradeIndex = 2 → invalid-argument", async () => {
    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest("UPG_val_idx2", "logs", 2, "key-1")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("13. upgradeIndex non-entier → invalid-argument", async () => {
    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest("UPG_val_float", "logs", 0.5, "key-1")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("14. reconstructionKits + upgradeIndex=1 → invalid-argument 'upgrade tier not available for this resource'", async () => {
    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest("UPG_val_kits1", "reconstructionKits", 1, "key-1")
      )
    ).rejects.toMatchObject({
      code:    "invalid-argument",
      message: "upgrade tier not available for this resource",
    } satisfies Partial<HttpsError>);
  });

  it("15. idempotencyKey vide → invalid-argument", async () => {
    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest("UPG_val_key", "logs", 0, "")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  // ── E. État Firestore ────────────────────────────────────────────────────

  it("16. Player inexistant → not-found", async () => {
    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest("UPG_state_noplayer", "logs", 0, "key-1")
      )
    ).rejects.toMatchObject({
      code:    "not-found",
      message: "player document missing",
    } satisfies Partial<HttpsError>);
  });

  it("17. Gold insuffisant (gold < cost) → failed-precondition 'insufficient gold'", async () => {
    const uid = "UPG_state_nogold";
    await createTestPlayer(uid, { gold: 39 });   // cost logs tier 0 = 40g

    await expect(
      upgradeInventoryCapHandler(
        makeUpgradeRequest(uid, "logs", 0, "key-1")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient gold",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(39);              // aucune mutation
    expect(playerSnap.data()!.inventory.logs.cap).toBe(50);
  });

  it("18. upgradesApplied absent du champ → traité comme 0, upgrade palier 0 passe normalement", async () => {
    const uid = "UPG_state_noapplied";
    // createTestPlayer crée ResourceStack sans upgradesApplied — champ optionnel
    await createTestPlayer(uid, { gold: 100 });

    const result = await upgradeInventoryCapHandler(
      makeUpgradeRequest(uid, "logs", 0, "key-noapplied")
    );

    expect(result.newCap).toBe(75);
    expect(result.newUpgradesApplied).toBe(1);
    expect(result.alreadyUpgraded).toBe(false);
  });

  // ── F. Concurrence (Promise.allSettled, pattern ÉTAPE 10+) ──────────────

  it("19. Deux appels concurrents même idempotencyKey + même payload → 1 commit, 1 idempotent, gold décrémenté UNE fois", async () => {
    const uid = "UPG_concur_same";
    await createTestPlayer(uid, { gold: 100 });

    const results = await Promise.allSettled([
      upgradeInventoryCapHandler(makeUpgradeRequest(uid, "logs", 0, "key-concur-same")),
      upgradeInventoryCapHandler(makeUpgradeRequest(uid, "logs", 0, "key-concur-same")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBe(2);

    const values = successes.map(
      (r) => (r as PromiseFulfilledResult<{ alreadyUpgraded: boolean }>).value
    );
    const normal     = values.filter((v) => !v.alreadyUpgraded);
    const idempotent = values.filter((v) =>  v.alreadyUpgraded);
    expect(normal.length).toBe(1);
    expect(idempotent.length).toBe(1);

    // Assertions critiques : gold décrémenté UNE SEULE FOIS, 1 seul doc inventoryUpgrades
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(60);                          // 100 - 40, une fois
    expect(playerSnap.data()!.inventory.logs.cap).toBe(75);            // upgradé une fois
    expect(playerSnap.data()!.inventory.logs.upgradesApplied).toBe(1); // une fois

    const upgradeSnap = await db
      .collection("players").doc(uid)
      .collection("inventoryUpgrades")
      .get();
    expect(upgradeSnap.docs.length).toBe(1);
  }, 30_000);

  it("20. Deux appels concurrents keys distincts + upgradeIndex=0 → 1 commit + 1 failed-precondition, gold décrémenté UNE fois", async () => {
    const uid = "UPG_concur_diff";
    await createTestPlayer(uid, { gold: 100 });

    const results = await Promise.allSettled([
      upgradeInventoryCapHandler(makeUpgradeRequest(uid, "logs", 0, "key-concur-A")),
      upgradeInventoryCapHandler(makeUpgradeRequest(uid, "logs", 0, "key-concur-B")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures  = results.filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason as HttpsError;
    expect(failedReason.code).toBe("failed-precondition");
    expect(failedReason.message).toBe("upgrade tier already applied");

    // Assertions critiques : gold décrémenté UNE SEULE FOIS, upgradesApplied = 1
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(60);                          // 100 - 40, une fois
    expect(playerSnap.data()!.inventory.logs.cap).toBe(75);            // upgradé une fois
    expect(playerSnap.data()!.inventory.logs.upgradesApplied).toBe(1); // une fois

    const upgradeSnap = await db
      .collection("players").doc(uid)
      .collection("inventoryUpgrades")
      .get();
    expect(upgradeSnap.docs.length).toBe(1);
  }, 30_000);

});
