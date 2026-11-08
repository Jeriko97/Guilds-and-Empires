import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { stopProductionSlotHandler } from "../production/stopProductionSlot";
import type { StopProductionSlotRequest } from "../production/stopProductionSlot";
import { collectProductionHandler } from "../production/collectProduction";
import type { CollectProductionRequest } from "../production/collectProduction";
import { ALERTE_SLOT_CORROMPU, CHAMP_ALERTE } from "../shared/alertes";
import { RECIPES } from "../shared/recipes";
import { MAX_DOCUMENT_ID_BYTES } from "../shared/validators";
import type { InventoryState, ProductionSlotState } from "../shared/types";
import {
  clearTestData,
  db,
  makeRequest,
  makeUnauthRequest,
  createTestPlayer,
  createTestBuilding,
  makeIdleSlot,
} from "./helpers";

// ── Constantes de test ────────────────────────────────────────────────────────

const LOG_DURATION_MS    = RECIPES["logs"].durationMs;                // 20 min
const PLANKS_DURATION_MS = RECIPES["planks"].durationMs;              // 25 min
const KITS_DURATION_MS   = RECIPES["reconstruction_kits"].durationMs; // 60 min
const PLANKS_INPUT_LOGS  = RECIPES["planks"].inputs!["logs"]!;                // 2
const KITS_INPUT_PLANKS  = RECIPES["reconstruction_kits"].inputs!["planks"]!; // 3

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

/**
 * Instant fixe de l'arrêt : horloge contrôlée (Timestamp.now() espionné, renvoie toujours NOW_MS).
 * Pris au chargement du module, puis figé : le rate limit compare Timestamp.now() au
 * serverTimestamp() réel de l'appel précédent, il doit rester dans la même fenêtre de temps.
 */
const NOW_MS = Date.now();

const FREED_SLOT = (slotIndex: 0 | 1 | 2): ProductionSlotState => ({
  slotIndex, recipeId: null, startedAt: null, lastProcessedAt: null, cyclesPlanned: null, cyclesProcessed: null,
});

// ── Helpers locaux ────────────────────────────────────────────────────────────

/** StopProductionSlotRequest authentifié ; idempotencyKey : UUID neuf si absent. */
function makeStopRequest(
  uid: string,
  data: { buildingId?: unknown; slotIndex?: unknown; idempotencyKey?: unknown }
): StopProductionSlotRequest {
  const base = makeRequest(uid);
  return {
    data: {
      buildingId:     "buildingId" in data ? data.buildingId : "sawmill_0",
      slotIndex:      data.slotIndex,
      idempotencyKey: "idempotencyKey" in data ? data.idempotencyKey : randomUUID(),
    },
    auth:             base.auth,
    rawRequest:       base.rawRequest,
    acceptsStreaming: base.acceptsStreaming,
  };
}

function makeCollectRequest(uid: string): CollectProductionRequest {
  const base = makeRequest(uid);
  return { data: { buildingId: "sawmill_0" }, auth: base.auth, rawRequest: base.rawRequest, acceptsStreaming: base.acceptsStreaming };
}

/** Slot de lot lancé à NOW_MS − startedAgoMs. */
function batchSlot(
  slotIndex: 0 | 1 | 2,
  recipeId: "planks" | "reconstruction_kits",
  startedAgoMs: number,
  cyclesPlanned: number,
  cyclesProcessed = 0,
  lastProcessedAgoMs: number | null = null,
): ProductionSlotState {
  return {
    slotIndex,
    recipeId,
    startedAt:       admin.firestore.Timestamp.fromMillis(NOW_MS - startedAgoMs),
    lastProcessedAt: lastProcessedAgoMs === null ? null : admin.firestore.Timestamp.fromMillis(NOW_MS - lastProcessedAgoMs),
    cyclesPlanned,
    cyclesProcessed,
  };
}

function logsSlot(slotIndex: 0 | 1 | 2, startedAgoMs: number): ProductionSlotState {
  return {
    slotIndex,
    recipeId:        "logs",
    startedAt:       admin.firestore.Timestamp.fromMillis(NOW_MS - startedAgoMs),
    lastProcessedAt: null,
  };
}

function inventory(logs: number, planks: number, kits = 0, caps = { logs: 50, planks: 30, kits: 10 }): InventoryState {
  return {
    logs:               { quantity: logs,   cap: caps.logs },
    planks:             { quantity: planks, cap: caps.planks },
    reconstructionKits: { quantity: kits,   cap: caps.kits },
  };
}

async function readPlayer(uid: string) {
  return (await db.collection("players").doc(uid).get()).data();
}

