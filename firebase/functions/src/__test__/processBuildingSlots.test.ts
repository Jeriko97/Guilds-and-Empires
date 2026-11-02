import * as admin from "firebase-admin";

import { processBuildingSlots } from "../shared/production";
import { RECIPES, PLANKS_MAX_BATCH_CYCLES, KITS_MAX_BATCH_CYCLES } from "../shared/recipes";
import type { BuildingDocument, InventoryState, ProductionSlotState } from "../shared/types";

// Admin initialisé sans connexion Firestore — Timestamp est une classe utilitaire pure.
if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-guilds-empires" });
}

// ── Constantes ────────────────────────────────────────────────────────────────

const LOG_DURATION_MS = RECIPES["logs"].durationMs; // 20 min
const LOG_OUTPUT_QTY  = RECIPES["logs"].outputQty;  // 1
const PLANKS_DURATION_MS = RECIPES["planks"].durationMs;              // 25 min
const KITS_DURATION_MS   = RECIPES["reconstruction_kits"].durationMs; // 60 min

// ── Factories ─────────────────────────────────────────────────────────────────

function makeInventory(
  logs:   { quantity: number; cap: number } = { quantity: 0, cap: 50 },
  planks: { quantity: number; cap: number } = { quantity: 0, cap: 30 },
  kits:   { quantity: number; cap: number } = { quantity: 0, cap: 10 },
): InventoryState {
  return { logs, planks, reconstructionKits: kits };
}

function makeBuilding(slots: ProductionSlotState[]): BuildingDocument {
  return { buildingType: "sawmill", level: 1, slots };
}

/** Crée un slot actif avec startedAt et lastProcessedAt exprimés en millisecondes absolus. */
function makeSlot(
  slotIndex: 0 | 1 | 2,
  recipeId: "logs" | "planks" | "reconstruction_kits",
  startedAtMs: number,
  lastProcessedAtMs: number | null = null,
): ProductionSlotState {
  return {
    slotIndex,
    recipeId,
    startedAt: admin.firestore.Timestamp.fromMillis(startedAtMs),
    lastProcessedAt: lastProcessedAtMs !== null
      ? admin.firestore.Timestamp.fromMillis(lastProcessedAtMs)
      : null,
  };
}

/** Slot de lot (ÉTAPE 19.1) : cyclesPlanned = N, cyclesProcessed déjà traités. */
function makeBatchSlot(
  slotIndex: 0 | 1 | 2,
  recipeId: "planks" | "reconstruction_kits",
  startedAtMs: number,
  cyclesPlanned: number,
  cyclesProcessed = 0,
  lastProcessedAtMs: number | null = null,
): ProductionSlotState {
  return { ...makeSlot(slotIndex, recipeId, startedAtMs, lastProcessedAtMs), cyclesPlanned, cyclesProcessed };
}

