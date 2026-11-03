import * as admin from "firebase-admin";
import { randomUUID } from "crypto";

import { applyTestData, parseTestDataArgs, resolveTargetUid } from "../dev/runEmulatorTestData";
import { startProductionSlotHandler } from "../production/startProductionSlot";
import type { StartProductionSlotRequest } from "../production/startProductionSlot";
import {
  clearTestData, createTestBuilding, createTestPlayer, db, makeActiveSlot, makeIdleSlot, makeRequest,
} from "./helpers";
import type { BuildingDocument, PlayerDocument } from "../shared/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMULATOR_ENV = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
const PROJECT = ["--project", "demo-guilds-empires"];

const playerRef   = (uid: string) => db.collection("players").doc(uid);
const buildingRef = (uid: string, id = "sawmill_0") => playerRef(uid).collection("buildings").doc(id);

async function readBuilding(uid: string): Promise<BuildingDocument> {
  return (await buildingRef(uid).get()).data() as BuildingDocument;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

// TD-006 : l'émulateur ne supprime pas les sous-collections en cascade.
async function clearSubcollections(): Promise<void> {
  const snaps = await Promise.all([db.collectionGroup("buildings").get(), db.collectionGroup("productionOps").get()]);
  const docs = snaps.flatMap((s) => s.docs);
  const batch = db.batch();
  docs.forEach((d) => batch.delete(d.ref));
  if (docs.length > 0) await batch.commit();
}

beforeEach(async () => {
  await Promise.all([clearTestData(), clearSubcollections()]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("emulator:testdata (ÉTAPE 19.4a)", () => {

  // ── A. Garde anti-production (pure) ──────────────────────────────────────

  describe("garde", () => {
    it("1. Sans FIRESTORE_EMULATOR_HOST → refus, quelle que soit la commande", () => {
      const result = parseTestDataArgs([...PROJECT, "set-inventory", "--logs", "10"], {});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/FIRESTORE_EMULATOR_HOST absent/);
    });

    it("2. FIRESTORE_EMULATOR_HOST non local → refus", () => {
      for (const host of ["firestore.googleapis.com:443", "10.0.0.5:8080", "example.test:8080"]) {
        const result = parseTestDataArgs([...PROJECT, "set-inventory", "--logs", "1"], { FIRESTORE_EMULATOR_HOST: host });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/n'est pas local/);
      }
    });

    it("3. Hôtes locaux acceptés : 127.0.0.1, localhost, [::1]", () => {
      for (const host of ["127.0.0.1:8080", "localhost:8080", "[::1]:8080"]) {
        expect(parseTestDataArgs([...PROJECT, "set-inventory", "--logs", "1"], { FIRESTORE_EMULATOR_HOST: host }).ok).toBe(true);
      }
    });

    it("4. --project obligatoire ; variable de projet contradictoire → refus", () => {
      expect(parseTestDataArgs(["set-inventory", "--logs", "1"], EMULATOR_ENV).ok).toBe(false);
      for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
        const result = parseTestDataArgs([...PROJECT, "set-inventory", "--logs", "1"], { ...EMULATOR_ENV, [name]: "autre-projet" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/contredit --project/);
      }
    });

    it("5. Projet hors demo-* refusé même sur l'émulateur ; aucune option ne contourne la garde", () => {
      const prod = parseTestDataArgs(["--project", "guildsandempires-ca543", "set-inventory", "--logs", "1"], EMULATOR_ENV);
      expect(prod.ok).toBe(false);
      if (!prod.ok) expect(prod.error).toMatch(/demo-\* seulement/);
      const result = parseTestDataArgs([...PROJECT, "set-inventory", "--logs", "1", "--confirm-production", "yes"], EMULATOR_ENV);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/inconnue/);
    });
  });

  // ── B. Lecture des arguments (pure) ──────────────────────────────────────

  describe("arguments", () => {
    it("6. set-inventory : quantités lues, clé kits = reconstructionKits ; au moins une ressource", () => {
      const result = parseTestDataArgs([...PROJECT, "set-inventory", "--logs", "12", "--kits", "0"], EMULATOR_ENV);
      expect(result).toEqual({
        ok: true,
        plan: {
          project: "demo-guilds-empires", uid: null, buildingId: "sawmill_0",
          command: { kind: "set-inventory", quantities: { logs: 12, reconstructionKits: 0 } },
        },
      });
      expect(parseTestDataArgs([...PROJECT, "set-inventory"], EMULATOR_ENV).ok).toBe(false);
    });

    it("7. Valeurs invalides → refus (négatif, décimal, slot hors 0-2, minutes 0)", () => {
      const refused = [
        ["set-inventory", "--logs", "-1"],
        ["set-inventory", "--logs", "1.5"],
        ["rewind-slot", "--slot", "3", "--minutes", "10"],
        ["rewind-slot", "--slot", "0", "--minutes", "0"],
        ["rewind-slot", "--slot", "0"],
        ["corrupt-slot"],
        ["start-logs-slot", "--slot", "-1"],
      ];
      for (const args of refused) {
        expect(parseTestDataArgs([...PROJECT, ...args], EMULATOR_ENV).ok).toBe(false);
      }
    });

    it("8. Commande absente, inconnue ou option étrangère à la commande → refus", () => {
      expect(parseTestDataArgs([...PROJECT], EMULATOR_ENV).ok).toBe(false);
      expect(parseTestDataArgs([...PROJECT, "delete-all"], EMULATOR_ENV).ok).toBe(false);
      for (const name of ["constructor", "__proto__", "toString"]) {
        const result = parseTestDataArgs([...PROJECT, name, "--slot", "0"], EMULATOR_ENV);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/Commande inconnue/);
      }
      expect(parseTestDataArgs([...PROJECT, "corrupt-slot", "--slot", "0", "--minutes", "5"], EMULATOR_ENV).ok).toBe(false);
      expect(parseTestDataArgs([...PROJECT, "set-inventory", "--logs"], EMULATOR_ENV).ok).toBe(false);
    });

    it("9. --uid et --building lus ; building par défaut sawmill_0", () => {
      const result = parseTestDataArgs(
        [...PROJECT, "corrupt-slot", "--uid", "u1", "--building", "sawmill_9", "--slot", "2"], EMULATOR_ENV);
      expect(result).toEqual({
        ok: true,
        plan: { project: "demo-guilds-empires", uid: "u1", buildingId: "sawmill_9", command: { kind: "corrupt-slot", slotIndex: 2 } },
      });
    });
  });

  // ── C. Exécution contre l'émulateur ──────────────────────────────────────

  describe("exécution", () => {
    it("10. Joueur visé : --uid, sinon le seul joueur ; zéro ou plusieurs → erreur", async () => {
      await expect(resolveTargetUid(db, null)).rejects.toThrow(/aucun joueur/);
      await createTestPlayer("solo");
      await expect(resolveTargetUid(db, null)).resolves.toBe("solo");
      await expect(resolveTargetUid(db, "explicite")).resolves.toBe("explicite");
      await createTestPlayer("second");
      await expect(resolveTargetUid(db, null)).rejects.toThrow(/2 joueurs/);
    });

    it("11. set-inventory : quantités posées, plafonds et autres ressources inchangés ; l'autre joueur intact", async () => {
      await createTestPlayer("p1");
      await createTestPlayer("p2");
      await applyTestData(db, "p1", "sawmill_0", { kind: "set-inventory", quantities: { logs: 40, planks: 3 } });

      const p1 = (await playerRef("p1").get()).data() as PlayerDocument;
      expect(p1.inventory).toEqual({
        logs:               { quantity: 40, cap: 50 },
        planks:             { quantity: 3,  cap: 30 },
        reconstructionKits: { quantity: 0,  cap: 10 },
      });
      const p2 = (await playerRef("p2").get()).data() as PlayerDocument;
      expect(p2.inventory.logs.quantity).toBe(0);
    });

    it("12. set-inventory au-delà du plafond → erreur, rien d'écrit", async () => {
      await createTestPlayer("p1");
      await expect(
        applyTestData(db, "p1", "sawmill_0", { kind: "set-inventory", quantities: { logs: 10, planks: 31 } })
      ).rejects.toThrow(/dépasse le plafond 30/);
      const p1 = (await playerRef("p1").get()).data() as PlayerDocument;
      expect(p1.inventory.logs.quantity).toBe(0);
    });

    it("13. rewind-slot : startedAt et lastProcessedAt reculés de M minutes, autres slots intacts", async () => {
      await createTestPlayer("p1");
      const lastProcessedAt = admin.firestore.Timestamp.fromMillis(Date.now() - 60_000);
      const before = [makeActiveSlot(0, "logs", 120_000, lastProcessedAt), makeIdleSlot(1), makeActiveSlot(2, "logs", 0)];
      await createTestBuilding("p1", before);

      await applyTestData(db, "p1", "sawmill_0", { kind: "rewind-slot", slotIndex: 0, minutes: 25 });

      const after = (await readBuilding("p1")).slots;
      const shift = 25 * 60_000;
      expect(after[0].startedAt?.toMillis()).toBe((before[0].startedAt as admin.firestore.Timestamp).toMillis() - shift);
      expect(after[0].lastProcessedAt?.toMillis()).toBe(lastProcessedAt.toMillis() - shift);
      expect(after[0].recipeId).toBe("logs");
      expect(after[1]).toEqual(before[1]);
      expect(after[2].startedAt?.toMillis()).toBe((before[2].startedAt as admin.firestore.Timestamp).toMillis());
    });

    it("14. rewind-slot sans lastProcessedAt : seul startedAt bouge", async () => {
      await createTestPlayer("p1");
      const before = [makeActiveSlot(0, "logs", 0)];
      await createTestBuilding("p1", before);
      await applyTestData(db, "p1", "sawmill_0", { kind: "rewind-slot", slotIndex: 0, minutes: 1 });
      const slot = (await readBuilding("p1")).slots[0];
      expect(slot.lastProcessedAt).toBeNull();
      expect(slot.startedAt?.toMillis()).toBe((before[0].startedAt as admin.firestore.Timestamp).toMillis() - 60_000);
    });

    it("15. corrupt-slot : startedAt retiré (null), recette conservée", async () => {
      await createTestPlayer("p1");
      await createTestBuilding("p1", [makeActiveSlot(0, "logs", 0), makeIdleSlot(1)]);
      await applyTestData(db, "p1", "sawmill_0", { kind: "corrupt-slot", slotIndex: 0 });
      const slots = (await readBuilding("p1")).slots;
      expect(slots[0].recipeId).toBe("logs");
      expect(slots[0].startedAt).toBeNull();
      expect(slots[1]).toEqual(makeIdleSlot(1));
    });

    it("16. Slot libre, slot absent ou bâtiment absent → erreur, rien d'écrit", async () => {
      await createTestPlayer("p1");
      await createTestBuilding("p1", [makeIdleSlot(0)]);
      await expect(applyTestData(db, "p1", "sawmill_0", { kind: "corrupt-slot", slotIndex: 0 })).rejects.toThrow(/libre/);
      await expect(applyTestData(db, "p1", "sawmill_0", { kind: "rewind-slot", slotIndex: 0, minutes: 5 })).rejects.toThrow(/libre/);
      await expect(applyTestData(db, "p1", "sawmill_0", { kind: "corrupt-slot", slotIndex: 1 })).rejects.toThrow(/absent/);
      await expect(applyTestData(db, "p1", "autre", { kind: "corrupt-slot", slotIndex: 0 })).rejects.toThrow(/introuvable/);
      expect((await readBuilding("p1")).slots).toEqual([makeIdleSlot(0)]);
    });

    it("17. start-logs-slot : slot libre → logs actif (startedAt ≈ maintenant, sans lot) ; slot occupé → erreur", async () => {
      await createTestPlayer("p1");
      await createTestBuilding("p1", [makeIdleSlot(0), makeActiveSlot(1, "logs", 0)]);
      const before = Date.now();
      await applyTestData(db, "p1", "sawmill_0", { kind: "start-logs-slot", slotIndex: 0 });
      const slot = (await readBuilding("p1")).slots[0];
      expect(slot.recipeId).toBe("logs");
      expect(slot.lastProcessedAt).toBeNull();
      expect(slot.cyclesPlanned).toBeNull();
      expect(slot.cyclesProcessed).toBeNull();
      expect(slot.startedAt?.toMillis()).toBeGreaterThanOrEqual(before - 1_000);
      await expect(applyTestData(db, "p1", "sawmill_0", { kind: "start-logs-slot", slotIndex: 1 })).rejects.toThrow(/déjà occupé/);
    });

    it("18. start-logs-slot écrit la même forme de slot qu'un lancement de logs par startProductionSlot", async () => {
      await createTestPlayer("viaHandler");
      await createTestBuilding("viaHandler", [makeIdleSlot(0)]);
      const base = makeRequest("viaHandler");
      const request: StartProductionSlotRequest = {
        data:             { buildingId: "sawmill_0", slotIndex: 0, recipeId: "logs", idempotencyKey: randomUUID() },
        auth:             base.auth,
        rawRequest:       base.rawRequest,
        acceptsStreaming: base.acceptsStreaming,
      };
      await startProductionSlotHandler(request);
      await createTestPlayer("viaScript");
      await createTestBuilding("viaScript", [makeIdleSlot(0)]);
      await applyTestData(db, "viaScript", "sawmill_0", { kind: "start-logs-slot", slotIndex: 0 });

      const viaHandler = (await readBuilding("viaHandler")).slots[0];
      const viaScript  = (await readBuilding("viaScript")).slots[0];
      expect(Object.keys(viaScript).sort()).toEqual(Object.keys(viaHandler).sort());
      const { startedAt: handlerStartedAt, ...handlerRest } = viaHandler;
      const { startedAt: scriptStartedAt, ...scriptRest } = viaScript;
      expect(scriptRest).toEqual(handlerRest);
      expect(handlerStartedAt).toBeInstanceOf(admin.firestore.Timestamp);
      expect(scriptStartedAt).toBeInstanceOf(admin.firestore.Timestamp);
    });
  });
});
