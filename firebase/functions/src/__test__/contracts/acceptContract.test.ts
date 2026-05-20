import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import { acceptContractHandler } from "../../contracts/acceptContract";
import type { AcceptContractRequest } from "../../contracts/acceptContract";
import type { ContractPoolDocument, WorldEventDocument } from "../../shared/types";
import { clearTestData, db, createTestPlayer } from "../helpers";

// ── Helpers locaux ────────────────────────────────────────────────────────────

async function clearGlobalTestData(): Promise<void> {
  // collectionGroup("contracts") trouve TOUS les contrats y compris dans les
  // subcollections orphelines dont le doc parent a déjà été supprimé par
  // clearTestData(). L'émulateur ne cascade-delete pas → les orphelins
  // persistent entre runs et contaminent les tests suivants.
  const [contractsSnap, contractPoolSnap, worldEventsSnap] = await Promise.all([
    db.collectionGroup("contracts").get(),
    db.collection("contractPool").get(),
    db.collection("activeWorldEvents").get(),
  ]);
  const batch = db.batch();
  contractsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  contractPoolSnap.docs.forEach((doc) => batch.delete(doc.ref));
  worldEventsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  const total = contractsSnap.docs.length + contractPoolSnap.docs.length + worldEventsSnap.docs.length;
  if (total > 0) await batch.commit();
}

async function createContractTemplate(
  id: string,
  overrides: Partial<ContractPoolDocument> = {}
): Promise<void> {
  const base: ContractPoolDocument = {
    tier:              "standard",
    resourceType:      "reconstruction_kits",
    quantityRequired:  10,
    rewardGold:        50,
    rewardFavor:       100,
    associatedEventId: null,
    isActive:          true,
    validFrom:         admin.firestore.Timestamp.fromMillis(Date.now() - 60_000),
    validUntil:        null,
    ...overrides,
  };
  await db.collection("contractPool").doc(id).set(base);
}

async function createWorldEvent(
  id: string,
  overrides: Partial<WorldEventDocument> = {}
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const base: WorldEventDocument = {
    eventId:          id,
    eventType:        "imperial_reconstruction_initiative",
    status:           "active",
    startedAt:        now,
    endsAt:           admin.firestore.Timestamp.fromMillis(now.toMillis() + 4 * 60 * 60 * 1000),
    decayEndsAt:      null,
    priceMultipliers: { logs: 1.8, planks: 1.83 },
    priorityContractSlots: { total: 5, claimed: 0 },
    triggerCondition: null,
    triggerProcessed: false,
    ...overrides,
  };
  await db.collection("activeWorldEvents").doc(id).set(base);
}

function makeAcceptRequest(uid: string, contractTemplateId: unknown): AcceptContractRequest {
  return {
    data:             { contractTemplateId: contractTemplateId as string },
    auth: {
      uid,
      rawToken: "",
      token: {
        uid,
        name:          "Test Player",
        email:         `${uid}@test.com`,
        email_verified: false,
        firebase:      { identities: {}, sign_in_provider: "custom" },
        iss: "", aud: "", sub: uid, iat: 0, exp: 0, auth_time: 0,
      },
    },
    rawRequest:       {} as never,
    acceptsStreaming: false,
  };
}

