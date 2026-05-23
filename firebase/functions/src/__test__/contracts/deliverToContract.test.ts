import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import { deliverToContractHandler } from "../../contracts/deliverToContract";
import type { DeliverToContractRequest } from "../../contracts/deliverToContract";
import type { ContractDocument, PlayerDocument } from "../../shared/types";
import { clearTestData, db, createTestPlayer } from "../helpers";

// ── Helpers locaux ────────────────────────────────────────────────────────────

async function clearGlobalTestData(): Promise<void> {
  const contractsSnap = await db.collectionGroup("contracts").get();
  const batch = db.batch();
  contractsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  if (contractsSnap.docs.length > 0) await batch.commit();
}

async function createPlayerWithKits(
  uid: string,
  kitsQuantity: number,
  overrides: Partial<PlayerDocument> = {}
): Promise<void> {
  await createTestPlayer(uid, {
    inventory: {
      logs:               { quantity: 0, cap: 50 },
      planks:             { quantity: 0, cap: 30 },
      reconstructionKits: { quantity: kitsQuantity, cap: 10 },
    },
    ...overrides,
  });
}

async function createTestContract(
  uid: string,
  contractId: string,
  overrides: Partial<ContractDocument> = {}
): Promise<void> {
  const base: ContractDocument = {
    contractTemplateId: "tpl-default",
    tier:               "standard",
    resourceType:       "reconstruction_kits",
    quantityRequired:   3,
    quantityDelivered:  0,
    rewardGold:         120,
    rewardFavor:        15,
    status:             "active",
    acceptedAt:         admin.firestore.Timestamp.now(),
    expiresAt:          null,
    completedAt:        null,
    idempotencyKey:     "server-generated-initial",
  };
  await db
    .collection("players").doc(uid)
    .collection("contracts").doc(contractId)
    .set({ ...base, ...overrides });
}

