import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";

import { startProductionSlotHandler } from "../production/startProductionSlot";
import type { StartProductionSlotRequest } from "../production/startProductionSlot";
import { RECIPES, PLANKS_MAX_BATCH_CYCLES, KITS_MAX_BATCH_CYCLES } from "../shared/recipes";
import { MAX_DOCUMENT_ID_BYTES } from "../shared/validators";
import type { BuildingType } from "../shared/types";
import {
  clearTestData,
  db,
  makeRequest,
  makeUnauthRequest,
  createTestPlayer,
  createTestBuilding,
  makeIdleSlot,
  makeActiveSlot,
} from "./helpers";

// ── Constantes de test ────────────────────────────────────────────────────────

// Coût d'input de planks, tiré de RECIPES — pas de magic number en dur.
const PLANKS_INPUT_LOGS = RECIPES["planks"].inputs!["logs"]!; // 2
const KITS_INPUT_PLANKS = RECIPES["reconstruction_kits"].inputs!["planks"]!; // 3

// Identifiants invalides (D-ETAPE19-007) : règle commune de requireValidDocumentId.
const INVALID_BUILDING_IDS: Array<[string, string]> = [
  ["espaces seuls", "  "],
  ["avec slash", "bad/key"],
  ["129 octets ASCII", "a".repeat(MAX_DOCUMENT_ID_BYTES + 1)],
  ["130 octets multioctets (65 × é)", "é".repeat(MAX_DOCUMENT_ID_BYTES / 2 + 1)],
  ["plusieurs Ko avec slash", "x/".repeat(2048)],
  ["nom réservé avec retour à la ligne", "__a\nb__"],
];

// À la limite : acceptés par la validation (le bâtiment n'existe pas → not-found).
const LIMIT_BUILDING_IDS: Array<[string, string]> = [
  ["128 octets ASCII", "b".repeat(MAX_DOCUMENT_ID_BYTES)],
  ["128 octets multioctets (64 × é)", "é".repeat(MAX_DOCUMENT_ID_BYTES / 2)],
];

// ── Helper local ──────────────────────────────────────────────────────────────

/**
 * Construit un StartProductionSlotRequest authentifié avec les données fournies.
 * Toutes les valeurs de data sont unknown pour permettre les tests de validation.
 * idempotencyKey : UUID neuf si absent (une intention par appel, D-ETAPE19-003).
 */