/** Slot libre attendu après la fin d'un lot. */
const FREED = { recipeId: null, startedAt: null, lastProcessedAt: null, cyclesPlanned: null, cyclesProcessed: null };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("processBuildingSlots (unit — sans Emulator)", () => {

  const createTs = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

  it("1. Calcul correct des cycles complétés", () => {
    // 30 min écoulés, cycle de 20 min → 1 cycle complété → 1 log produit.
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const THIRTY_MIN_MS = 30 * 60 * 1000;

    const building = makeBuilding([
      makeSlot(0, "logs", nowMs - THIRTY_MIN_MS),
    ]);
    const inventory = makeInventory();

    const result = processBuildingSlots(building, inventory, now, createTs);

    const expectedCycles = Math.floor(THIRTY_MIN_MS / LOG_DURATION_MS); // 1
    const expectedYield  = expectedCycles * LOG_OUTPUT_QTY;             // 1

    expect(result.updatedInventory.logs.quantity).toBe(expectedYield);
    expect(result.collected.logs).toBe(expectedYield);
    expect(result.discarded.logs ?? 0).toBe(0);
    // Slot reste actif : recipeId et startedAt inchangés.
    expect(result.updatedSlots[0].recipeId).toBe("logs");
    expect(result.updatedSlots[0].startedAt?.toMillis()).toBe(nowMs - THIRTY_MIN_MS);
  });

  it("2. lastProcessedAt = référence + N×duration, résiduel préservé (TD-004)", () => {
    // 30 min écoulés, cycle de 20 min → 1 cycle → résiduel = 10 min.
    // Fix TD-004 : lastProcessedAt avance de 1 cycle (PAS jusqu'à now).
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const startedAtMs = nowMs - 30 * 60 * 1000;

    const building = makeBuilding([makeSlot(0, "logs", startedAtMs)]);
    const inventory = makeInventory();

    const result = processBuildingSlots(building, inventory, now, createTs);

    // référence (startedAt) + 1 cycle = startedAtMs + 20min (PAS nowMs).
    expect(result.updatedSlots[0].lastProcessedAt?.toMillis()).toBe(startedAtMs + LOG_DURATION_MS);
    expect(result.hasProcessedCycles).toBe(true);
  });

  it("3. Saturation : actualYield + discardedYield == rawYield (invariant)", () => {
    // 6 cycles bruts, cap=5, quantity=2 → availableSpace=3.
    // actualYield=3, discardedYield=3. Somme = 6 = rawYield.
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const SIX_CYCLES_MS = 6 * LOG_DURATION_MS + 1000; // buffer 1s contre les arrondis

    const building = makeBuilding([
      makeSlot(0, "logs", nowMs - SIX_CYCLES_MS),
    ]);
    const inventory = makeInventory({ quantity: 2, cap: 5 });

    const result = processBuildingSlots(building, inventory, now, createTs);

    const rawYield      = 6 * LOG_OUTPUT_QTY;
    const actualYield   = result.collected.logs ?? 0;
    const discardedYield = result.discarded.logs ?? 0;

    expect(actualYield + discardedYield).toBe(rawYield);
    expect(result.updatedInventory.logs.quantity).toBe(5); // clampé au cap
  });

  it("4. Deux slots même ressource : availableSpace décroît entre itérations", () => {
    // cap=10, quantity=0, slot0 produit 6 logs, slot1 produit 6 logs.
    // Après slot0 : updatedInventory.logs=6, availableSpace=4.
    // Slot1 : actualYield=min(6,4)=4, discardedYield=2.
    // Total : collected=10, discarded=2.
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const SIX_CYCLES_MS = 6 * LOG_DURATION_MS + 1000;

    const building = makeBuilding([
      makeSlot(0, "logs", nowMs - SIX_CYCLES_MS),
      makeSlot(1, "logs", nowMs - SIX_CYCLES_MS),
    ]);
    const inventory = makeInventory({ quantity: 0, cap: 10 });

    const result = processBuildingSlots(building, inventory, now, createTs);

    expect(result.collected.logs).toBe(10);
    expect(result.discarded.logs).toBe(2);
    expect(result.updatedInventory.logs.quantity).toBe(10);
  });

  it("5. Pas de mutation des arguments d'entrée (inventory inchangé après l'appel)", () => {
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);

    const building = makeBuilding([
      makeSlot(0, "logs", nowMs - 30 * 60 * 1000),
    ]);
    const inventory = makeInventory();
    const logsQtyBefore = inventory.logs.quantity;        // 0
    const logsCap        = inventory.logs.cap;            // 50

    processBuildingSlots(building, inventory, now, createTs);

    expect(inventory.logs.quantity).toBe(logsQtyBefore);
    expect(inventory.logs.cap).toBe(logsCap);
  });

  it("6. completedCycles == 0 → slot non touché, lastProcessedAt inchangé", () => {
    // 5 min écoulés < 20 min de durée → completedCycles = 0.
    // Le slot est retourné tel quel, lastProcessedAt reste null.
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const FIVE_MIN_MS = 5 * 60 * 1000;

    const building = makeBuilding([
      makeSlot(0, "logs", nowMs - FIVE_MIN_MS),
    ]);
    const inventory = makeInventory();

    const result = processBuildingSlots(building, inventory, now, createTs);

    expect(result.updatedSlots[0].lastProcessedAt).toBeNull();
    expect(result.updatedInventory.logs.quantity).toBe(0);
    expect(result.collected.logs).toBeUndefined();
    expect(result.discarded.logs).toBeUndefined();
    expect(result.hasProcessedCycles).toBe(false);
  });

  it("7. Recipe inconnue → throw Error (pas HttpsError, le handler convertit)", () => {
    // Simule une corruption de données Firestore : recipeId absent de RECIPES.
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);

    const corruptSlot: ProductionSlotState = {
      slotIndex:       0,
      recipeId:        "dragon_scales" as unknown as "logs", // corruption data
      startedAt:       admin.firestore.Timestamp.fromMillis(nowMs - 60 * 60 * 1000),
      lastProcessedAt: null,
    };
    const building = makeBuilding([corruptSlot]);
    const inventory = makeInventory();

    expect(() => processBuildingSlots(building, inventory, now, createTs))
      .toThrow("unknown recipe: dragon_scales");
  });

  it("8. TD-004 — 1 cycle exact : lastProcessedAt = référence + duration, résiduel nul", () => {
    // elapsed = durationMs pile → completedCycles = 1, résiduel = 0.
    // lastProcessedAt devrait égaler exactly nowMs (référence + 1*duration = startedAt + duration = now).
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const startedAtMs = nowMs - LOG_DURATION_MS; // exactement 1 cycle

    const building = makeBuilding([makeSlot(0, "logs", startedAtMs)]);
    const inventory = makeInventory();

    const result = processBuildingSlots(building, inventory, now, createTs);

    expect(result.hasProcessedCycles).toBe(true);
    expect(result.collected.logs).toBe(1);
    expect(result.updatedSlots[0].lastProcessedAt?.toMillis()).toBe(startedAtMs + LOG_DURATION_MS);
  });

  it("9. TD-004 — N cycles + résiduel : lastProcessedAt = référence + N×duration (pas now)", () => {
    // elapsed = 2.5 cycles → completedCycles = 2.
    // Résiduel = 0.5 cycle = durationMs/2 = 10 min.
    // lastProcessedAt doit être référence + 2*duration, PAS now.
    // Ce test est la preuve directe du fix TD-004.
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const HALF_CYCLE_MS = Math.floor(LOG_DURATION_MS / 2);
    const startedAtMs = nowMs - (2 * LOG_DURATION_MS + HALF_CYCLE_MS);

    const building = makeBuilding([makeSlot(0, "logs", startedAtMs)]);
    const inventory = makeInventory();

    const result = processBuildingSlots(building, inventory, now, createTs);

    expect(result.hasProcessedCycles).toBe(true);
    expect(result.collected.logs).toBe(2);

    const expectedLastProcessedAtMs = startedAtMs + 2 * LOG_DURATION_MS;
    expect(result.updatedSlots[0].lastProcessedAt?.toMillis()).toBe(expectedLastProcessedAtMs);

    // Preuve explicite : le résiduel est préservé (non perdu dans `now`).
    const residualMs = nowMs - expectedLastProcessedAtMs;
    expect(residualMs).toBe(HALF_CYCLE_MS);
  });

  it("10. TD-004 — inventaire plein : yield clampé, lastProcessedAt avance de N cycles (Option B)", () => {
    // 3 cycles bruts, cap saturé → actualYield = 0, discardedYield = 3.
    // Fix TD-004 : lastProcessedAt = référence + 3×duration (avance de N, pas K=0 cycles effectifs).
    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.fromMillis(nowMs);
    const THREE_CYCLES_MS = 3 * LOG_DURATION_MS + 1000;
    const startedAtMs = nowMs - THREE_CYCLES_MS;

    const building = makeBuilding([makeSlot(0, "logs", startedAtMs)]);
    const inventory = makeInventory({ quantity: 50, cap: 50 }); // saturé

    const result = processBuildingSlots(building, inventory, now, createTs);

    expect(result.hasProcessedCycles).toBe(true);
    expect(result.collected.logs ?? 0).toBe(0);   // yield clampé à 0
    expect(result.discarded.logs).toBe(3);         // 3 cycles perdus

    // lastProcessedAt avance de 3 cycles (Option B) — PAS de 0 cycle (yield effectif).
    const expectedLastProcessedAtMs = startedAtMs + 3 * LOG_DURATION_MS;
    expect(result.updatedSlots[0].lastProcessedAt?.toMillis()).toBe(expectedLastProcessedAtMs);
  });

  // ── ÉTAPE 19.1 — production par lot (D-ETAPE19-001, 004) ───────────────────
  // Horloge contrôlée : startedAt = T0 fixe, now = T0 + k × durée (+ marge).

  describe("lot de N cycles", () => {
    const T0 = 1_700_000_000_000;
    const at = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

    it("11. Lot complet de planks (24) : 24 crédités, slot libéré, rien au-delà de N", () => {
      const building = makeBuilding([makeBatchSlot(0, "planks", T0, PLANKS_MAX_BATCH_CYCLES)]);
      // 100 cycles écoulés : seuls les 24 du lot comptent.
      const result = processBuildingSlots(building, makeInventory(), at(T0 + 100 * PLANKS_DURATION_MS), createTs);

      expect(result.collected.planks).toBe(PLANKS_MAX_BATCH_CYCLES);
      expect(result.discarded.planks).toBe(0);
      expect(result.updatedInventory.planks.quantity).toBe(PLANKS_MAX_BATCH_CYCLES);
      expect(result.updatedSlots[0]).toEqual({ slotIndex: 0, ...FREED });
      expect(result.hasProcessedCycles).toBe(true);
    });

    it("12. Lot complet de kits (10) : 10 crédités, slot libéré", () => {
      const building = makeBuilding([makeBatchSlot(1, "reconstruction_kits", T0, KITS_MAX_BATCH_CYCLES)]);
      const result = processBuildingSlots(
        building, makeInventory(), at(T0 + KITS_MAX_BATCH_CYCLES * KITS_DURATION_MS + 1), createTs,
      );

      expect(result.collected.reconstructionKits).toBe(KITS_MAX_BATCH_CYCLES);
      expect(result.updatedInventory.reconstructionKits.quantity).toBe(KITS_MAX_BATCH_CYCLES);
      expect(result.updatedSlots[0]).toEqual({ slotIndex: 1, ...FREED });
    });

    it("13. Lot partiel collecté plusieurs fois : 2 puis 3 cycles, résiduel préservé, libéré à la fin", () => {
      const N = 5;
      // 1re collecte : 2 cycles + 10 min.
      const first = processBuildingSlots(
        makeBuilding([makeBatchSlot(0, "planks", T0, N)]),
        makeInventory(),
        at(T0 + 2 * PLANKS_DURATION_MS + 10 * 60 * 1000),
        createTs,
      );
      expect(first.collected.planks).toBe(2);
      expect(first.updatedSlots[0].recipeId).toBe("planks");
      expect(first.updatedSlots[0].cyclesPlanned).toBe(N);
      expect(first.updatedSlots[0].cyclesProcessed).toBe(2);
      expect(first.updatedSlots[0].lastProcessedAt?.toMillis()).toBe(T0 + 2 * PLANKS_DURATION_MS);

      // 2e collecte bien après la fin théorique : 3 cycles restants, puis libération.
      const second = processBuildingSlots(
        makeBuilding(first.updatedSlots), first.updatedInventory, at(T0 + 40 * PLANKS_DURATION_MS), createTs,
      );
      expect(second.collected.planks).toBe(3);
      expect(second.updatedInventory.planks.quantity).toBe(N);
      expect(second.updatedSlots[0]).toEqual({ slotIndex: 0, ...FREED });
    });

    it("14. Pile en fin de lot (temps écoulé = N × durée exactement) : slot libéré", () => {
      const N = 3;
      const result = processBuildingSlots(
        makeBuilding([makeBatchSlot(0, "planks", T0, N)]), makeInventory(), at(T0 + N * PLANKS_DURATION_MS), createTs,
      );
      expect(result.collected.planks).toBe(N);
      expect(result.updatedSlots[0]).toEqual({ slotIndex: 0, ...FREED });
    });

    it("15. Cycle du lot pas encore terminé : slot inchangé", () => {
      const slot = makeBatchSlot(0, "reconstruction_kits", T0, 4);
      const result = processBuildingSlots(
        makeBuilding([slot]), makeInventory(), at(T0 + KITS_DURATION_MS - 1), createTs,
      );
      expect(result.hasProcessedCycles).toBe(false);
      expect(result.updatedSlots[0]).toEqual(slot);
    });

    it("16. Saturation au milieu d'un lot : les cycles comptent, production perdue, slot libéré", () => {
      const N = 5;
      // Planks 28/30 : place pour 2 ; les 5 cycles du lot sont écoulés.
      const result = processBuildingSlots(
        makeBuilding([makeBatchSlot(0, "planks", T0, N)]),
        makeInventory({ quantity: 0, cap: 50 }, { quantity: 28, cap: 30 }),
        at(T0 + N * PLANKS_DURATION_MS + 1),
        createTs,
      );
      expect(result.collected.planks).toBe(2);
      expect(result.discarded.planks).toBe(3);
      expect(result.updatedInventory.planks.quantity).toBe(30);
      expect(result.updatedSlots[0]).toEqual({ slotIndex: 0, ...FREED });
    });

    it("17. Saturation sur une partie du lot : cycles perdus comptés dans cyclesProcessed", () => {
      const N = 6;
      // Planks pleins ; 4 cycles écoulés → 4 cycles traités, tous perdus, slot toujours actif.
      const result = processBuildingSlots(
        makeBuilding([makeBatchSlot(0, "planks", T0, N)]),
        makeInventory({ quantity: 0, cap: 50 }, { quantity: 30, cap: 30 }),
        at(T0 + 4 * PLANKS_DURATION_MS + 1),
        createTs,
      );
      expect(result.collected.planks).toBe(0);
      expect(result.discarded.planks).toBe(4);
      expect(result.updatedSlots[0].cyclesProcessed).toBe(4);
      expect(result.updatedSlots[0].recipeId).toBe("planks");
    });

    it("18. Logs inchangés : production continue, slot toujours actif après 100 cycles, sans champ de lot", () => {
      const result = processBuildingSlots(
        makeBuilding([makeSlot(0, "logs", T0)]),
        makeInventory({ quantity: 0, cap: 1000 }),
        at(T0 + 100 * LOG_DURATION_MS),
        createTs,
      );
      expect(result.collected.logs).toBe(100 * LOG_OUTPUT_QTY);
      expect(result.updatedSlots[0].recipeId).toBe("logs");
      expect(result.updatedSlots[0].lastProcessedAt?.toMillis()).toBe(T0 + 100 * LOG_DURATION_MS);
      expect(result.updatedSlots[0].cyclesPlanned).toBeUndefined();
    });

    it.each(["planks", "reconstruction_kits"] as const)(
      "19. Slot hérité de transformation (%s, sans cyclesPlanned) → throw Error, jamais production continue",
      (recipeId) => {
        const building = makeBuilding([makeSlot(0, recipeId, T0)]);
        expect(() =>
          processBuildingSlots(building, makeInventory(), at(T0 + 10 * KITS_DURATION_MS), createTs)
        ).toThrow(/legacy transformation slot without cyclesPlanned/);
      },
    );
  });

});