function makeDeliverRequest(
  uid: string,
  playerContractId: unknown,
  idempotencyKey: unknown
): DeliverToContractRequest {
  return {
    data: {
      playerContractId: playerContractId as string,
      idempotencyKey:   idempotencyKey as string,
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

function makeUnauthDeliverRequest(): DeliverToContractRequest {
  return {
    data:             { playerContractId: "some-contract", idempotencyKey: "some-key" },
    auth:             undefined,
    rawRequest:       {} as never,
    acceptsStreaming: false,
  } as unknown as DeliverToContractRequest;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([clearGlobalTestData(), clearTestData()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("deliverToContract", () => {

  // ── Happy paths ──────────────────────────────────────────────────────────

  it("1. Livraison Standard avec inventory exact → completed, gold +120, favor +15, firstContractCompleted=true", async () => {
    const uid = "deliverToContract-happy-std";
    await createPlayerWithKits(uid, 3);
    await createTestContract(uid, "contract-std");

    const result = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-std", "key-std-1")
    );

    expect(result.alreadyDelivered).toBe(false);
    expect(result.rewardsGranted).toBe(true);
    expect(result.goldEarned).toBe(120);
    expect(result.favorEarned).toBe(15);
    expect(result.newFavorRank).toBeNull(); // 0+15=15 → local_supplier, pas de changement

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(120);
    expect(player.imperialFavor).toBe(15);
    expect(player.inventory.reconstructionKits.quantity).toBe(0);
    expect(player.favorRank).toBe("local_supplier");
    expect(player.firstContractCompleted).toBe(true);

    const contractSnap = await db.collection("players").doc(uid)
      .collection("contracts").doc("contract-std").get();
    const contract = contractSnap.data()!;
    expect(contract.status).toBe("completed");
    expect(contract.quantityDelivered).toBe(3);
    expect(contract.completedAt).not.toBeNull();
    expect(contract.idempotencyKey).toBe("key-std-1");
  });

  it("2. Livraison Reinforced avec inventory excédentaire → inventory -5, gold +230", async () => {
    const uid = "deliverToContract-reinforced";
    await createPlayerWithKits(uid, 10);
    await createTestContract(uid, "contract-rnf", {
      tier:             "reinforced",
      quantityRequired: 5,
      rewardGold:       230,
      rewardFavor:      35,
    });

    const result = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-rnf", "key-rnf-1")
    );

    expect(result.rewardsGranted).toBe(true);
    expect(result.goldEarned).toBe(230);
    expect(result.favorEarned).toBe(35);

    const playerSnap = await db.collection("players").doc(uid).get();
    const player = playerSnap.data()!;
    expect(player.gold).toBe(230);
    expect(player.inventory.reconstructionKits.quantity).toBe(5); // 10 - 5
    expect(player.inventory.logs.quantity).toBe(0);   // inchangé
    expect(player.inventory.planks.quantity).toBe(0); // inchangé
  });

  it("3. Livraison qui franchit un seuil favorRank (local_supplier → approved_merchant) → newFavorRank renseigné", async () => {
    const uid = "deliverToContract-rank-change";
    await createPlayerWithKits(uid, 3, { imperialFavor: 45, favorRank: "local_supplier" });
    await createTestContract(uid, "contract-rank", {
      rewardFavor: 15, // 45+15=60 → approved_merchant
    });

    const result = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-rank", "key-rank-1")
    );

    expect(result.newFavorRank).toBe("approved_merchant");

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.favorRank).toBe("approved_merchant");
    expect(playerSnap.data()!.imperialFavor).toBe(60);
  });

  it("4. Livraison sans franchir de seuil favorRank → newFavorRank=null dans la réponse", async () => {
    const uid = "deliverToContract-no-rank-change";
    await createPlayerWithKits(uid, 3, { imperialFavor: 0, favorRank: "local_supplier" });
    await createTestContract(uid, "contract-no-rank", {
      rewardFavor: 15, // 0+15=15 → local_supplier, pas de changement
    });

    const result = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-no-rank", "key-norank-1")
    );

    expect(result.newFavorRank).toBeNull();
    expect(result.favorEarned).toBe(15);
  });

  it("5. Livraison alors que firstContractCompleted est déjà true → flag reste true", async () => {
    const uid = "deliverToContract-already-completed-flag";
    await createPlayerWithKits(uid, 3, { firstContractCompleted: true });
    await createTestContract(uid, "contract-2nd");

    const result = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-2nd", "key-2nd-1")
    );

    expect(result.rewardsGranted).toBe(true);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.firstContractCompleted).toBe(true);
  });

  // ── Idempotency tolérante ────────────────────────────────────────────────

  it("6. Retry avec même idempotencyKey → succès idempotent, pas de double décrément", async () => {
    const uid = "deliverToContract-idempotent";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-idem");

    // Première livraison
    const first = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-idem", "key-idem-abc")
    );
    expect(first.alreadyDelivered).toBe(false);
    expect(first.rewardsGranted).toBe(true);

    // Retry avec même clé
    const second = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-idem", "key-idem-abc")
    );
    expect(second.alreadyDelivered).toBe(true);
    expect(second.rewardsGranted).toBe(false);
    expect(second.goldEarned).toBe(0);
    expect(second.favorEarned).toBe(0);
    expect(second.newFavorRank).toBeNull();

    // État Firestore inchangé depuis la première livraison
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(120);          // crédité une seule fois
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(0); // décrémenté une seule fois
  });

  it("7. Triple retry avec même idempotencyKey → 3 succès idempotents cohérents", async () => {
    const uid = "deliverToContract-triple-retry";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-triple");

    // Première livraison
    await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-triple", "key-triple-xyz")
    );

    // Deux retries successifs avec même clé
    const retry1 = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-triple", "key-triple-xyz")
    );
    const retry2 = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-triple", "key-triple-xyz")
    );

    expect(retry1.alreadyDelivered).toBe(true);
    expect(retry2.alreadyDelivered).toBe(true);

    // Vérifier que l'inventaire et le gold n'ont pas bougé depuis la 1ère livraison
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(120);
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(0);
  });

  // ── Validations refusées (zéro écriture si erreur) ───────────────────────

  it("8. Pas authentifié → unauthenticated", async () => {
    await expect(
      deliverToContractHandler(makeUnauthDeliverRequest())
    ).rejects.toMatchObject({ code: "unauthenticated" } satisfies Partial<HttpsError>);
  });

  it("9. playerContractId vide → invalid-argument", async () => {
    const uid = "deliverToContract-empty-cid";
    await createPlayerWithKits(uid, 3);

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "", "some-key"))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("10. idempotencyKey vide → invalid-argument", async () => {
    const uid = "deliverToContract-empty-key";
    await createPlayerWithKits(uid, 3);

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "some-contract", ""))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("11. Player doc inexistant → failed-precondition 'player document not found'", async () => {
    await expect(
      deliverToContractHandler(
        makeDeliverRequest("deliverToContract-no-player", "some-contract", "some-key")
      )
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "player document not found",
    } satisfies Partial<HttpsError>);
  });

  it("12. Player doc sans favorRank → failed-precondition 'player favorRank missing'", async () => {
    const uid = "deliverToContract-no-favor";
    await db.collection("players").doc(uid).set({
      schemaVersion:           1,
      displayName:             "Test",
      createdAt:               admin.firestore.Timestamp.now(),
      lastLoginAt:             admin.firestore.Timestamp.now(),
      gold:                    0,
      imperialFavor:           0,
      inventory: {
        logs:               { quantity: 0, cap: 50 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 5, cap: 10 },
      },
      // favorRank intentionnellement absent
      guildCharterUnlocked:    false,
      guildCharterPurchasedAt: null,
      firstContractCompleted:  false,
    });
    await createTestContract(uid, "contract-no-favor");

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-no-favor", "some-key"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "player favorRank missing",
    } satisfies Partial<HttpsError>);
  });

  it("13. Contract doc inexistant → not-found 'contract not found'", async () => {
    const uid = "deliverToContract-no-contract";
    await createPlayerWithKits(uid, 3, { gold: 0 });

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "nonexistent-contract", "some-key"))
    ).rejects.toMatchObject({
      code:    "not-found",
      message: "contract not found",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
  });

  it("14. Contract completed + idempotencyKey différent → failed-precondition (message exact)", async () => {
    const uid = "deliverToContract-diff-key";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-diff", {
      status:         "completed",
      completedAt:    admin.firestore.Timestamp.now(),
      idempotencyKey: "key-original",
    });

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-diff", "key-different"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract already completed with different idempotency key",
    } satisfies Partial<HttpsError>);

    // Zéro mutation player
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
  });

  it("15. Contract status=expired → failed-precondition 'contract expired'", async () => {
    const uid = "deliverToContract-expired-status";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-expired-status", {
      status: "expired",
    });

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-expired-status", "some-key"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract expired",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
  });

  it("16. Contract active mais expiresAt dans le passé → failed-precondition 'contract expired'", async () => {
    const uid = "deliverToContract-past-expiry";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-past-expiry", {
      status:    "active",
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60_000),
    });

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-past-expiry", "some-key"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract expired",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
  });

  it("17. Inventaire insuffisant (2 Kits en stock, 3 requis) → failed-precondition 'insufficient resources'", async () => {
    const uid = "deliverToContract-insufficient";
    await createPlayerWithKits(uid, 2, { gold: 0 });
    await createTestContract(uid, "contract-insuf", { quantityRequired: 3 });

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-insuf", "some-key"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient resources",
    } satisfies Partial<HttpsError>);

    // Zéro mutation
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(2);
  });

  it("18. Inventaire à 0 → failed-precondition 'insufficient resources'", async () => {
    const uid = "deliverToContract-zero-kits";
    await createPlayerWithKits(uid, 0, { gold: 0 });
    await createTestContract(uid, "contract-zero");

    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-zero", "some-key"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "insufficient resources",
    } satisfies Partial<HttpsError>);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(0);
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(0);
  });

  // ── Tests subtils ────────────────────────────────────────────────────────

  it("19. Livraison concurrente : deux appels simultanés avec idempotencyKeys DIFFÉRENTS → un succès, un failed-precondition, inventory décrémenté une seule fois", async () => {
    const uid = "deliverToContract-concur-diff";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-concur-diff");

    const results = await Promise.allSettled([
      deliverToContractHandler(makeDeliverRequest(uid, "contract-concur-diff", "key-concur-A")),
      deliverToContractHandler(makeDeliverRequest(uid, "contract-concur-diff", "key-concur-B")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures  = results.filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason as HttpsError;
    expect(failedReason.code).toBe("failed-precondition");
    expect(failedReason.message).toBe("contract already completed with different idempotency key");

    // Vérification critique : inventory décrémenté UNE SEULE FOIS, gold crédité UNE SEULE FOIS
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(0); // 3 - 3 = 0
    expect(playerSnap.data()!.gold).toBe(120);
  }, 30_000);

  it("20. Livraison concurrente avec MÊME idempotencyKey → un succès normal + un succès idempotent, inventory pas décrémenté 2 fois", async () => {
    const uid = "deliverToContract-concur-same";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-concur-same");

    const results = await Promise.allSettled([
      deliverToContractHandler(makeDeliverRequest(uid, "contract-concur-same", "key-same-xyz")),
      deliverToContractHandler(makeDeliverRequest(uid, "contract-concur-same", "key-same-xyz")),
    ]);

    // Les deux doivent réussir
    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBe(2);

    const values = successes.map(
      (r) => (r as PromiseFulfilledResult<{ alreadyDelivered: boolean }>).value
    );
    const normal     = values.filter((v) => !v.alreadyDelivered);
    const idempotent = values.filter((v) => v.alreadyDelivered);
    expect(normal.length).toBe(1);
    expect(idempotent.length).toBe(1);

    // État final identique à une livraison simple + 1 retry idempotent
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(0); // décrémenté une fois
    expect(playerSnap.data()!.gold).toBe(120); // crédité une fois
  }, 30_000);

  it("21. Livraison traversant 2 seuils en un coup (favor=49 + reward=200 → imperial_entrepreneur en sautant approved_merchant)", async () => {
    const uid = "deliverToContract-skip-tier";
    await createPlayerWithKits(uid, 3, { imperialFavor: 49, favorRank: "local_supplier" });
    await createTestContract(uid, "contract-skip-tier", {
      rewardFavor: 200, // 49+200=249 → imperial_entrepreneur
    });

    const result = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-skip-tier", "key-skip-1")
    );

    expect(result.newFavorRank).toBe("imperial_entrepreneur");
    expect(result.favorEarned).toBe(200);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.imperialFavor).toBe(249);
    expect(playerSnap.data()!.favorRank).toBe("imperial_entrepreneur");
  });

  it("22. Idempotency tolérante PUIS bug client : livraison réussie avec keyA, retry avec keyB → rejected failed-precondition", async () => {
    const uid = "deliverToContract-key-switch";
    await createPlayerWithKits(uid, 3, { gold: 0 });
    await createTestContract(uid, "contract-key-switch");

    // Livraison normale avec keyA
    const deliveryA = await deliverToContractHandler(
      makeDeliverRequest(uid, "contract-key-switch", "key-A")
    );
    expect(deliveryA.rewardsGranted).toBe(true);

    // Retry avec keyB → doit rejeter (test critique Q5)
    await expect(
      deliverToContractHandler(makeDeliverRequest(uid, "contract-key-switch", "key-B"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract already completed with different idempotency key",
    } satisfies Partial<HttpsError>);

    // État inchangé depuis la livraison A
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()!.gold).toBe(120);
    expect(playerSnap.data()!.inventory.reconstructionKits.quantity).toBe(0);
  });

});