async function readSlots(uid: string): Promise<ProductionSlotState[]> {
  return (await db.collection("players").doc(uid).collection("buildings").doc("sawmill_0").get()).data()?.slots;
}

function opRef(uid: string, key: string) {
  return db.collection("players").doc(uid).collection("productionOps").doc(key);
}

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
  await db.collection("rateLimits").doc(`${uid}_stopProductionSlot`).delete();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let nowSpy: jest.SpyInstance;

beforeEach(async () => {
  await Promise.all([clearTestData(), clearProductionOps()]);
  // Horloge contrôlée : chaque Timestamp.now() du code testé renvoie NOW_MS.
  nowSpy = jest.spyOn(admin.firestore.Timestamp, "now")
    .mockImplementation(() => admin.firestore.Timestamp.fromMillis(NOW_MS));
});

afterEach(() => {
  nowSpy.mockRestore();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("stopProductionSlot", () => {

  describe("effets de l'arrêt (horloge contrôlée)", () => {

    it("Lot en cours : cycles terminés crédités, cycle en cours perdu, cycles non commencés rendus, slot libéré, trace écrite", async () => {
      // Lot de 10 planks, 3 cycles terminés et 40 % du 4e : 3 crédités, 1 perdu, 6 rendus.
      const uid = "stop-batch-running";
      const key = randomUUID();
      await createTestPlayer(uid, { inventory: inventory(10, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 3.4 * PLANKS_DURATION_MS, 10), makeIdleSlot(1), makeIdleSlot(2)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key }));

      expect(result.alreadyApplied).toBe(false);
      expect(result.collected).toEqual({ planks: 3 });
      expect(result.discarded).toEqual({ planks: 0 });
      expect(result.refunded).toEqual({ logs: 6 * PLANKS_INPUT_LOGS });
      expect(result.refundDiscarded).toEqual({ logs: 0 });

      const player = await readPlayer(uid);
      expect(player?.inventory.planks.quantity).toBe(3);
      expect(player?.inventory.logs.quantity).toBe(10 + 6 * PLANKS_INPUT_LOGS); // 22
      const slots = await readSlots(uid);
      expect(slots[0]).toEqual(FREED_SLOT(0));
      expect(result.building.slots[0]).toEqual(FREED_SLOT(0));
      expect(result.inventory).toEqual(player?.inventory);

      const op = (await opRef(uid, key).get()).data();
      expect(op).toMatchObject({ uid, op: "stop", buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks" });
      expect(op?.createdAt.toMillis()).toBe(NOW_MS);
    });

    it("Lot déjà partiellement collecté : la référence est lastProcessedAt, cyclesProcessed compté", async () => {
      // Kits, N = 5, 2 déjà traités ; 1 cycle terminé depuis la dernière collecte + un cycle en cours.
      // Rendu : 5 − (2 + 1) − 1 = 1 cycle.
      const uid = "stop-batch-partial";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [
        batchSlot(1, "reconstruction_kits", 3.5 * KITS_DURATION_MS, 5, 2, 1.5 * KITS_DURATION_MS),
      ]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1 }));

      expect(result.collected).toEqual({ reconstructionKits: 1 });
      expect(result.refunded).toEqual({ planks: 1 * KITS_INPUT_PLANKS });
      const player = await readPlayer(uid);
      expect(player?.inventory.reconstructionKits.quantity).toBe(1);
      expect(player?.inventory.planks.quantity).toBe(KITS_INPUT_PLANKS);
    });

    it("Lot écoulé mais pas collecté : tout est crédité, rien n'est rendu, slot libéré", async () => {
      const uid = "stop-batch-elapsed";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 50 * PLANKS_DURATION_MS, 4)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      expect(result.collected).toEqual({ planks: 4 });
      expect(result.refunded).toEqual({});
      expect(result.refundDiscarded).toEqual({});
      const player = await readPlayer(uid);
      expect(player?.inventory.planks.quantity).toBe(4);
      expect(player?.inventory.logs.quantity).toBe(0);
      expect((await readSlots(uid))[0]).toEqual(FREED_SLOT(0));
    });

    it("Arrêt pile en fin de cycle : le cycle suivant compte comme commencé et il est perdu (règle 19.0)", async () => {
      // N = 6, exactement 2 cycles écoulés : 2 crédités, le 3e perdu, 3 rendus (pas 4).
      const uid = "stop-batch-cycle-boundary";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 2 * PLANKS_DURATION_MS, 6)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      expect(result.collected).toEqual({ planks: 2 });
      expect(result.refunded).toEqual({ logs: (6 - 2 - 1) * PLANKS_INPUT_LOGS });
      const player = await readPlayer(uid);
      expect(player?.inventory.logs.quantity).toBe(3 * PLANKS_INPUT_LOGS);
    });

    it("Arrêt immédiat (aucun cycle terminé) : le premier cycle est perdu, N − 1 cycles rendus", async () => {
      const uid = "stop-batch-immediate";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 0, 24)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      expect(result.collected).toEqual({});
      expect(result.refunded).toEqual({ logs: 23 * PLANKS_INPUT_LOGS });
      expect((await readPlayer(uid))?.inventory.logs.quantity).toBe(46);
    });

    it("Saturation au crédit : les cycles terminés comptent, la production au-delà du plafond est perdue", async () => {
      // Planks à 29/30, 3 cycles terminés : 1 crédité, 2 perdus ; N = 8 → 8 − 3 − 1 = 4 rendus.
      const uid = "stop-batch-saturated";
      await createTestPlayer(uid, { inventory: inventory(0, 29) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 3.5 * PLANKS_DURATION_MS, 8)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      expect(result.collected).toEqual({ planks: 1 });
      expect(result.discarded).toEqual({ planks: 2 });
      expect(result.refunded).toEqual({ logs: 4 * PLANKS_INPUT_LOGS });
      const player = await readPlayer(uid);
      expect(player?.inventory.planks.quantity).toBe(30);
      expect(player?.inventory.logs.quantity).toBe(8);
    });

    it("Remboursement limité au plafond : l'excédent est perdu (décision founder)", async () => {
      // Logs à 45/50, 10 cycles de planks à rendre (20 logs dus) : 5 rendus, 15 perdus.
      const uid = "stop-refund-capped";
      await createTestPlayer(uid, { inventory: inventory(45, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 0.5 * PLANKS_DURATION_MS, 11)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      expect(result.refunded).toEqual({ logs: 5 });
      expect(result.refundDiscarded).toEqual({ logs: 10 * PLANKS_INPUT_LOGS - 5 });
      expect((await readPlayer(uid))?.inventory.logs.quantity).toBe(50);
    });

    it("Lot de kits : planks rendus limités au plafond des planks, l'excédent est perdu", async () => {
      const uid = "stop-refund-capped-kits";
      await createTestPlayer(uid, { inventory: inventory(0, 28, 0) });
      await createTestBuilding(uid, [batchSlot(0, "reconstruction_kits", 1.5 * KITS_DURATION_MS, 5)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      // 1 kit crédité ; 5 − 1 − 1 = 3 cycles rendus = 9 planks dus, place 2 → 2 rendus, 7 perdus.
      expect(result.collected).toEqual({ reconstructionKits: 1 });
      expect(result.refunded).toEqual({ planks: 2 });
      expect(result.refundDiscarded).toEqual({ planks: 3 * KITS_INPUT_PLANKS - 2 });
      const player = await readPlayer(uid);
      expect(player?.inventory.planks.quantity).toBe(30);
      expect(player?.inventory.reconstructionKits.quantity).toBe(1);
    });

    it("Slot de logs : cycles terminés crédités, cycle en cours perdu, rien rendu, slot libéré", async () => {
      const uid = "stop-logs";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [logsSlot(0, 4.7 * LOG_DURATION_MS), makeIdleSlot(1), makeIdleSlot(2)]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));

      expect(result.collected).toEqual({ logs: 4 });
      expect(result.refunded).toEqual({});
      expect(result.refundDiscarded).toEqual({});
      expect((await readPlayer(uid))?.inventory.logs.quantity).toBe(4);
      expect((await readSlots(uid))[0]).toEqual(FREED_SLOT(0));
    });
  });

  describe("règlement de tous les slots avant l'arrêt (D-ETAPE19-007)", () => {

    it("Logs voisin non collecté : sa production est créditée d'abord, le remboursement est plafonné sur le stock réglé", async () => {
      // Logs 40/50 ; voisin : 6 cycles terminés → 46. Lot de planks N = 5 arrêté sans cycle terminé :
      // 5 − 0 − 1 = 4 cycles à rendre = 8 logs dus, 4 de place → 4 rendus, 4 perdus.
      // (Ancien calcul : 8 rendus, puis 4 des 6 logs du voisin perdus à la collecte suivante.)
      const uid = "stop-settle-logs";
      await createTestPlayer(uid, { inventory: inventory(40, 0) });
      await createTestBuilding(uid, [
        logsSlot(0, 6.5 * LOG_DURATION_MS),
        batchSlot(1, "planks", 0.5 * PLANKS_DURATION_MS, 5),
        makeIdleSlot(2),
      ]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1 }));

      expect(result.collected).toEqual({ logs: 6 });
      expect(result.discarded).toEqual({ logs: 0 });
      expect(result.refunded).toEqual({ logs: 4 });
      expect(result.refundDiscarded).toEqual({ logs: 4 * PLANKS_INPUT_LOGS - 4 });

      const player = await readPlayer(uid);
      expect(player?.inventory.logs.quantity).toBe(50);
      const slots = await readSlots(uid);
      // Voisin réglé comme par une collecte : référence avancée de 6 cycles, slot toujours actif.
      expect(slots[0].recipeId).toBe("logs");
      expect(slots[0].lastProcessedAt?.toMillis()).toBe(NOW_MS - 6.5 * LOG_DURATION_MS + 6 * LOG_DURATION_MS);
      expect(slots[1]).toEqual(FREED_SLOT(1));
      // La réponse reflète l'état écrit après le règlement complet.
      expect(result.inventory).toEqual(player?.inventory);
      expect(result.building.slots).toEqual(slots);
    });

    it("Planks voisin d'indice inférieur : crédité d'abord (ordre du tableau), le crédit du lot arrêté est limité sur le stock réglé", async () => {
      // Planks 26/30. Slot 0 (voisin, N = 10) : 3 cycles → 29. Slot 1 (arrêté, N = 6) : 2 cycles,
      // 1 crédité, 1 perdu à saturation → 30. Rendu : 6 − 2 − 1 = 3 cycles = 6 logs.
      const uid = "stop-settle-planks";
      await createTestPlayer(uid, { inventory: inventory(0, 26) });
      await createTestBuilding(uid, [
        batchSlot(0, "planks", 3.5 * PLANKS_DURATION_MS, 10),
        batchSlot(1, "planks", 2.5 * PLANKS_DURATION_MS, 6),
        makeIdleSlot(2),
      ]);

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1 }));

      expect(result.collected).toEqual({ planks: 4 });
      expect(result.discarded).toEqual({ planks: 1 });
      expect(result.refunded).toEqual({ logs: 3 * PLANKS_INPUT_LOGS });
      expect(result.refundDiscarded).toEqual({ logs: 0 });

      const player = await readPlayer(uid);
      expect(player?.inventory.planks.quantity).toBe(30);
      expect(player?.inventory.logs.quantity).toBe(3 * PLANKS_INPUT_LOGS);
      const slots = await readSlots(uid);
      // Voisin réglé, non libéré : 3 cycles traités sur 10.
      expect(slots[0].recipeId).toBe("planks");
      expect(slots[0].cyclesProcessed).toBe(3);
      expect(slots[0].lastProcessedAt?.toMillis()).toBe(NOW_MS - 3.5 * PLANKS_DURATION_MS + 3 * PLANKS_DURATION_MS);
      expect(slots[1]).toEqual(FREED_SLOT(1));
      expect(result.inventory).toEqual(player?.inventory);
      expect(result.building.slots).toEqual(slots);
    });

    it("Slot voisin corrompu (lot épuisé non libéré) → data-loss, journalisé avec les deux slots, rien n'est écrit", async () => {
      const uid = "stop-settle-corrupt";
      const key = randomUUID();
      const slots = [
        batchSlot(0, "planks", 3 * PLANKS_DURATION_MS, 2, 2), // voisin corrompu
        batchSlot(1, "planks", 2.5 * PLANKS_DURATION_MS, 6),  // arrêté
      ];
      await createTestPlayer(uid, { inventory: inventory(10, 0) });
      await createTestBuilding(uid, slots);
      const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);

      try {
        const appel = stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1, idempotencyKey: key }));
        await expect(appel)
          .rejects.toMatchObject({ code: "data-loss" } satisfies Partial<HttpsError>);
        // TD-021 (19.5a) : marqueur d'alerte et code de l'HttpsError renvoyée (même appel, pas de second appel).
        const renvoyee = (await appel.catch((err: unknown) => err)) as HttpsError;
        expect(errorSpy).toHaveBeenCalledWith(
          "stopProductionSlot: état de slot corrompu",
          expect.objectContaining({ [CHAMP_ALERTE]: ALERTE_SLOT_CORROMPU, code: renvoyee.code }),
        );
        expect(errorSpy).toHaveBeenCalledWith(
          "stopProductionSlot: état de slot corrompu",
          expect.objectContaining({
            uid, buildingId: "sawmill_0", reason: "corrupt-slot", slotIndex: 0, stoppedSlotIndex: 1,
            motif: expect.stringMatching(/lot épuisé/),
          }),
        );
      } finally {
        errorSpy.mockRestore();
      }
      expect(await readSlots(uid)).toEqual(slots);
      expect((await readPlayer(uid))?.inventory).toEqual(inventory(10, 0));
      expect((await opRef(uid, key).get()).exists).toBe(false);
    });

    it("Slot voisin occupé sans startedAt → data-loss, journalisé avec les deux slots, rien n'est écrit", async () => {
      const uid = "stop-settle-no-startedat";
      const key = randomUUID();
      const slots = [
        { ...logsSlot(0, 3 * LOG_DURATION_MS), startedAt: null }, // voisin corrompu (D-ETAPE19-006)
        batchSlot(1, "planks", 2.5 * PLANKS_DURATION_MS, 6),      // arrêté
      ];
      await createTestPlayer(uid, { inventory: inventory(10, 0) });
      await createTestBuilding(uid, slots);
      const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);

      try {
        const appel = stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1, idempotencyKey: key }));
        await expect(appel)
          .rejects.toMatchObject({ code: "data-loss" } satisfies Partial<HttpsError>);
        // TD-021 (19.5a) : marqueur d'alerte et code de l'HttpsError renvoyée (même appel, pas de second appel).
        const renvoyee = (await appel.catch((err: unknown) => err)) as HttpsError;
        expect(errorSpy).toHaveBeenCalledWith(
          "stopProductionSlot: état de slot corrompu",
          expect.objectContaining({ [CHAMP_ALERTE]: ALERTE_SLOT_CORROMPU, code: renvoyee.code }),
        );
        expect(errorSpy).toHaveBeenCalledWith(
          "stopProductionSlot: état de slot corrompu",
          expect.objectContaining({
            uid, buildingId: "sawmill_0", reason: "corrupt-slot", slotIndex: 0, stoppedSlotIndex: 1,
            motif: expect.stringMatching(/sans startedAt/),
          }),
        );
      } finally {
        errorSpy.mockRestore();
      }
      expect(await readSlots(uid)).toEqual(slots);
      expect((await readPlayer(uid))?.inventory).toEqual(inventory(10, 0));
      expect((await opRef(uid, key).get()).exists).toBe(false);
    });

    it("Slot voisin de recette inconnue → internal, journalisé, rien n'est écrit", async () => {
      const uid = "stop-settle-unknown";
      const key = randomUUID();
      const slots = [
        { ...logsSlot(0, LOG_DURATION_MS), recipeId: "dragon_scales" as unknown as "logs" },
        batchSlot(1, "planks", 2.5 * PLANKS_DURATION_MS, 6),
      ];
      await createTestPlayer(uid, { inventory: inventory(10, 0) });
      await createTestBuilding(uid, slots);
      const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);

      try {
        await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1, idempotencyKey: key })))
          .rejects.toMatchObject({ code: "internal", message: "Erreur interne du serveur." } satisfies Partial<HttpsError>);
        expect(errorSpy).toHaveBeenCalledWith("stopProductionSlot: erreur inattendue", expect.objectContaining({ uid }));
      } finally {
        errorSpy.mockRestore();
      }
      expect(await readSlots(uid)).toEqual(slots);
      expect((await readPlayer(uid))?.inventory).toEqual(inventory(10, 0));
      expect((await opRef(uid, key).get()).exists).toBe(false);
    });

    it("Rejeu d'un arrêt avec voisin réglé : alreadyApplied, aucun double crédit du voisin", async () => {
      const uid = "stop-settle-replay";
      const key = randomUUID();
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [
        logsSlot(0, 6.5 * LOG_DURATION_MS),
        batchSlot(1, "planks", 0.5 * PLANKS_DURATION_MS, 5),
      ]);

      const first = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1, idempotencyKey: key }));
      const playerAfterFirst = await readPlayer(uid);
      const slotsAfterFirst = await readSlots(uid);
      await resetRateLimit(uid);
      const second = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1, idempotencyKey: key }));

      expect(first.collected).toEqual({ logs: 6 });
      expect(second.alreadyApplied).toBe(true);
      expect(second.collected).toEqual({});
      expect(await readPlayer(uid)).toEqual(playerAfterFirst);
      expect(await readSlots(uid)).toEqual(slotsAfterFirst);
      expect(playerAfterFirst?.inventory.logs.quantity).toBe(6 + 4 * PLANKS_INPUT_LOGS);
    });
  });

  describe("refus", () => {

    it("Slot libre sans trace → failed-precondition, aucune trace écrite", async () => {
      const uid = "stop-free-slot";
      const key = randomUUID();
      await createTestPlayer(uid);
      await createTestBuilding(uid, [makeIdleSlot(0), makeIdleSlot(1), makeIdleSlot(2)]);

      await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key })))
        .rejects.toMatchObject({ code: "failed-precondition" } satisfies Partial<HttpsError>);
      expect((await opRef(uid, key).get()).exists).toBe(false);
    });

    it("Non authentifié → unauthenticated", async () => {
      await expect(stopProductionSlotHandler(makeUnauthRequest() as unknown as StopProductionSlotRequest))
        .rejects.toMatchObject({ code: "unauthenticated" } satisfies Partial<HttpsError>);
    });

    it("Rate limit : deuxième appel rapide → resource-exhausted", async () => {
      const uid = "stop-rate-limit";
      await createTestPlayer(uid);
      await createTestBuilding(uid, [batchSlot(0, "planks", 0, 2), batchSlot(1, "planks", 0, 2)]);

      await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 }));
      await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 1 })))
        .rejects.toMatchObject({ code: "resource-exhausted" } satisfies Partial<HttpsError>);
    });

    it.each([
      ["buildingId vide", { buildingId: "  ", slotIndex: 0 }],
      ["buildingId absent", { buildingId: undefined, slotIndex: 0 }],
      ["buildingId avec slash", { buildingId: "bad/key", slotIndex: 0 }],
      ["buildingId point-point", { buildingId: "..", slotIndex: 0 }],
      ["buildingId nom réservé", { buildingId: "__x__", slotIndex: 0 }],
      ["slotIndex hors bornes", { slotIndex: 3 }],
      ["slotIndex chaîne", { slotIndex: "0" }],
      ["idempotencyKey absente", { slotIndex: 0, idempotencyKey: undefined }],
      ["idempotencyKey avec slash", { slotIndex: 0, idempotencyKey: "bad/key" }],
      ["idempotencyKey pas un UUID", { slotIndex: 0, idempotencyKey: "key-stop-1" }],
    ])("%s → invalid-argument, slot inchangé", async (label, data) => {
      const uid = `stop-invalid-${label.replace(/[^a-z0-9]/gi, "")}`;
      const slot = batchSlot(0, "planks", 0, 2);
      await createTestPlayer(uid);
      await createTestBuilding(uid, [slot]);

      await expect(stopProductionSlotHandler(makeStopRequest(uid, data)))
        .rejects.toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
      expect((await readSlots(uid))[0]).toEqual(slot);
    });

    it("Joueur absent → not-found", async () => {
      await expect(stopProductionSlotHandler(makeStopRequest("stop-no-player", { slotIndex: 0 })))
        .rejects.toMatchObject({ code: "not-found" } satisfies Partial<HttpsError>);
    });

    it("Bâtiment absent → not-found", async () => {
      const uid = "stop-no-building";
      await createTestPlayer(uid);
      await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 })))
        .rejects.toMatchObject({ code: "not-found" } satisfies Partial<HttpsError>);
    });

    it("Slot absent du bâtiment → not-found", async () => {
      const uid = "stop-no-slot";
      await createTestPlayer(uid);
      await createTestBuilding(uid, [makeIdleSlot(0)]);
      await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 2 })))
        .rejects.toMatchObject({ code: "not-found" } satisfies Partial<HttpsError>);
    });

    it.each([
      ["slot hérité (planks sans cyclesPlanned)",
        (): ProductionSlotState => ({ ...logsSlot(0, 3 * PLANKS_DURATION_MS), recipeId: "planks" }), /hérité/],
      ["lot corrompu (cyclesProcessed ≥ cyclesPlanned)",
        (): ProductionSlotState => batchSlot(0, "planks", 3 * PLANKS_DURATION_MS, 2, 2), /lot épuisé/],
    ])("%s → data-loss, journalisé, rien n'est écrit", async (label, makeSlot, motif) => {
      const uid = `stop-corrupt-${label.slice(0, 10).replace(/[^a-z0-9]/gi, "")}`;
      const key = randomUUID();
      const slot = makeSlot();
      await createTestPlayer(uid, { inventory: inventory(10, 0) });
      await createTestBuilding(uid, [slot]);
      const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);

      try {
        const appel = stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key }));
        await expect(appel)
          .rejects.toMatchObject({ code: "data-loss" } satisfies Partial<HttpsError>);
        // TD-021 (19.5a) : marqueur d'alerte et code de l'HttpsError renvoyée (même appel, pas de second appel).
        const renvoyee = (await appel.catch((err: unknown) => err)) as HttpsError;
        expect(errorSpy).toHaveBeenCalledWith(
          "stopProductionSlot: état de slot corrompu",
          expect.objectContaining({ [CHAMP_ALERTE]: ALERTE_SLOT_CORROMPU, code: renvoyee.code }),
        );
        expect(errorSpy).toHaveBeenCalledWith(
          "stopProductionSlot: état de slot corrompu",
          expect.objectContaining({ uid, buildingId: "sawmill_0", reason: "corrupt-slot", slotIndex: 0, motif: expect.stringMatching(motif) }),
        );
      } finally {
        errorSpy.mockRestore();
      }
      expect((await readSlots(uid))[0]).toEqual(slot);
      expect((await readPlayer(uid))?.inventory).toEqual(inventory(10, 0));
      expect((await opRef(uid, key).get()).exists).toBe(false);
    });

    it("Recette inconnue (donnée corrompue) → internal, journalisé", async () => {
      const uid = "stop-unknown-recipe";
      await createTestPlayer(uid);
      await createTestBuilding(uid, [{ ...logsSlot(0, LOG_DURATION_MS), recipeId: "dragon_scales" as unknown as "logs" }]);
      const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);

      try {
        await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 })))
          .rejects.toMatchObject({ code: "internal", message: "Erreur interne du serveur." } satisfies Partial<HttpsError>);
        expect(errorSpy).toHaveBeenCalledWith("stopProductionSlot: erreur inattendue", expect.objectContaining({ uid }));
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe("idempotence", () => {

    it("Rejeu d'un arrêt réussi : alreadyApplied, aucun double crédit ni double remboursement, trace inchangée", async () => {
      const uid = "stop-replay";
      const key = randomUUID();
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 2.5 * PLANKS_DURATION_MS, 6)]);

      const first = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key }));
      const traceAfterFirst = await opRef(uid, key).get();
      const playerAfterFirst = await readPlayer(uid);
      await resetRateLimit(uid);
      const second = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key }));

      expect(first.alreadyApplied).toBe(false);
      expect(first.collected).toEqual({ planks: 2 });
      expect(first.refunded).toEqual({ logs: 3 * PLANKS_INPUT_LOGS });
      expect(second).toEqual({
        collected: {}, discarded: {}, refunded: {}, refundDiscarded: {},
        building: first.building, inventory: first.inventory, alreadyApplied: true,
      });
      expect(await readPlayer(uid)).toEqual(playerAfterFirst);
      const traceAfterSecond = await opRef(uid, key).get();
      expect(traceAfterSecond.updateTime?.isEqual(traceAfterFirst.updateTime!)).toBe(true);
    });

    it("Chemin de la trace (déterministe) : trace d'arrêt posée en base, slot encore occupé → alreadyApplied, slot NON arrêté", async () => {
      // Sans lecture de la trace AVANT les contrôles métier, cet appel arrêterait le slot.
      const uid = "stop-trace-path";
      const key = randomUUID();
      const slot = batchSlot(0, "planks", 2.5 * PLANKS_DURATION_MS, 6);
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [slot]);
      await opRef(uid, key).set({
        uid, op: "stop", buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks",
        createdAt: admin.firestore.Timestamp.fromMillis(NOW_MS - 1000),
      });
      const traceBefore = await opRef(uid, key).get();

      const result = await stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key }));

      expect(result.alreadyApplied).toBe(true);
      expect(result.collected).toEqual({});
      expect((await readSlots(uid))[0]).toEqual(slot);
      expect((await readPlayer(uid))?.inventory).toEqual(inventory(0, 0));
      const traceAfter = await opRef(uid, key).get();
      expect(traceAfter.updateTime?.isEqual(traceBefore.updateTime!)).toBe(true);
    });

    it("Trace identique, bâtiment absent → not-found (comme le lancement)", async () => {
      const uid = "stop-trace-no-building";
      const key = randomUUID();
      await createTestPlayer(uid);
      await opRef(uid, key).set({
        uid, op: "stop", buildingId: "sawmill_0", slotIndex: 0, recipeId: "planks",
        createdAt: admin.firestore.Timestamp.fromMillis(NOW_MS),
      });
      await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key })))
        .rejects.toMatchObject({ code: "not-found" } satisfies Partial<HttpsError>);
    });

    it.each([
      ["autre slot", { op: "stop", slotIndex: 1, buildingId: "sawmill_0", recipeId: "planks" }],
      ["autre bâtiment", { op: "stop", slotIndex: 0, buildingId: "sawmill_9", recipeId: "planks" }],
      ["trace d'un lancement", { op: "start", slotIndex: 0, buildingId: "sawmill_0", recipeId: "planks", cycles: 6 }],
    ])("Même clé, contenu différent (%s) → failed-precondition, slot inchangé", async (label, trace) => {
      const uid = `stop-trace-diff-${label.replace(/[^a-z0-9]/gi, "")}`;
      const key = randomUUID();
      const slot = batchSlot(0, "planks", 2.5 * PLANKS_DURATION_MS, 6);
      await createTestPlayer(uid);
      await createTestBuilding(uid, [slot]);
      await opRef(uid, key).set({ uid, ...trace, createdAt: admin.firestore.Timestamp.fromMillis(NOW_MS) });

      await expect(stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0, idempotencyKey: key })))
        .rejects.toMatchObject({
          code: "failed-precondition",
          message: "idempotency key already used with different payload",
        } satisfies Partial<HttpsError>);
      expect((await readSlots(uid))[0]).toEqual(slot);
    });
  });

  describe("concurrence", () => {

    it("Deux arrêts du même slot avec des clés différentes : un seul crédit, un seul remboursement", async () => {
      const uid = "stop-concurrent-stops";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 2.5 * PLANKS_DURATION_MS, 6)]);

      const results = await Promise.allSettled([
        stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 })),
        stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 })),
      ]);

      // Le refusé l'est par le rate limit (non transactionnel, TD-001) ou par le slot déjà libre.
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") {
          expect(["resource-exhausted", "failed-precondition"]).toContain((r.reason as HttpsError).code);
        }
      }
      const player = await readPlayer(uid);
      expect(player?.inventory.planks.quantity).toBe(2);
      expect(player?.inventory.logs.quantity).toBe(3 * PLANKS_INPUT_LOGS);
      expect((await readSlots(uid))[0]).toEqual(FREED_SLOT(0));
      expect((await db.collection("players").doc(uid).collection("productionOps").get()).size).toBe(1);
    });

    it("Arrêt et collecte en parallèle : production créditée une seule fois", async () => {
      // Actions de rate limit distinctes : les deux transactions s'exécutent réellement en concurrence.
      const uid = "stop-concurrent-collect";
      await createTestPlayer(uid, { inventory: inventory(0, 0) });
      await createTestBuilding(uid, [batchSlot(0, "planks", 2.5 * PLANKS_DURATION_MS, 6)]);

      const [stop, collect] = await Promise.allSettled([
        stopProductionSlotHandler(makeStopRequest(uid, { slotIndex: 0 })),
        collectProductionHandler(makeCollectRequest(uid)),
      ]);

      expect(stop.status).toBe("fulfilled");
      expect(collect.status).toBe("fulfilled");
      const player = await readPlayer(uid);
      // 2 cycles terminés crédités une seule fois, quel que soit l'ordre ; 3 cycles rendus.
      expect(player?.inventory.planks.quantity).toBe(2);
      expect(player?.inventory.logs.quantity).toBe(3 * PLANKS_INPUT_LOGS);
      expect((await readSlots(uid))[0]).toEqual(FREED_SLOT(0));
      const collected = (stop as PromiseFulfilledResult<{ collected: { planks?: number } }>).value.collected.planks ?? 0;
      const collectedByCollect = (collect as PromiseFulfilledResult<{ collected: { planks?: number } }>).value.collected.planks ?? 0;
      expect(collected + collectedByCollect).toBe(2);
    });
  });

  describe("validation de buildingId (D-ETAPE19-007)", () => {

    it.each(INVALID_BUILDING_IDS)("buildingId %s → invalid-argument, message sans la valeur, rien n'est écrit", async (label, buildingId) => {
      const uid = `stop-bid-${label.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
      const slot = batchSlot(0, "planks", 2.5 * PLANKS_DURATION_MS, 6);
      await createTestPlayer(uid, { inventory: inventory(10, 0) });
      await createTestBuilding(uid, [slot]);

      let caught: unknown;
      try {
        await stopProductionSlotHandler(makeStopRequest(uid, { buildingId, slotIndex: 0 }));
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "invalid-argument" } satisfies Partial<HttpsError>);
      expect((caught as HttpsError).message).not.toContain(buildingId);
      expect((await readPlayer(uid))?.inventory).toEqual(inventory(10, 0));
      expect(await readSlots(uid)).toEqual([slot]);
      expect((await db.collection("players").doc(uid).collection("productionOps").get()).size).toBe(0);
    });

    it.each(LIMIT_BUILDING_IDS)("buildingId à la limite (%s) → accepté par la validation, bâtiment introuvable", async (label, buildingId) => {
      const uid = `stop-bid-${label.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
      await createTestPlayer(uid);
      await expect(stopProductionSlotHandler(makeStopRequest(uid, { buildingId, slotIndex: 0 })))
        .rejects.toMatchObject({ code: "not-found", message: `Bâtiment '${buildingId}' introuvable pour ce joueur.` } satisfies Partial<HttpsError>);
    });
  });

});