function makeUnauthAcceptRequest(): AcceptContractRequest {
  return {
    data:             { contractTemplateId: "template-1" },
    auth:             undefined,
    rawRequest:       {} as never,
    acceptsStreaming: false,
  } as unknown as AcceptContractRequest;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([clearGlobalTestData(), clearTestData()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("acceptContract", () => {

  // ── Happy paths ──────────────────────────────────────────────────────────

  it("1. Standard avec favorRank=local_supplier → doc créé, UUID valide, fields copiés", async () => {
    const uid = "acceptContract-happy";
    await createTestPlayer(uid, { favorRank: "local_supplier" });
    await createContractTemplate("tpl-std-1");

    const result = await acceptContractHandler(makeAcceptRequest(uid, "tpl-std-1"));

    expect(typeof result.playerContractId).toBe("string");
    expect(result.playerContractId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    const snap = await db
      .collection("players").doc(uid)
      .collection("contracts").doc(result.playerContractId)
      .get();
    expect(snap.exists).toBe(true);

    const d = snap.data()!;
    expect(d.contractTemplateId).toBe("tpl-std-1");
    expect(d.tier).toBe("standard");
    expect(d.resourceType).toBe("reconstruction_kits");
    expect(d.quantityRequired).toBe(10);
    expect(d.quantityDelivered).toBe(0);
    expect(d.rewardGold).toBe(50);
    expect(d.rewardFavor).toBe(100);
    expect(d.status).toBe("active");
    expect(d.expiresAt).toBeNull();
    expect(d.completedAt).toBeNull();
    expect(d.idempotencyKey).toBe(result.playerContractId);
  });

  it("2. Reinforced avec favorRank=approved_merchant → doc créé", async () => {
    const uid = "acceptContract-reinforced";
    await createTestPlayer(uid, { favorRank: "approved_merchant" });
    await createContractTemplate("tpl-rnf-1", { tier: "reinforced" });

    const result = await acceptContractHandler(makeAcceptRequest(uid, "tpl-rnf-1"));

    const snap = await db
      .collection("players").doc(uid)
      .collection("contracts").doc(result.playerContractId)
      .get();
    expect(snap.exists).toBe(true);
    expect(snap.data()!.tier).toBe("reinforced");
  });

  it("3. Priority avec event actif et slots disponibles → doc créé, claimed incrémenté de +1", async () => {
    const uid = "acceptContract-priority";
    await createTestPlayer(uid, { favorRank: "approved_merchant" });
    await createWorldEvent("evt-1", { priorityContractSlots: { total: 5, claimed: 2 } });
    await createContractTemplate("tpl-pri-1", {
      tier:              "priority",
      associatedEventId: "evt-1",
      validUntil:        admin.firestore.Timestamp.fromMillis(Date.now() + 4 * 60 * 60 * 1000),
    });

    const result = await acceptContractHandler(makeAcceptRequest(uid, "tpl-pri-1"));

    const snap = await db
      .collection("players").doc(uid)
      .collection("contracts").doc(result.playerContractId)
      .get();
    expect(snap.exists).toBe(true);
    expect(snap.data()!.tier).toBe("priority");

    const evtSnap = await db.collection("activeWorldEvents").doc("evt-1").get();
    expect(evtSnap.data()!.priorityContractSlots.claimed).toBe(3);
  });

  // ── Validations refusées ─────────────────────────────────────────────────

  it("4. Pas authentifié → unauthenticated", async () => {
    await expect(
      acceptContractHandler(makeUnauthAcceptRequest())
    ).rejects.toMatchObject({ code: "unauthenticated" } satisfies Partial<HttpsError>);
  });

  it("5. contractTemplateId vide → invalid-argument", async () => {
    const uid = "acceptContract-no-id";
    await createTestPlayer(uid);

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, ""))
    ).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
  });

  it("6. Template absent → not-found", async () => {
    const uid = "acceptContract-no-template";
    await createTestPlayer(uid);

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "nonexistent-tpl"))
    ).rejects.toMatchObject({ code: "not-found" } satisfies Partial<HttpsError>);
  });

  it("7. Template isActive=false → failed-precondition 'contract template not available'", async () => {
    const uid = "acceptContract-inactive";
    await createTestPlayer(uid);
    await createContractTemplate("tpl-inactive", { isActive: false });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-inactive"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract template not available",
    } satisfies Partial<HttpsError>);
  });

  it("8. Template validFrom dans le futur → failed-precondition 'contract template not available'", async () => {
    const uid = "acceptContract-future";
    await createTestPlayer(uid);
    await createContractTemplate("tpl-future", {
      validFrom: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-future"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract template not available",
    } satisfies Partial<HttpsError>);
  });

  it("9. Template validUntil dans le passé → failed-precondition 'contract template not available'", async () => {
    const uid = "acceptContract-expired-tpl";
    await createTestPlayer(uid);
    await createContractTemplate("tpl-expired", {
      validUntil: admin.firestore.Timestamp.fromMillis(Date.now() - 60_000),
    });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-expired"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract template not available",
    } satisfies Partial<HttpsError>);
  });

  it("10. Player doc inexistant → failed-precondition 'player document not found'", async () => {
    await createContractTemplate("tpl-no-player");

    await expect(
      acceptContractHandler(makeAcceptRequest("acceptContract-no-player", "tpl-no-player"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "player document not found",
    } satisfies Partial<HttpsError>);
  });

  it("11. Player doc sans champ favorRank → failed-precondition 'player favorRank missing'", async () => {
    const uid = "acceptContract-no-favor";
    await db.collection("players").doc(uid).set({
      schemaVersion:          1,
      displayName:            "Test",
      createdAt:              admin.firestore.Timestamp.now(),
      lastLoginAt:            admin.firestore.Timestamp.now(),
      gold:                   0,
      imperialFavor:          0,
      inventory: {
        logs:               { quantity: 0, cap: 50 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
      // favorRank intentionnellement absent
      guildCharterUnlocked:   false,
      guildCharterPurchasedAt: null,
      firstContractCompleted: false,
    });
    await createContractTemplate("tpl-no-favor");

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-no-favor"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "player favorRank missing",
    } satisfies Partial<HttpsError>);
  });

  it("12. Reinforced avec favorRank=local_supplier → permission-denied", async () => {
    const uid = "acceptContract-low-rnf";
    await createTestPlayer(uid, { favorRank: "local_supplier" });
    await createContractTemplate("tpl-rnf-denied", { tier: "reinforced" });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-rnf-denied"))
    ).rejects.toMatchObject({ code: "permission-denied" } satisfies Partial<HttpsError>);
  });

  it("13. Priority avec favorRank=local_supplier → permission-denied", async () => {
    const uid = "acceptContract-low-pri";
    await createTestPlayer(uid, { favorRank: "local_supplier" });
    await createWorldEvent("evt-perm-denied");
    await createContractTemplate("tpl-pri-denied", {
      tier:              "priority",
      associatedEventId: "evt-perm-denied",
      validUntil:        admin.firestore.Timestamp.fromMillis(Date.now() + 4 * 60 * 60 * 1000),
    });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-pri-denied"))
    ).rejects.toMatchObject({ code: "permission-denied" } satisfies Partial<HttpsError>);
  });

  it("14. Contrat déjà actif pour ce template → failed-precondition 'contract already active for this template'", async () => {
    const uid = "acceptContract-dup";
    await createTestPlayer(uid);
    await createContractTemplate("tpl-dup");

    await acceptContractHandler(makeAcceptRequest(uid, "tpl-dup"));

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-dup"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract already active for this template",
    } satisfies Partial<HttpsError>);
  });

  it("15. Priority avec associatedEventId=null → failed-precondition 'priority contract without associated event'", async () => {
    const uid = "acceptContract-no-event-id";
    await createTestPlayer(uid, { favorRank: "approved_merchant" });
    await createContractTemplate("tpl-pri-no-evt", {
      tier:              "priority",
      associatedEventId: null,
      validUntil:        admin.firestore.Timestamp.fromMillis(Date.now() + 4 * 60 * 60 * 1000),
    });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-pri-no-evt"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "priority contract without associated event",
    } satisfies Partial<HttpsError>);
  });

  it("16. Priority avec claimed===total → resource-exhausted 'priority slots exhausted'", async () => {
    const uid = "acceptContract-slots-full";
    await createTestPlayer(uid, { favorRank: "approved_merchant" });
    await createWorldEvent("evt-full", { priorityContractSlots: { total: 5, claimed: 5 } });
    await createContractTemplate("tpl-pri-full", {
      tier:              "priority",
      associatedEventId: "evt-full",
      validUntil:        admin.firestore.Timestamp.fromMillis(Date.now() + 4 * 60 * 60 * 1000),
    });

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-pri-full"))
    ).rejects.toMatchObject({ code: "resource-exhausted" } satisfies Partial<HttpsError>);
  });

  // ── Tests subtils ────────────────────────────────────────────────────────

  it("17. Deux appels concurrents Priority avec 1 slot restant → un succès, un resource-exhausted", async () => {
    const uid1 = "acceptContract-concur-1";
    const uid2 = "acceptContract-concur-2";
    await Promise.all([
      createTestPlayer(uid1, { favorRank: "approved_merchant" }),
      createTestPlayer(uid2, { favorRank: "approved_merchant" }),
    ]);
    await createWorldEvent("evt-concur", { priorityContractSlots: { total: 5, claimed: 4 } });
    await createContractTemplate("tpl-pri-concur", {
      tier:              "priority",
      associatedEventId: "evt-concur",
      validUntil:        admin.firestore.Timestamp.fromMillis(Date.now() + 4 * 60 * 60 * 1000),
    });

    const results = await Promise.allSettled([
      acceptContractHandler(makeAcceptRequest(uid1, "tpl-pri-concur")),
      acceptContractHandler(makeAcceptRequest(uid2, "tpl-pri-concur")),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures  = results.filter((r) => r.status === "rejected");
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason as HttpsError;
    expect(failedReason.code).toBe("resource-exhausted");

    const evtSnap = await db.collection("activeWorldEvents").doc("evt-concur").get();
    expect(evtSnap.data()!.priorityContractSlots.claimed).toBe(5);
  }, 30_000);

  it("18. Accept Standard, re-Accept même template actif → second appel refusé 'already active'", async () => {
    const uid = "acceptContract-reaccept-active";
    await createTestPlayer(uid);
    await createContractTemplate("tpl-reaccept");

    await acceptContractHandler(makeAcceptRequest(uid, "tpl-reaccept"));

    await expect(
      acceptContractHandler(makeAcceptRequest(uid, "tpl-reaccept"))
    ).rejects.toMatchObject({
      code:    "failed-precondition",
      message: "contract already active for this template",
    } satisfies Partial<HttpsError>);
  });

  it("19. Contrat completed → re-Accept du même template autorisé", async () => {
    const uid = "acceptContract-completed-reaccept";
    await createTestPlayer(uid);
    await createContractTemplate("tpl-completed-reaccept");

    const first = await acceptContractHandler(makeAcceptRequest(uid, "tpl-completed-reaccept"));

    await db
      .collection("players").doc(uid)
      .collection("contracts").doc(first.playerContractId)
      .update({ status: "completed" });

    const second = await acceptContractHandler(makeAcceptRequest(uid, "tpl-completed-reaccept"));

    expect(second.playerContractId).toBeTruthy();
    expect(second.playerContractId).not.toBe(first.playerContractId);
  });

});