function makeStartRequest(
  uid: string,
  data: { buildingId: unknown; slotIndex: unknown; recipeId: unknown; cycles?: unknown; idempotencyKey?: unknown }
): StartProductionSlotRequest {
  const base = makeRequest(uid);
  return {
    data: { ...data, idempotencyKey: "idempotencyKey" in data ? data.idempotencyKey : randomUUID() },
    auth:            base.auth,
    rawRequest:      base.rawRequest,
    acceptsStreaming: base.acceptsStreaming,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** Traces productionOps : sous-collection non supprimée en cascade par l'émulateur. */
async function clearProductionOps(): Promise<void> {
  const snap = await db.collectionGroup("productionOps").get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/** Neutralise le rate limit (2 s) entre deux appels d'un même test, via Admin SDK. */
async function resetRateLimit(uid: string): Promise<void> {
  await db.collection("rateLimits").doc(`${uid}_startProductionSlot`).delete();
}

beforeEach(async () => {
  await Promise.all([clearTestData(), clearProductionOps()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("startProductionSlot", () => {

  it("Appel non-authentifié : rejet avec code unauthenticated", async () => {
    // requireAuth est la première ligne de défense — aucune logique ne s'exécute sans uid.
    await expect(
      startProductionSlotHandler(makeUnauthRequest() as unknown as StartProductionSlotRequest)
    ).rejects.toMatchObject(
      { code: "unauthenticated" } satisfies Partial<HttpsError>
    );
  });

  it("Rate limit : deuxième appel rapide rejeté avec resource-exhausted", async () => {
    // Deux appels consécutifs dans la fenêtre de 2s — le second est bloqué avant toute logique.
    const uid = "sps-test-2";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

    // Premier appel : passe le rate limit et démarre logs sur slot 0.
    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "logs" }))
    ).resolves.toBeDefined();

    // Deuxième appel immédiat : bloqué par checkRateLimit (< 2s).
    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 1, recipeId: "logs" }))
    ).rejects.toMatchObject(
      { code: "resource-exhausted" } satisfies Partial<HttpsError>
    );
  });

  it("Schema version invalide : rejet avec failed-precondition", async () => {
    // requireSchemaVersion rejette tout document dont la version diffère de CURRENT_SCHEMA_VERSION.
    const uid = "sps-test-3";
    await createTestPlayer(uid, { schemaVersion: 0 });
    await createTestBuilding(uid, [makeIdleSlot(0)]);

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "logs" }))
    ).rejects.toMatchObject(
      { code: "failed-precondition" } satisfies Partial<HttpsError>
    );
  });

  it("buildingId inexistant : rejet avec not-found", async () => {
    // La transaction lit le building — si absent, HttpsError not-found avant toute modification.
    const uid = "sps-test-4";
    await createTestPlayer(uid);
    // Aucun building créé — "inexistant" ne correspond à aucun document.

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "inexistant", slotIndex: 0, recipeId: "logs" }))
    ).rejects.toMatchObject(
      { code: "not-found" } satisfies Partial<HttpsError>
    );
  });

  it.each([
    { label: "négatif",   value: -1    },
    { label: "hors-borne", value: 3    },
    { label: "chaîne",    value: "abc" },
    { label: "flottant",  value: 1.5   },
  ])("slotIndex invalide ($label) : rejet avec invalid-argument", async ({ value }) => {
    // requireValidSlotIndex rejette tout ce qui n'est pas exactement 0, 1 ou 2.
    const uid = "sps-test-5";
    await createTestPlayer(uid);

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: value, recipeId: "logs" }))
    ).rejects.toMatchObject(
      { code: "invalid-argument" } satisfies Partial<HttpsError>
    );
  });

  it("recipeId invalide : rejet avec invalid-argument", async () => {
    // requireValidRecipeId rejette toute valeur absente de l'union RecipeId.
    const uid = "sps-test-6";
    await createTestPlayer(uid);

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "dragons" }))
    ).rejects.toMatchObject(
      { code: "invalid-argument" } satisfies Partial<HttpsError>
    );
  });

  it("Building incompatible avec la recipe : rejet avec failed-precondition", async () => {
    // RECIPES[recipeId].producibleBy ne contient pas le buildingType du building.
    // En Phase 1, un seul buildingType ('sawmill') existe — on simule un type futur
    // via cast contrôlé (test uniquement, ne jamais utiliser en production).
    const uid = "sps-test-7";
    await createTestPlayer(uid);

    await db
      .collection("players").doc(uid)
      .collection("buildings").doc("forge_0")
      .set({
        buildingType: "forge" as BuildingType, // cast contrôlé — buildingType fictif Phase 2+
        level: 1,
        slots: [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)],
      });

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "forge_0", slotIndex: 0, recipeId: "logs" }))
    ).rejects.toMatchObject(
      { code: "failed-precondition" } satisfies Partial<HttpsError>
    );
  });

  it("Slot déjà occupé : rejet avec failed-precondition", async () => {
    // Si slot.recipeId !== null, le handler rejette sans modifier quoi que ce soit.
    const uid = "sps-test-8";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", 5 * 60 * 1000), // slot 0 déjà en production
      makeIdleSlot(1),
      makeIdleSlot(2),
    ]);

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "logs" }))
    ).rejects.toMatchObject(
      { code: "failed-precondition" } satisfies Partial<HttpsError>
    );
  });

  it("Ressources insuffisantes : rejet failed-precondition, inventory et slots inchangés", async () => {
    // reconstruction_kits requiert 3 planks. Joueur avec 0 planks → rejet.
    // Vérification de l'atomicité : aucune mutation Firestore après l'échec.
    const uid = "sps-test-9";
    const requiredPlanks = RECIPES["reconstruction_kits"].inputs!["planks"]!; // 3

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 0,  cap: 50 },
        planks:             { quantity: 0,  cap: 30 }, // 0 < 3 requis
        reconstructionKits: { quantity: 0,  cap: 10 },
      },
    });
    await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

    await expect(
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "reconstruction_kits", cycles: 1 }))
    ).rejects.toMatchObject(
      { code: "failed-precondition" } satisfies Partial<HttpsError>
    );

    // Atomicité — lecture directe Firestore post-échec.
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.planks.quantity).toBe(0); // inventory inchangé

    const buildingSnap = await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get();
    expect(buildingSnap.data()?.slots[0].recipeId).toBeNull(); // slot toujours libre

    // Évite les warnings de variable inutilisée — la valeur sert de documentation.
    void requiredPlanks;
  });

  it("Démarrage réussi (logs — sans input) : slot updaté, inventory inchangé", async () => {
    // logs n'a pas d'input (production primaire) — l'inventory ne doit pas être muté.
    const uid = "sps-test-10";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

    const result = await startProductionSlotHandler(
      makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "logs" })
    );

    // Slot 0 correctement mis à jour dans le snapshot retourné.
    const updatedSlot = result.building.slots.find((s) => s.slotIndex === 0);
    expect(updatedSlot?.recipeId).toBe("logs");
    expect(updatedSlot?.startedAt).not.toBeNull();
    expect(updatedSlot?.lastProcessedAt).toBeNull();
    // Production continue : pas de lot (D3.1).
    expect(updatedSlot?.cyclesPlanned).toBeNull();
    expect(updatedSlot?.cyclesProcessed).toBeNull();
    expect(result.alreadyApplied).toBe(false);

    // Inventory inchangé — logs ne consomme aucun input.
    expect(result.inventory.logs.quantity).toBe(0);
    expect(result.inventory.planks.quantity).toBe(0);
    expect(result.inventory.reconstructionKits.quantity).toBe(0);

    // Persistance vérifiée dans Firestore.
    const buildingSnap = await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get();
    expect(buildingSnap.data()?.slots[0].recipeId).toBe("logs");
    expect(buildingSnap.data()?.slots[0].startedAt).not.toBeNull();
    expect(buildingSnap.data()?.slots[0].lastProcessedAt).toBeNull();
  });

  it("Démarrage réussi (planks, lot de 1 — input 2 logs) : slot updaté, inventory.logs décrémenté", async () => {
    // planks requiert 2 logs. Joueur avec 5 logs → après démarrage : 3 logs restants.
    const uid = "sps-test-11";
    const INITIAL_LOGS = 5;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: INITIAL_LOGS, cap: 50 },
        planks:             { quantity: 0,            cap: 30 },
        reconstructionKits: { quantity: 0,            cap: 10 },
      },
    });
    await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

    const result = await startProductionSlotHandler(
      makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 1 })
    );

    // Slot 0 correctement mis à jour.
    const updatedSlot = result.building.slots.find((s) => s.slotIndex === 0);
    expect(updatedSlot?.recipeId).toBe("planks");
    expect(updatedSlot?.startedAt).not.toBeNull();
    expect(updatedSlot?.lastProcessedAt).toBeNull();
    expect(updatedSlot?.cyclesPlanned).toBe(1);
    expect(updatedSlot?.cyclesProcessed).toBe(0);

    // Inventory : logs décrémenté du coût exact tiré de RECIPES.
    expect(result.inventory.logs.quantity).toBe(INITIAL_LOGS - PLANKS_INPUT_LOGS); // 3
    expect(result.inventory.planks.quantity).toBe(0);
    expect(result.inventory.reconstructionKits.quantity).toBe(0);

    // Persistance vérifiée dans Firestore.
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(INITIAL_LOGS - PLANKS_INPUT_LOGS);
  });

  // ── ÉTAPE 19.1 — production par lot (D-ETAPE19-001 à 004) ──────────────────

  describe("lot de N cycles", () => {

    it("Lot complet de planks (N = 24) : 48 logs débités, slot cyclesPlanned 24 / cyclesProcessed 0, trace écrite", async () => {
      const uid = "sps-lot-planks-24";
      const key = randomUUID();
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 50, cap: 50 },
          planks:             { quantity: 0,  cap: 30 },
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      const result = await startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 1, recipeId: "planks",
        cycles: PLANKS_MAX_BATCH_CYCLES, idempotencyKey: key,
      }));

      expect(result.alreadyApplied).toBe(false);
      expect(result.inventory.logs.quantity).toBe(50 - PLANKS_MAX_BATCH_CYCLES * PLANKS_INPUT_LOGS); // 2
      const slot = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get())
        .data()?.slots[1];
      expect(slot.recipeId).toBe("planks");
      expect(slot.cyclesPlanned).toBe(PLANKS_MAX_BATCH_CYCLES);
      expect(slot.cyclesProcessed).toBe(0);
      const op = (await db.collection("players").doc(uid).collection("productionOps").doc(key).get()).data();
      expect(op).toMatchObject({
        uid, op: "start", buildingId: "sawmill_0", slotIndex: 1, recipeId: "planks", cycles: PLANKS_MAX_BATCH_CYCLES,
      });
    });

    it("Lot complet de kits (N = 10) : 30 planks débités", async () => {
      const uid = "sps-lot-kits-10";
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 0,  cap: 50 },
          planks:             { quantity: 30, cap: 30 },
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      const result = await startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId: "reconstruction_kits", cycles: KITS_MAX_BATCH_CYCLES,
      }));

      expect(result.inventory.planks.quantity).toBe(30 - KITS_MAX_BATCH_CYCLES * KITS_INPUT_PLANKS); // 0
      const updatedSlot = result.building.slots.find((s) => s.slotIndex === 0);
      expect(updatedSlot?.cyclesPlanned).toBe(KITS_MAX_BATCH_CYCLES);
      expect(updatedSlot?.cyclesProcessed).toBe(0);
    });

    it.each([
      ["planks, N = 0", "planks", 0],
      ["planks, N au-dessus de la borne (25)", "planks", PLANKS_MAX_BATCH_CYCLES + 1],
      ["kits, N au-dessus de la borne (11)", "reconstruction_kits", KITS_MAX_BATCH_CYCLES + 1],
      ["planks, N non entier (1.5)", "planks", 1.5],
      ["planks, N chaîne", "planks", "3"],
      ["planks, N absent", "planks", undefined],
      ["logs, N fourni", "logs", 1],
      ["logs, N null", "logs", null],
    ])("Refus invalid-argument (%s), rien n'est écrit", async (_label, recipeId, cycles) => {
      const uid = `sps-lot-invalid-${String(_label).replace(/[^a-z0-9]/gi, "")}`;
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 50, cap: 50 },
          planks:             { quantity: 30, cap: 30 },
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      await expect(startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId, cycles,
      }))).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);

      const player = (await db.collection("players").doc(uid).get()).data();
      expect(player?.inventory.logs.quantity).toBe(50);
      expect(player?.inventory.planks.quantity).toBe(30);
      const slot = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get())
        .data()?.slots[0];
      expect(slot.recipeId).toBeNull();
    });

    it.each([
      ["absente", undefined],
      ["vide", "  "],
      ["avec un slash", "bad/key"],
      ["point-point", ".."],
      ["nom réservé", "__x__"],
      ["pas un UUID", "key-lot-1"],
      ["nombre", 42],
    ])("Refus invalid-argument : idempotencyKey %s, rien n'est écrit", async (_label, idempotencyKey) => {
      const uid = `sps-lot-badkey-${String(_label).replace(/[^a-z0-9]/gi, "")}`;
      await createTestPlayer(uid);
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      await expect(startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId: "logs", idempotencyKey,
      }))).rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
      const slot = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get())
        .data()?.slots[0];
      expect(slot.recipeId).toBeNull();
    });

    it("Refus failed-precondition : intrants insuffisants pour N cycles (planks N = 3, 5 logs), rien n'est écrit", async () => {
      const uid = "sps-lot-inputs";
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 5, cap: 50 }, // 3 × 2 = 6 requis
          planks:             { quantity: 0, cap: 30 },
          reconstructionKits: { quantity: 0, cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      await expect(startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 3,
      }))).rejects.toMatchObject({ code: "failed-precondition" } satisfies Partial<HttpsError>);

      const player = (await db.collection("players").doc(uid).get()).data();
      expect(player?.inventory.logs.quantity).toBe(5);
      const ops = await db.collection("players").doc(uid).collection("productionOps").get();
      expect(ops.empty).toBe(true);
    });

    it("Place libre : N × outputQty > cap − stock → failed-precondition ; N = place libre → accepté", async () => {
      const uid = "sps-lot-space";
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 10, cap: 50 },
          planks:             { quantity: 28, cap: 30 }, // place libre = 2
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      await expect(startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 3,
      }))).rejects.toMatchObject({ code: "failed-precondition" } satisfies Partial<HttpsError>);
      expect((await db.collection("players").doc(uid).get()).data()?.inventory.logs.quantity).toBe(10);

      await resetRateLimit(uid);
      const result = await startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 2,
      }));
      expect(result.inventory.logs.quantity).toBe(10 - 2 * PLANKS_INPUT_LOGS); // 6
    });

    it("Rejeu de la même clé : alreadyApplied, aucun double débit, slot inchangé", async () => {
      const uid = "sps-lot-replay";
      const key = randomUUID();
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 20, cap: 50 },
          planks:             { quantity: 0,  cap: 30 },
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);
      const data = { buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 4, idempotencyKey: key };

      const first = await startProductionSlotHandler(makeStartRequest(uid, data));
      expect(first.alreadyApplied).toBe(false);
      expect(first.inventory.logs.quantity).toBe(12);
      const slotAfterFirst = first.building.slots.find((s) => s.slotIndex === 0);

      // Renvoi de la même intention : le slot est occupé, la trace est lue AVANT ce contrôle.
      await resetRateLimit(uid);
      const second = await startProductionSlotHandler(makeStartRequest(uid, data));
      expect(second.alreadyApplied).toBe(true);
      expect(second.inventory.logs.quantity).toBe(12);

      const player = (await db.collection("players").doc(uid).get()).data();
      expect(player?.inventory.logs.quantity).toBe(12); // débité une seule fois
      const slot = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get())
        .data()?.slots[0];
      expect(slot.cyclesPlanned).toBe(4);
      expect(slot.startedAt.toMillis()).toBe(slotAfterFirst?.startedAt?.toMillis());
    });

    it("Même clé, contenu différent (N ou slot) → failed-precondition, rien n'est écrit", async () => {
      const uid = "sps-lot-replay-diff";
      const key = randomUUID();
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 20, cap: 50 },
          planks:             { quantity: 0,  cap: 30 },
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      await startProductionSlotHandler(makeStartRequest(uid, {
        buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 4, idempotencyKey: key,
      }));
      for (const other of [
        { buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 5, idempotencyKey: key },
        { buildingId: "sawmill_0", slotIndex: 1, recipeId: "planks", cycles: 4, idempotencyKey: key },
      ]) {
        await resetRateLimit(uid);
        await expect(startProductionSlotHandler(makeStartRequest(uid, other)))
          .rejects.toMatchObject({ code: "failed-precondition" } satisfies Partial<HttpsError>);
      }

      const player = (await db.collection("players").doc(uid).get()).data();
      expect(player?.inventory.logs.quantity).toBe(12);
      const slots = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get())
        .data()?.slots;
      expect(slots[1].recipeId).toBeNull();
    });

    it("Rejeu sur logs (cycles absent des deux côtés) : alreadyApplied, slot inchangé", async () => {
      const uid = "sps-lot-replay-logs";
      const data = { buildingId: "sawmill_0", slotIndex: 2, recipeId: "logs", idempotencyKey: randomUUID() };
      await createTestPlayer(uid);
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      const first = await startProductionSlotHandler(makeStartRequest(uid, data));
      await resetRateLimit(uid);
      const second = await startProductionSlotHandler(makeStartRequest(uid, data));

      expect(first.alreadyApplied).toBe(false);
      expect(second.alreadyApplied).toBe(true);
      const op = (await db.collection("players").doc(uid).collection("productionOps").doc(data.idempotencyKey).get())
        .data();
      expect(op?.cycles).toBeNull();
    });

    it("Chemin de la trace (déterministe) : trace de lancement posée en base, slot libre et intrants absents → alreadyApplied, rien ne change", async () => {
      // Sans lecture de la trace AVANT les contrôles métier, cet appel serait refusé (intrants
      // insuffisants) : alreadyApplied = true prouve que le rejeu passe par la trace.
      const uid = "sps-lot-trace-path";
      const key = randomUUID();
      const data = { buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 5, idempotencyKey: key };
      await createTestPlayer(uid); // 0 log : un vrai lancement de 5 planks échouerait
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);
      const opRef = db.collection("players").doc(uid).collection("productionOps").doc(key);
      await opRef.set({
        uid, op: "start", buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 5,
        createdAt: admin.firestore.Timestamp.now(),
      });
      const traceBefore = await opRef.get();
      const playerBefore = (await db.collection("players").doc(uid).get()).data();

      const result = await startProductionSlotHandler(makeStartRequest(uid, data));

      expect(result.alreadyApplied).toBe(true);
      const slots = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get())
        .data()?.slots;
      expect(slots[0].recipeId).toBeNull();
      expect((await db.collection("players").doc(uid).get()).data()?.inventory).toEqual(playerBefore?.inventory);
      const traceAfter = await opRef.get();
      expect(traceAfter.updateTime?.isEqual(traceBefore.updateTime!)).toBe(true);
    });

    it("Appels concurrents avec la même clé : intrants débités une seule fois, une seule trace", async () => {
      // Conservé de 19.1 ; ne prouve pas le chemin de la trace (le rate limit peut couper l'un des
      // deux appels) — voir le test « Chemin de la trace (déterministe) » ci-dessus.
      const uid = "sps-lot-concurrent";
      const data = { buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks", cycles: 10, idempotencyKey: randomUUID() };
      await createTestPlayer(uid, {
        inventory: {
          logs:               { quantity: 40, cap: 50 },
          planks:             { quantity: 0,  cap: 30 },
          reconstructionKits: { quantity: 0,  cap: 10 },
        },
      });
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      const results = await Promise.allSettled([
        startProductionSlotHandler(makeStartRequest(uid, data)),
        startProductionSlotHandler(makeStartRequest(uid, data)),
      ]);

      // Le rate limiter (non atomique, TD-001) peut refuser l'un des deux ; aucun ne doit débiter deux fois.
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      const player = (await db.collection("players").doc(uid).get()).data();
      expect(player?.inventory.logs.quantity).toBe(40 - 10 * PLANKS_INPUT_LOGS); // 20
      const ops = await db.collection("players").doc(uid).collection("productionOps").get();
      expect(ops.size).toBe(1);
    });
  });

  describe("validation de buildingId (D-ETAPE19-007)", () => {

    it.each(INVALID_BUILDING_IDS)("buildingId %s → invalid-argument, message sans la valeur, rien n'est écrit", async (label, buildingId) => {
      const uid = `start-bid-${label.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
      await createTestPlayer(uid);
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);
      const playerBefore = (await db.collection("players").doc(uid).get()).data();
      const buildingBefore = (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get()).data();

      let caught: unknown;
      try {
        await startProductionSlotHandler(makeStartRequest(uid, { buildingId, slotIndex: 0, recipeId: "logs" }));
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
      expect((caught as HttpsError).message).not.toContain(buildingId);
      expect((await db.collection("players").doc(uid).get()).data()).toEqual(playerBefore);
      expect((await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get()).data()).toEqual(buildingBefore);
      expect((await db.collection("players").doc(uid).collection("productionOps").get()).size).toBe(0);
    });

    it.each(LIMIT_BUILDING_IDS)("buildingId à la limite (%s) → accepté par la validation, bâtiment introuvable", async (label, buildingId) => {
      const uid = `start-bid-${label.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
      await createTestPlayer(uid);
      await expect(startProductionSlotHandler(makeStartRequest(uid, { buildingId, slotIndex: 0, recipeId: "logs" })))
        .rejects.toMatchObject({ code: "not-found", message: `Bâtiment '${buildingId}' introuvable pour ce joueur.` } satisfies Partial<HttpsError>);
    });
  });

});
