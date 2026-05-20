import { HttpsError } from "firebase-functions/v2/https";

import { startProductionSlotHandler } from "../production/startProductionSlot";
import type { StartProductionSlotRequest } from "../production/startProductionSlot";
import { RECIPES } from "../shared/recipes";
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

// ── Helper local ──────────────────────────────────────────────────────────────

/**
 * Construit un StartProductionSlotRequest authentifié avec les données fournies.
 * Toutes les valeurs de data sont unknown pour permettre les tests de validation.
 */
function makeStartRequest(
  uid: string,
  data: { buildingId: unknown; slotIndex: unknown; recipeId: unknown }
): StartProductionSlotRequest {
  const base = makeRequest(uid);
  return {
    data,
    auth:            base.auth,
    rawRequest:      base.rawRequest,
    acceptsStreaming: base.acceptsStreaming,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await clearTestData();
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
      startProductionSlotHandler(makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "reconstruction_kits" }))
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

  it("Démarrage réussi (planks — input 2 logs) : slot updaté, inventory.logs décrémenté", async () => {
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
      makeStartRequest(uid, { buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks" })
    );

    // Slot 0 correctement mis à jour.
    const updatedSlot = result.building.slots.find((s) => s.slotIndex === 0);
    expect(updatedSlot?.recipeId).toBe("planks");
    expect(updatedSlot?.startedAt).not.toBeNull();
    expect(updatedSlot?.lastProcessedAt).toBeNull();

    // Inventory : logs décrémenté du coût exact tiré de RECIPES.
    expect(result.inventory.logs.quantity).toBe(INITIAL_LOGS - PLANKS_INPUT_LOGS); // 3
    expect(result.inventory.planks.quantity).toBe(0);
    expect(result.inventory.reconstructionKits.quantity).toBe(0);

    // Persistance vérifiée dans Firestore.
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(INITIAL_LOGS - PLANKS_INPUT_LOGS);
  });

});
