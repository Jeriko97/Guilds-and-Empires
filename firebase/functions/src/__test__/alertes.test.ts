import * as fs from "fs";
import * as path from "path";

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";

import {
  ALERTE_CF_PLANIFIEE,
  ALERTE_SLOT_CORROMPU,
  CHAMP_ALERTE,
  avecAlerteCfPlanifiee,
  champsAlerteSlotCorrompu,
} from "../shared/alertes";
import { corruptSlotDetails, processBuildingSlots } from "../shared/production";
import type { BuildingDocument, InventoryState } from "../shared/types";

// Admin initialisé sans connexion Firestore — Timestamp est une classe utilitaire pure.
if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-guilds-empires" });
}

// ── TD-021 (ÉTAPE 19.5a) : marqueur d'alerte, enveloppe des CF planifiées, politiques versionnées ──

const DOSSIER_MONITORING = path.resolve(__dirname, "../../../monitoring");

type PolitiqueAlerte = {
  displayName?: unknown;
  combiner?: unknown;
  conditions?: Array<{ displayName?: unknown; conditionMatchedLog?: { filter?: unknown } }>;
  alertStrategy?: { notificationRateLimit?: { period?: unknown }; autoClose?: unknown };
  notificationChannels?: unknown;
  documentation?: { content?: unknown; mimeType?: unknown };
};

function lirePolitique(fichier: string): PolitiqueAlerte {
  return JSON.parse(fs.readFileSync(path.join(DOSSIER_MONITORING, fichier), "utf-8")) as PolitiqueAlerte;
}

/** Filtre de l'unique condition `conditionMatchedLog` (forme vérifiée à part). */
function filtreDe(politique: PolitiqueAlerte): string {
  return politique.conditions?.[0]?.conditionMatchedLog?.filter as string;
}

/** HttpsError réellement produite par le calcul partagé sur un slot corrompu (slot hérité, sans cyclesPlanned). */
function erreurSlotCorrompuReelle(): HttpsError {
  const T0 = 1_700_000_000_000;
  const at = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
  const building: BuildingDocument = {
    buildingType: "sawmill",
    level: 1,
    slots: [{ slotIndex: 0, recipeId: "planks", startedAt: at(T0), lastProcessedAt: null }],
  };
  const inventory: InventoryState = {
    logs:               { quantity: 0, cap: 50 },
    planks:             { quantity: 0, cap: 30 },
    reconstructionKits: { quantity: 0, cap: 10 },
  };
  try {
    processBuildingSlots(building, inventory, at(T0 + 3_600_000), at);
  } catch (err) {
    if (err instanceof HttpsError) return err;
    throw err;
  }
  throw new Error("processBuildingSlots n'a pas levé d'erreur sur un slot corrompu");
}

describe("TD-021 — marqueur d'alerte", () => {
  it("Constantes : champ « alerte », valeurs « cf-planifiee » et « slot-corrompu »", () => {
    expect(CHAMP_ALERTE).toBe("alerte");
    expect(ALERTE_CF_PLANIFIEE).toBe("cf-planifiee");
    expect(ALERTE_SLOT_CORROMPU).toBe("slot-corrompu");
  });

  it("champsAlerteSlotCorrompu : marqueur « slot-corrompu » et code tiré de l'HttpsError (data-loss)", () => {
    const err = erreurSlotCorrompuReelle();
    expect(err.code).toBe("data-loss");
    expect(champsAlerteSlotCorrompu(err)).toEqual({ [CHAMP_ALERTE]: ALERTE_SLOT_CORROMPU, code: err.code });
  });
});

