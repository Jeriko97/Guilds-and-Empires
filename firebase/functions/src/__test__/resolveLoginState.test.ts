import { HttpsError } from "firebase-functions/v2/https";

import { resolveLoginStateHandler } from "../login/resolveLoginState";
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

const LOG_DURATION_MS = RECIPES["logs"].durationMs; // 20 min
const LOG_OUTPUT_QTY  = RECIPES["logs"].outputQty;  // 1

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await clearTestData();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveLoginState", () => {

  it("Appel non-authentifié : rejet avec code unauthenticated", async () => {
    // requireAuth est la première ligne de défense — aucune logique économique
    // ne doit s'exécuter sans uid vérifié.
    await expect(resolveLoginStateHandler(makeUnauthRequest()))
      .rejects.toMatchObject(
        { code: "unauthenticated" } satisfies Partial<HttpsError>
      );
  });

  it("Premier login : crée le document joueur avec les valeurs initiales", async () => {
    // Aucun document existant pour cet uid — resolveLoginState doit créer le joueur.
    const uid = "test-user-1";
    const result = await resolveLoginStateHandler(makeRequest(uid, "Alice"));

    // Le snapshot retourné reflète les valeurs initiales.
    expect(result.player.schemaVersion).toBe(1);
    expect(result.player.displayName).toBe("Alice");
    expect(result.player.gold).toBe(0);
    expect(result.player.imperialFavor).toBe(0);
    expect(result.player.favorRank).toBe("local_supplier");
    expect(result.player.guildCharterUnlocked).toBe(false);
    expect(result.player.firstContractCompleted).toBe(false);
    expect(result.player.inventory).toEqual({
      logs:               { quantity: 0, cap: 50 },
      planks:             { quantity: 0, cap: 30 },
      reconstructionKits: { quantity: 0, cap: 10 },
    });
    // Sawmill seedée au premier login (D-ETAPE16.5).
    expect(result.buildings).toHaveLength(1);
    expect(result.buildings[0].buildingType).toBe("sawmill");
    expect(result.buildings[0].level).toBe(1);
    expect(result.buildings[0].slots).toHaveLength(3);
    expect(result.buildings[0].slots.every((s) => s.recipeId === null)).toBe(true);
    expect(result.buildings[0].slots.every((s) => s.startedAt === null)).toBe(true);
    expect(result.buildings[0].slots.every((s) => s.lastProcessedAt === null)).toBe(true);
    expect(result.activeContracts).toEqual([]);

    // Le document joueur a bien été persisté dans Firestore.
    const snap = await db.collection("players").doc(uid).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.gold).toBe(0);
    expect(snap.data()?.schemaVersion).toBe(1);
  });

  it("Premier login : Sawmill seedée dans Firestore avec 3 slots vides", async () => {
    const uid = "test-user-8";
    await resolveLoginStateHandler(makeRequest(uid));

    const buildingSnap = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();

    expect(buildingSnap.exists).toBe(true);
    const data = buildingSnap.data();
    expect(data?.buildingType).toBe("sawmill");
    expect(data?.level).toBe(1);
    expect(data?.slots).toHaveLength(3);
    expect(data?.slots[0]).toEqual({ slotIndex: 0, recipeId: null, startedAt: null, lastProcessedAt: null });
    expect(data?.slots[1]).toEqual({ slotIndex: 1, recipeId: null, startedAt: null, lastProcessedAt: null });
    expect(data?.slots[2]).toEqual({ slotIndex: 2, recipeId: null, startedAt: null, lastProcessedAt: null });
  });

  it("Premier login : snapshot retourné contient la Sawmill (forme identique à un joueur existant)", async () => {
    // Vérifie que result.buildings reflète exactement le building seedé,
    // sans read Firestore supplémentaire — parité de forme avec la branche joueur existant.
    const uid = "test-user-9";
    const result = await resolveLoginStateHandler(makeRequest(uid));

    expect(result.buildings).toHaveLength(1);
    const b = result.buildings[0];
    expect(b.id).toBe("sawmill_0");
    expect(b.buildingType).toBe("sawmill");
    expect(b.level).toBe(1);
    expect(b.slots).toHaveLength(3);
    expect(b.slots[0]).toEqual({ slotIndex: 0, recipeId: null, startedAt: null, lastProcessedAt: null });
    expect(b.slots[1]).toEqual({ slotIndex: 1, recipeId: null, startedAt: null, lastProcessedAt: null });
    expect(b.slots[2]).toEqual({ slotIndex: 2, recipeId: null, startedAt: null, lastProcessedAt: null });
  });

  it("Deuxième login : Sawmill non recréée, pas de doublon", async () => {
    // Vérifie que le seed n'est appliqué qu'au premier login (!playerSnap.exists).
    // Le rate limit est neutralisé via Admin SDK (pas de sleep).
    const uid = "test-user-10";

    // Premier login — crée le joueur + la Sawmill.
    const result1 = await resolveLoginStateHandler(makeRequest(uid));
    expect(result1.buildings).toHaveLength(1);

    // Neutralise le rate limit pour permettre un second appel immédiat.
    await db.collection("rateLimits").doc(`${uid}_resolveLoginState`).delete();

    // Deuxième login — joueur existant, aucune recréation du building.
    const result2 = await resolveLoginStateHandler(makeRequest(uid));
    expect(result2.buildings).toHaveLength(1);
    expect(result2.buildings[0].id).toBe("sawmill_0");
    expect(result2.buildings[0].buildingType).toBe("sawmill");

    // La subcollection ne contient qu'un seul doc après le 2e appel.
    const buildingsSnap = await db
      .collection("players").doc(uid)
      .collection("buildings")
      .get();
    expect(buildingsSnap.docs).toHaveLength(1);
  });

  it("Joueur existant sans slot actif : inventaire inchangé", async () => {
    // Joueur avec un building ayant uniquement des slots inactifs.
    const uid = "test-user-2";
    await createTestPlayer(uid);
    await createTestBuilding(uid, [
      makeIdleSlot(0),
      makeIdleSlot(1),
      makeIdleSlot(2),
    ]);

    const before = await db.collection("players").doc(uid).get();
    const inventoryBefore = before.data()?.inventory;

    const result = await resolveLoginStateHandler(makeRequest(uid));

    // Aucune production calculée — l'inventaire ne change pas.
    expect(result.player.inventory).toEqual(inventoryBefore);
    expect(result.buildings).toHaveLength(1);
    expect(result.buildings[0].slots.every((s) => s.recipeId === null)).toBe(true);
  });

  it("Slot actif depuis 30 min : produit le yield attendu (logs)", async () => {
    // Un cycle de logs = 20 min. 30 min = 1 cycle complet = 1 log produit.
    const uid = "test-user-3";
    const THIRTY_MIN_MS = 30 * 60 * 1000;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 0, cap: 50 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", THIRTY_MIN_MS),
    ]);

    const result = await resolveLoginStateHandler(makeRequest(uid));

    const expectedCycles = Math.floor(THIRTY_MIN_MS / LOG_DURATION_MS); // 1
    const expectedLogs   = expectedCycles * LOG_OUTPUT_QTY;             // 1

    expect(result.player.inventory.logs.quantity).toBe(expectedLogs);
    expect(result.player.inventory.planks.quantity).toBe(0);
    expect(result.player.inventory.reconstructionKits.quantity).toBe(0);

    // lastProcessedAt mis à jour dans Firestore.
    const buildingSnap = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();
    expect(buildingSnap.data()?.slots[0].lastProcessedAt).not.toBeNull();
  });

  it("Inventaire plein : yield clampé à 0, lastProcessedAt mis à jour (Option B)", async () => {
    // Inventaire logs saturé (quantity === cap). Le yield calculé est clampé à 0.
    // Option B : lastProcessedAt est quand même mis à jour (production perdue = intentionnel).
    const uid = "test-user-4";
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const FULL_CAP = 50;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: FULL_CAP, cap: FULL_CAP }, // saturé
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", TWO_HOURS_MS),
    ]);

    const slotBefore = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();
    const lastProcessedAtBefore = slotBefore.data()?.slots[0].lastProcessedAt;

    const result = await resolveLoginStateHandler(makeRequest(uid));

    // Yield clampé : logs restent à cap.
    expect(result.player.inventory.logs.quantity).toBe(FULL_CAP);

    // lastProcessedAt mis à jour malgré le yield nul (Option B).
    const buildingSnap = await db
      .collection("players").doc(uid)
      .collection("buildings").doc("sawmill_0")
      .get();
    const lastProcessedAtAfter = buildingSnap.data()?.slots[0].lastProcessedAt;
    expect(lastProcessedAtAfter).not.toBeNull();
    expect(lastProcessedAtAfter).not.toEqual(lastProcessedAtBefore);
  });

  it("Rate limit : deuxième appel rapide rejeté avec resource-exhausted", async () => {
    // Deux appels consécutifs dans la fenêtre de 5s pour le même uid.
    const uid = "test-user-5";
    await createTestPlayer(uid);

    // Premier appel : passe.
    await expect(resolveLoginStateHandler(makeRequest(uid))).resolves.toBeDefined();

    // Deuxième appel immédiat : doit être rejeté.
    await expect(resolveLoginStateHandler(makeRequest(uid))).rejects.toMatchObject(
      { code: "resource-exhausted" } satisfies Partial<HttpsError>
    );
  });

  it("Schema version incorrect : rejet avec failed-precondition", async () => {
    // Document joueur avec schemaVersion obsolète.
    const uid = "test-user-6";
    await createTestPlayer(uid, { schemaVersion: 0 });

    await expect(resolveLoginStateHandler(makeRequest(uid))).rejects.toMatchObject(
      { code: "failed-precondition" } satisfies Partial<HttpsError>
    );
  });

  it("CRITIQUE — deux logins successifs ne dupliquent pas la production", async () => {
    // Régression du bug corrigé en d5da2c6.
    // Avant le fix, startedAt était utilisé comme référence à chaque calcul,
    // ce qui recalculait les cycles déjà comptés au login précédent.
    //
    // Scénario : slot démarré 30 min avant le login 1.
    // Login 1 → 1 cycle produit → lastProcessedAt = now_1.
    // Login 2 (quelques secondes plus tard) → 0 cycle supplémentaire (elapsed < 20 min).
    // Total attendu : 1 log, pas 2.
    const uid = "test-user-7";
    const THIRTY_MIN_MS = 30 * 60 * 1000;

    await createTestPlayer(uid, {
      inventory: {
        logs:               { quantity: 0, cap: 50 },
        planks:             { quantity: 0, cap: 30 },
        reconstructionKits: { quantity: 0, cap: 10 },
      },
    });
    await createTestBuilding(uid, [
      makeActiveSlot(0, "logs", THIRTY_MIN_MS),
    ]);

    // Login 1 — produit 1 log.
    const result1 = await resolveLoginStateHandler(makeRequest(uid));
    expect(result1.player.inventory.logs.quantity).toBe(1);

    // Neutralise le rate limit pour permettre un second appel immédiat (pattern D-ETAPE16.5).
    await db.collection("rateLimits").doc(`${uid}_resolveLoginState`).delete();

    // Login 2 — aucun cycle supplémentaire depuis le login 1 (< 20 min).
    const result2 = await resolveLoginStateHandler(makeRequest(uid));
    expect(result2.player.inventory.logs.quantity).toBe(1); // toujours 1, pas 2

    // Vérification directe dans Firestore : l'inventaire persisté est correct.
    const playerSnap = await db.collection("players").doc(uid).get();
    expect(playerSnap.data()?.inventory.logs.quantity).toBe(1);
  });

});
