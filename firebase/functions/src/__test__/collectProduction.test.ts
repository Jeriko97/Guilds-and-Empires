import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

import { collectProductionHandler } from "../production/collectProduction";
import type { CollectProductionRequest } from "../production/collectProduction";
import { RECIPES } from "../shared/recipes";
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

const LOG_DURATION_MS    = RECIPES["logs"].durationMs;   // 20 min
const PLANKS_DURATION_MS = RECIPES["planks"].durationMs; // 25 min

// ── Helper local ──────────────────────────────────────────────────────────────

/**
 * Construit un CollectProductionRequest authentifié.
 * `data` est { buildingId: unknown } pour permettre les tests de validation.
 */
function makeCollectRequest(
  uid: string,
  data: { buildingId: unknown }
): CollectProductionRequest {
  const base = makeRequest(uid);
  return {
    data,
    auth:             base.auth,
    rawRequest:       base.rawRequest,
    acceptsStreaming: base.acceptsStreaming,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await clearTestData();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("collectProduction", () => {

  it("1. Happy path — 1 slot actif, 3 cycles complétés, inventaire vide", async () => {
    // 3 cycles × outputQty(1) = 3 logs. Inventaire vide → aucune saturation.
    // Slot toujours actif après la récolte (recipeId et startedAt inchangés).
    const uid = "collect-prod-1";
    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 0, cap: 50 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", 3 * LOG_DURATION_MS + 1000),
      makeIdleSlot(1),
      makeIdleSlot(2),
    ]);

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    expect(result.collected.logs).toBe(3);
    expect(result.discarded.logs ?? 0).toBe(0);

    // Slot toujours actif en Firestore.
    const buildingSnap = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();
    expect(buildingSnap.data()?.slots[0].recipeId).toBe("logs");
    expect(buildingSnap.data()?.slots[0].startedAt).not.toBeNull();
    expect(buildingSnap.data()?.slots[0].lastProcessedAt).not.toBeNull();

    // Inventaire persisté.
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(3);
  });

  it("2. Plusieurs slots, plusieurs recipes — agrégation correcte par ressource", async () => {
    // Slot 0 : logs (1 cycle), slot 1 : planks (1 cycle), slot 2 : null.
    // Les deux ressources collectées indépendamment.
    const uid = "collect-prod-2";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs",   LOG_DURATION_MS    + 1000),
      makeActiveSlot(1, "planks", PLANKS_DURATION_MS + 1000),
      makeIdleSlot(2),
    ]);

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    expect(result.collected.logs).toBe(1);
    expect(result.collected.planks).toBe(1);
  });

  it("3. CRITIQUE — deux slots même ressource : availableSpace recalculé entre itérations", async () => {
    // cap=10, quantity=0. Slot 0 produit 6 logs bruts. Slot 1 produit 6 logs bruts.
    // Après slot 0 : updatedInventory.logs=6, availableSpace=4.
    // Slot 1 : actualYield=min(6,4)=4, discardedYield=2.
    // Total attendu : collected.logs=10, discarded.logs=2.
    // Ce test valide que availableSpace lit updatedInventory (état muté), pas l'inventaire initial.
    const uid = "collect-prod-3";
    const SIX_CYCLES_MS = 6 * LOG_DURATION_MS + 1000;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 0, cap: 10 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", SIX_CYCLES_MS),
      makeActiveSlot(1, "logs", SIX_CYCLES_MS),
      makeIdleSlot(2),
    ]);

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    expect(result.collected.logs).toBe(10);
    expect(result.discarded.logs).toBe(2);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(10); // = cap
  });

  it("4. Saturation partielle — collected=2, discarded=3, quantity=10", async () => {
    // 5 cycles bruts (rawYield=5), cap=10, quantity=8 → availableSpace=2.
    // actualYield=min(5,2)=2, discardedYield=3. Somme=5=rawYield ✓.
    const uid = "collect-prod-4";
    const FIVE_CYCLES_MS = 5 * LOG_DURATION_MS + 1000;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 8, cap: 10 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", FIVE_CYCLES_MS),
      makeIdleSlot(1),
      makeIdleSlot(2),
    ]);

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    expect(result.collected.logs).toBe(2);
    expect(result.discarded.logs).toBe(3);

    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(10);
  });

  it("5. Saturation totale — collected=0, discarded=rawYield, lastProcessedAt mis à jour", async () => {
    // cap == quantity → aucun espace disponible. Yield intégralement perdu.
    // lastProcessedAt quand même mis à now (Option B — perte sèche assumée, D3.1).
    const uid = "collect-prod-5";
    const FULL_CAP = 50;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: FULL_CAP, cap: FULL_CAP },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    const slotBefore = makeActiveSlot(0, "logs", 2 * LOG_DURATION_MS + 1000);
    await createTestBuilding(uid, [slotBefore, makeIdleSlot(1), makeIdleSlot(2)]);

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    // Aucun yield effectif — tout discarded.
    expect(result.collected.logs ?? 0).toBe(0);
    expect((result.discarded.logs ?? 0)).toBeGreaterThan(0);

    // Inventaire non modifié (saturé).
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(FULL_CAP);

    // lastProcessedAt mis à jour malgré le yield nul (Option B).
    const buildingSnap = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();
    expect(buildingSnap.data()?.slots[0].lastProcessedAt).not.toBeNull();
    expect(buildingSnap.data()?.slots[0].lastProcessedAt).not.toEqual(
      slotBefore.lastProcessedAt // null → a été mis à jour
    );
  });

  it("6. Cycle pas encore terminé — collected={}, discarded={}, lastProcessedAt inchangé", async () => {
    // 5 min elapsed < 20 min de durée → completedCycles=0 → aucune écriture.
    // lastProcessedAt ne doit PAS être touché (on ne consomme pas de temps partiel).
    const uid = "collect-prod-6";
    const FIVE_MIN_MS = 5 * 60 * 1000;

    await createTestPlayer(uid);
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", FIVE_MIN_MS),
      makeIdleSlot(1),
      makeIdleSlot(2),
    ]);

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    expect(Object.keys(result.collected).length).toBe(0);
    expect(Object.keys(result.discarded).length).toBe(0);

    // lastProcessedAt non touché en Firestore (skip des writes car anySlotProcessed=false).
    const buildingSnap = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();
    expect(buildingSnap.data()?.slots[0].lastProcessedAt).toBeNull();
  });

  it("7. Tous slots inactifs — no-op valide, pas d'erreur, aucune mutation Firestore", async () => {
    const uid = "collect-prod-7";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

    const inventoryBefore = (await db.collection("players").doc(uid).get()).data()?.inventory;

    const result = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );

    expect(result.collected).toEqual({});
    expect(result.discarded).toEqual({});

    // Aucune mutation Firestore — inventaire inchangé.
    const inventoryAfter = (await db.collection("players").doc(uid).get()).data()?.inventory;
    expect(inventoryAfter).toEqual(inventoryBefore);
  });

  it("8. Building inexistant → not-found", async () => {
    const uid = "collect-prod-8";
    await createTestPlayer(uid);
    // Aucun building créé intentionnellement.

    await expect(
      collectProductionHandler(makeCollectRequest(uid, { buildingId: "sawmill_0" }))
    ).rejects.toMatchObject(
      { code: "not-found" } satisfies Partial<HttpsError>
    );
  });

  it("9. Player inexistant → not-found", async () => {
    // Aucun document joueur — la transaction doit lire le joueur et échouer.
    const uid = "collect-prod-9";

    await expect(
      collectProductionHandler(makeCollectRequest(uid, { buildingId: "sawmill_0" }))
    ).rejects.toMatchObject(
      { code: "not-found" } satisfies Partial<HttpsError>
    );
  });

  it("10. Non authentifié → unauthenticated", async () => {
    // requireAuth est la première ligne de défense — aucune logique ne s'exécute sans uid.
    await expect(
      collectProductionHandler(
        makeUnauthRequest() as unknown as CollectProductionRequest
      )
    ).rejects.toMatchObject(
      { code: "unauthenticated" } satisfies Partial<HttpsError>
    );
  });

  it.each([
    { label: "chaîne vide", value: ""        },
    { label: "null",        value: null      },
    { label: "undefined",   value: undefined },
  ])("11. buildingId $label → invalid-argument", async ({ value }) => {
    const uid = "collect-prod-11";
    await createTestPlayer(uid);

    await expect(
      collectProductionHandler(makeCollectRequest(uid, { buildingId: value }))
    ).rejects.toMatchObject(
      { code: "invalid-argument" } satisfies Partial<HttpsError>
    );
  });

  it("12. Recipe inconnue (corruption data) → internal", async () => {
    // Injection directe via Firestore d'un recipeId absent de RECIPES.
    // Inaccessible via les handlers normaux (TypeScript + startProductionSlot bloquerait).
    // Vérifie que processBuildingSlots throw Error → handler convertit en HttpsError("internal").
    const uid = "collect-prod-12";
    await createTestPlayer(uid);

    await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .set({
        buildingType: "sawmill",
        level: 1,
        slots: [
          {
            slotIndex:       0,
            recipeId:        "dragon_scales", // corruption — absent de RECIPES
            startedAt:       admin.firestore.Timestamp.fromMillis(
              Date.now() - 60 * 60 * 1000
            ),
            lastProcessedAt: null,
          },
          { slotIndex: 1, recipeId: null, startedAt: null, lastProcessedAt: null },
          { slotIndex: 2, recipeId: null, startedAt: null, lastProcessedAt: null },
        ],
      });

    await expect(
      collectProductionHandler(makeCollectRequest(uid, { buildingId: "sawmill_0" }))
    ).rejects.toMatchObject(
      { code: "internal" } satisfies Partial<HttpsError>
    );
  });

  it("13. Idempotence faible — 2e appel (après rate limit) collecte {} car lastProcessedAt=now", async () => {
    // Appel 1 : collecte 1 log, pose lastProcessedAt=now1.
    // Le rate limit est neutralisé via Admin SDK (suppression du doc rateLimits).
    // Appel 2 : elapsed ≈ 0s << LOG_DURATION_MS (20 min) → 0 cycles → collected={}.
    // Garantie : NOT une garantie d'idempotence forte — c'est le comportement attendu
    // du temps qui passe. Un second appel immédiat ne peut pas double-créditer.
    const uid = "collect-prod-13";
    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 0, cap: 50 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", LOG_DURATION_MS + 1000), // 1 cycle complété
      makeIdleSlot(1),
      makeIdleSlot(2),
    ]);

    // Appel 1 — récolte 1 log, lastProcessedAt ← now1.
    const result1 = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );
    expect(result1.collected.logs).toBe(1);

    // Neutralise le rate limit pour permettre un second appel immédiat.
    await db.collection("rateLimits").doc(`${uid}_collectProduction`).delete();

    // Appel 2 — elapsed ≈ 0s depuis lastProcessedAt → 0 cycles → no-op.
    const result2 = await collectProductionHandler(
      makeCollectRequest(uid, { buildingId: "sawmill_0" })
    );
    expect(result2.collected).toEqual({});
    expect(result2.discarded).toEqual({});

    // Inventaire : toujours 1 log — le 2e appel n'a rien crédité.
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(1);
  });

  it("14. Rate limit — 2e appel en < 6s → resource-exhausted", async () => {
    // checkRateLimit : cooldown par uid par action (TD-001 : non-atomique, toléré).
    // Sémantique voulue : ≤10 appels/min. Vérification pratique : 2e appel immédiat bloqué.
    const uid = "collect-prod-14";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

    // Premier appel : passe (pas de rate limit record existant).
    await expect(
      collectProductionHandler(makeCollectRequest(uid, { buildingId: "sawmill_0" }))
    ).resolves.toBeDefined();

    // Deuxième appel immédiat : bloqué par checkRateLimit (elapsed < 6s).
    await expect(
      collectProductionHandler(makeCollectRequest(uid, { buildingId: "sawmill_0" }))
    ).rejects.toMatchObject(
      { code: "resource-exhausted" } satisfies Partial<HttpsError>
    );
  });

});