describe("TD-021 — enveloppe avecAlerteCfPlanifiee", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("Handler qui lève → logger.error appelé une fois avec le marqueur et le nom ; même erreur relancée", async () => {
    const origine = new Error("panne simulée");
    const enveloppe = avecAlerteCfPlanifiee("maFonction", async () => {
      throw origine;
    });

    let relancee: unknown;
    try {
      await enveloppe({});
    } catch (err) {
      relancee = err;
    }

    expect(relancee).toBe(origine); // même objet
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("maFonction: échec de la CF planifiée", {
      [CHAMP_ALERTE]: ALERTE_CF_PLANIFIEE,
      fonction: "maFonction",
      erreur:   "panne simulée",
    });
  });

  it("Handler qui lève autre chose qu'une Error → champ erreur converti en texte, valeur relancée telle quelle", async () => {
    const enveloppe = avecAlerteCfPlanifiee("maFonction", () => {
      throw "texte brut";
    });

    await expect(enveloppe({})).rejects.toBe("texte brut");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "maFonction: échec de la CF planifiée",
      expect.objectContaining({ [CHAMP_ALERTE]: ALERTE_CF_PLANIFIEE, erreur: "texte brut" }),
    );
  });

  it("Handler qui réussit → aucun logger.error, événement transmis au handler", async () => {
    const handler = jest.fn(async (_event: { id: number }) => undefined);
    const enveloppe = avecAlerteCfPlanifiee("maFonction", handler);

    await expect(enveloppe({ id: 7 })).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledWith({ id: 7 });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

// ── Entrée réellement écrite par le logger de firebase-functions (revue du diff de 19.5a) ──
//
// Le logger lit `console.error` UNE FOIS, au chargement de son module (`UNPATCHED_CONSOLE`), puis y écrit
// `JSON.stringify(entrée)`. Pour lire l'entrée réelle sans mocker `logger.error` : remplacer `console.error`,
// charger dans un registre de modules isolé (`jest.isolateModules`) le logger et `shared/alertes`, puis
// remettre `console.error`. L'instance isolée garde la fonction de capture.

type ModuleAlertes = typeof import("../shared/alertes");
type ModuleLogger  = typeof import("firebase-functions/logger");

function chargerAvecCapture(): { alertes: ModuleAlertes; loggerReel: ModuleLogger["logger"]; sorties: string[] } {
  const sorties: string[] = [];
  const consoleErrorOrigine = console.error;
  let alertes!: ModuleAlertes;
  let loggerReel!: ModuleLogger["logger"];
  console.error = (...args: unknown[]) => {
    sorties.push(args.map(String).join(" "));
  };
  try {
    jest.isolateModules(() => {
      alertes = require("../shared/alertes") as ModuleAlertes;
      loggerReel = (require("firebase-functions/logger") as ModuleLogger).logger;
    });
  } finally {
    console.error = consoleErrorOrigine;
  }
  return { alertes, loggerReel, sorties };
}

describe("TD-021 — entrée réelle du logger (sans mock de logger.error)", () => {
  it("Enveloppe : l'entrée JSON porte severity ERROR, alerte cf-planifiee, fonction et erreur = message d'origine", async () => {
    const { alertes, sorties } = chargerAvecCapture();
    const origine = new Error("panne simulée pour le logger réel");
    const enveloppe = alertes.avecAlerteCfPlanifiee("maFonction", async () => {
      throw origine;
    });

    await expect(enveloppe({})).rejects.toBe(origine);

    expect(sorties).toHaveLength(1);
    const entree = JSON.parse(sorties[0]) as Record<string, unknown>;
    expect(entree.severity).toBe("ERROR");
    expect(entree[CHAMP_ALERTE]).toBe(ALERTE_CF_PLANIFIEE);
    expect(entree.fonction).toBe("maFonction");
    expect(entree.erreur).toBe(origine.message);
    // Le champ `message` est celui du SDK (texte du journal), d'où le champ `erreur` pour le message d'origine.
    expect(String(entree.message)).toMatch(/^Error: maFonction: échec de la CF planifiée/);
  });

  it("Slot corrompu : l'entrée JSON porte alerte slot-corrompu et code = code de l'HttpsError (data-loss), details conservés", () => {
    const { alertes, loggerReel, sorties } = chargerAvecCapture();
    const err = erreurSlotCorrompuReelle();
    const corrupt = corruptSlotDetails(err);
    expect(corrupt).not.toBeNull();

    // Même forme d'appel que les trois handlers (« …: état de slot corrompu »).
    loggerReel.error("collectProduction: état de slot corrompu", {
      uid: "u-logger-reel", buildingId: "sawmill_0", ...corrupt, ...alertes.champsAlerteSlotCorrompu(err),
    });

    expect(sorties).toHaveLength(1);
    const entree = JSON.parse(sorties[0]) as Record<string, unknown>;
    expect(entree.severity).toBe("ERROR");
    expect(entree[CHAMP_ALERTE]).toBe(ALERTE_SLOT_CORROMPU);
    expect(entree.code).toBe(err.code);
    expect(entree.code).toBe("data-loss");
    expect(entree).toMatchObject({ uid: "u-logger-reel", buildingId: "sawmill_0", reason: "corrupt-slot", slotIndex: 0 });
  });
});

describe("TD-021 — politiques d'alerte versionnées (firebase/monitoring/)", () => {
  it.each(["td021-cf-planifiees.json", "td021-slot-corrompu.json"])(
    "%s : forme attendue (une seule condition conditionMatchedLog, alertStrategy, aucun canal)",
    (fichier) => {
      const politique = lirePolitique(fichier);

      expect(typeof politique.displayName).toBe("string");
      expect(politique.combiner).toBe("OR");
      expect(politique.conditions).toHaveLength(1);
      expect(typeof politique.conditions?.[0]?.displayName).toBe("string");
      expect(typeof politique.conditions?.[0]?.conditionMatchedLog?.filter).toBe("string");
      expect(politique.alertStrategy?.notificationRateLimit?.period).toBe("3600s");
      expect(politique.alertStrategy?.autoClose).toBe("1800s");
      expect(politique.notificationChannels).toEqual([]);
      expect(politique.documentation?.mimeType).toBe("text/markdown");
      expect(typeof politique.documentation?.content).toBe("string");
    },
  );

  it("td021-cf-planifiees.json : le filtre vise le marqueur de l'enveloppe (valeur de la constante)", () => {
    const filtre = filtreDe(lirePolitique("td021-cf-planifiees.json"));

    expect(filtre.startsWith("severity>=ERROR AND ")).toBe(true);
    expect(filtre).toContain(`jsonPayload.${CHAMP_ALERTE}="${ALERTE_CF_PLANIFIEE}"`);
    expect(filtre).toContain('resource.labels.service_name="updatemarketprices"');
    expect(filtre).toContain('resource.labels.job_id:"updateMarketPrices"');
  });

  it("td021-slot-corrompu.json : le filtre vise le code réel de l'HttpsError (data-loss) et le marqueur", () => {
    const filtre = filtreDe(lirePolitique("td021-slot-corrompu.json"));
    const code = erreurSlotCorrompuReelle().code; // pas un littéral : source unique

    expect(filtre.startsWith("severity>=ERROR AND ")).toBe(true);
    expect(filtre).toContain(`jsonPayload.code="${code}"`);
    expect(filtre).toContain(`jsonPayload.${CHAMP_ALERTE}="${ALERTE_SLOT_CORROMPU}"`);
  });
});
