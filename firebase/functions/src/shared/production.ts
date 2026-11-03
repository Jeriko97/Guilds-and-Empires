import type { firestore } from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import type { BuildingDocument, InventoryState, ProductionSlotState, RecipeId } from "./types";
import { RECIPES, RECIPE_TO_INVENTORY_KEY } from "./recipes";
import type { RecipeConfig } from "./recipes";

export type ResourceKey = keyof InventoryState;

export type ProcessBuildingResult = {
  updatedSlots: ProductionSlotState[];
  updatedInventory: InventoryState;
  collected: Partial<Record<ResourceKey, number>>;
  discarded: Partial<Record<ResourceKey, number>>;
  hasProcessedCycles: boolean;
};

// ── États corrompus (ÉTAPE 19.2, règle unique ; code `data-loss` depuis 19.4b, D-ETAPE19-010 Q1) ──

/** Motif porté par `HttpsError.details.reason` pour un état de slot corrompu. */
export const CORRUPT_SLOT_REASON = "corrupt-slot";

export type CorruptSlotDetails = {
  reason:    typeof CORRUPT_SLOT_REASON;
  slotIndex: number;
  recipeId:  string;
  motif:     string;
};

function corruptSlotError(slot: ProductionSlotState, motif: string): HttpsError {
  const details: CorruptSlotDetails = {
    reason:    CORRUPT_SLOT_REASON,
    slotIndex: slot.slotIndex,
    recipeId:  String(slot.recipeId),
    motif,
  };
  return new HttpsError(
    "data-loss",
    `État de slot corrompu (slot ${slot.slotIndex}, ${slot.recipeId}) : ${motif}. ` +
    "Reprise manuelle des données requise.",
    details,
  );
}

/**
 * Détails d'un état de slot corrompu levé par le calcul partagé, ou null pour toute autre erreur.
 * Les handlers s'en servent pour journaliser (logger.error) avant de renvoyer l'erreur.
 */
export function corruptSlotDetails(err: unknown): CorruptSlotDetails | null {
  if (!(err instanceof HttpsError)) return null;
  const details = err.details as Partial<CorruptSlotDetails> | undefined;
  return details?.reason === CORRUPT_SLOT_REASON ? details as CorruptSlotDetails : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Calcule la production différée pour tous les slots d'un bâtiment.
 *
 * PUR — aucun read/write Firestore, aucun Timestamp.now() interne.
 * `now` est injecté par le call site (handler) pour garantir la testabilité unitaire.
 * Ne mute pas les arguments.
 *
 * - Logs (maxBatchCycles null) : production continue jusqu'à saturation (D3.1).
 * - Planks / kits : lot de cyclesPlanned cycles (D-ETAPE19-001). Cycles crédités =
 *   min(cycles écoulés, cyclesPlanned − cyclesProcessed). Un cycle terminé à saturation compte
 *   quand même, sa production est perdue (D-ETAPE19-004). Slot libéré quand
 *   cyclesProcessed atteint cyclesPlanned.
 *
 * Throws Error (pas HttpsError) — le handler convertit en `internal` :
 * - recette inconnue (donnée corrompue).
 *
 * Throws HttpsError `data-loss` (details.reason = "corrupt-slot", D-ETAPE19-010 Q1) — état de slot corrompu,
 * levé avant tout calcul, donc sans aucune écriture ; donnée à reprendre (escalade cas 1) :
 * - slot occupé sans startedAt ;
 * - slot de transformation sans cyclesPlanned (lancé avant l'ÉTAPE 19), jamais traité comme une
 *   production continue (TD-023) ;
 * - lot aux compteurs invalides (cyclesPlanned non entier ou < 1 ; cyclesProcessed absent, non
 *   entier ou < 0) ou épuisé sans libération (cyclesProcessed ≥ cyclesPlanned).
 * Logs : les champs de lot ne sont pas lus (production continue, D3.1).
 */
export function processBuildingSlots(
  building: BuildingDocument,
  inventory: InventoryState,
  now: firestore.Timestamp,
  createTimestamp: (ms: number) => firestore.Timestamp,
): ProcessBuildingResult {

  const updatedInventory: InventoryState = {
    logs:               { ...inventory.logs },
    planks:             { ...inventory.planks },
    reconstructionKits: { ...inventory.reconstructionKits },
  };

  const collected: Partial<Record<ResourceKey, number>> = {};
  const discarded: Partial<Record<ResourceKey, number>> = {};

  let hasProcessedCycles = false;

  const updatedSlots: ProductionSlotState[] = building.slots.map((slot) => {
    if (slot.recipeId === null) return { ...slot };

    const recipe = (RECIPES as Record<string, RecipeConfig | undefined>)[slot.recipeId];
    if (!recipe) {
      throw new Error(`unknown recipe: ${slot.recipeId}`);
    }
    if (slot.startedAt === null || slot.startedAt === undefined) {
      throw corruptSlotError(slot, "slot occupé sans startedAt");
    }

    // Lot (transformation) : compteurs obligatoires et cohérents. Logs : jamais de lot.
    let cyclesPlanned: number | null = null;
    let cyclesProcessed = 0;
    if (recipe.maxBatchCycles !== null) {
      if (slot.cyclesPlanned === undefined || slot.cyclesPlanned === null) {
        throw corruptSlotError(slot, "slot de transformation hérité, sans cyclesPlanned (lancé avant l'ÉTAPE 19)");
      }
      if (!isNonNegativeInteger(slot.cyclesPlanned) || slot.cyclesPlanned < 1) {
        throw corruptSlotError(slot, `cyclesPlanned invalide (${JSON.stringify(slot.cyclesPlanned)})`);
      }
      if (!isNonNegativeInteger(slot.cyclesProcessed)) {
        throw corruptSlotError(slot, `cyclesProcessed invalide (${JSON.stringify(slot.cyclesProcessed)})`);
      }
      if (slot.cyclesProcessed >= slot.cyclesPlanned) {
        throw corruptSlotError(
          slot,
          `lot épuisé non libéré (cyclesProcessed ${slot.cyclesProcessed} ≥ cyclesPlanned ${slot.cyclesPlanned})`,
        );
      }
      cyclesPlanned   = slot.cyclesPlanned;
      cyclesProcessed = slot.cyclesProcessed;
    }

    const referenceTimestamp = slot.lastProcessedAt ?? slot.startedAt;
    const elapsedMs = now.toMillis() - referenceTimestamp.toMillis();
    const elapsedCycles = Math.floor(elapsedMs / recipe.durationMs);
    const completedCycles = cyclesPlanned === null
      ? elapsedCycles
      : Math.min(elapsedCycles, cyclesPlanned - cyclesProcessed);

    if (completedCycles <= 0) return { ...slot };

    const inventoryKey = RECIPE_TO_INVENTORY_KEY[slot.recipeId];
    const resource = updatedInventory[inventoryKey];
    const rawYield = completedCycles * recipe.outputQty;
    // availableSpace lu sur updatedInventory (état muté) — pas sur l'inventaire initial.
    // Indispensable quand deux slots produisent la même ressource dans la même boucle.
    const availableSpace = Math.max(0, resource.cap - resource.quantity);
    const actualYield = Math.min(rawYield, availableSpace);
    const discardedYield = rawYield - actualYield;

    updatedInventory[inventoryKey] = {
      ...resource,
      quantity: resource.quantity + actualYield,
    };

    collected[inventoryKey] = (collected[inventoryKey] ?? 0) + actualYield;
    discarded[inventoryKey] = (discarded[inventoryKey] ?? 0) + discardedYield;

    hasProcessedCycles = true;
    const newLastProcessedAt = createTimestamp(
      referenceTimestamp.toMillis() + completedCycles * recipe.durationMs,
    );

    // Logs : production continue, le slot reste actif.
    if (cyclesPlanned === null) return { ...slot, lastProcessedAt: newLastProcessedAt };

    // Lot : cycles traités (crédités ou perdus à saturation) ; libération en fin de lot.
    const newCyclesProcessed = cyclesProcessed + completedCycles;
    if (newCyclesProcessed >= cyclesPlanned) {
      return {
        slotIndex:       slot.slotIndex,
        recipeId:        null,
        startedAt:       null,
        lastProcessedAt: null,
        cyclesPlanned:   null,
        cyclesProcessed: null,
      };
    }
    return { ...slot, lastProcessedAt: newLastProcessedAt, cyclesProcessed: newCyclesProcessed };
  });

  return { updatedSlots, updatedInventory, collected, discarded, hasProcessedCycles };
}

// ── Arrêt d'un slot (ÉTAPE 19.2, D-ETAPE19-002) ───────────────────────────────

export type SlotStopResult = {
  updatedSlots: ProductionSlotState[];
  updatedInventory: InventoryState;
  /** Cycles terminés crédités par le règlement de tous les slots du bâtiment (effet 1). */
  collected: Partial<Record<ResourceKey, number>>;
  /** Production perdue à saturation lors de ce règlement (effet 1). */
  discarded: Partial<Record<ResourceKey, number>>;
  /** Intrants des cycles non commencés rendus, dans la limite du plafond de l'inventaire réglé (effet 3). */
  refunded: Partial<Record<ResourceKey, number>>;
  /** Intrants à rendre perdus au plafond (effet 3, décision founder du 2026-11-02). */
  refundDiscarded: Partial<Record<ResourceKey, number>>;
};

/**
 * Calcule l'arrêt d'un slot occupé, dans l'ordre de la spec (D-ETAPE19-002, D-ETAPE19-007) :
 *  1. règlement de TOUS les slots du bâtiment, exactement comme la collecte (processBuildingSlots :
 *     même ordre, saturation comprise, jamais plus que N pour un lot) — le slot arrêté y est crédité
 *     de ses cycles terminés ; une production en attente sur un voisin est comptée avant le
 *     remboursement, qui ne peut donc plus la faire perdre après coup (D-ETAPE19-007) ;
 *  2. cycle en cours perdu, avec ses intrants (arrêt pile en fin de cycle compris : le cycle suivant
 *     compte comme commencé, règle 19.0) ;
 *  3. lot : intrants des cycles non commencés rendus, max(0, N − cyclesProcessed − 1) × inputs, où
 *     cyclesProcessed est compté après l'effet 1 (lot entièrement écoulé : N, rien à rendre). Chaque
 *     ressource rendue est limitée à sa place libre dans l'inventaire réglé (tous slots crédités) ;
 *     l'excédent est perdu (décision founder : « remboursement limité au plafond, l'excédent est
 *     perdu »). Logs : rien à rendre ;
 *  4. slot libéré.
 *
 * PUR — même contrat que processBuildingSlots (aucun I/O, `now` injecté, arguments non mutés).
 * Throws Error si le slot est absent ou libre (contrôlé par le handler avant l'appel), et les
 * erreurs de processBuildingSlots pour N'IMPORTE QUEL slot du bâtiment, voisin compris (recette
 * inconnue ; état de slot corrompu, dont details.slotIndex désigne le slot fautif).
 */
export function computeSlotStop(
  building: BuildingDocument,
  inventory: InventoryState,
  slotIndex: 0 | 1 | 2,
  now: firestore.Timestamp,
  createTimestamp: (ms: number) => firestore.Timestamp,
): SlotStopResult {

  const target = building.slots.find((s) => s.slotIndex === slotIndex);
  if (target === undefined || target.recipeId === null) {
    throw new Error(`computeSlotStop: slot ${slotIndex} absent ou libre`);
  }

  // Effets 1-2 : règlement de tous les slots, comme la collecte.
  const processed = processBuildingSlots(building, inventory, now, createTimestamp);
  // Toujours trouvé : cible contrôlée ci-dessus, processBuildingSlots conserve les slotIndex.
  const afterCredit = processed.updatedSlots.find((s) => s.slotIndex === slotIndex) as ProductionSlotState;
  const updatedInventory = processed.updatedInventory;

  // Effet 3 : remboursement plafonné sur l'inventaire réglé.
  const refunded: Partial<Record<ResourceKey, number>> = {};
  const refundDiscarded: Partial<Record<ResourceKey, number>> = {};
  const recipe = RECIPES[target.recipeId];
  if (recipe.maxBatchCycles !== null && recipe.inputs !== null) {
    // Compteurs validés par processBuildingSlots. Lot entièrement écoulé : libéré par
    // processBuildingSlots (compteurs à null), il a traité ses N cycles.
    const cyclesPlanned = target.cyclesPlanned as number;
    const cyclesProcessed = afterCredit.recipeId === null
      ? cyclesPlanned
      : afterCredit.cyclesProcessed as number;
    const refundCycles = Math.max(0, cyclesPlanned - cyclesProcessed - 1);

    if (refundCycles > 0) {
      for (const [inputId, unitCost] of Object.entries(recipe.inputs) as Array<[RecipeId, number]>) {
        const key = RECIPE_TO_INVENTORY_KEY[inputId];
        const resource = updatedInventory[key];
        const due = unitCost * refundCycles;
        const given = Math.min(due, Math.max(0, resource.cap - resource.quantity));
        updatedInventory[key] = { ...resource, quantity: resource.quantity + given };
        refunded[key] = (refunded[key] ?? 0) + given;
        refundDiscarded[key] = (refundDiscarded[key] ?? 0) + (due - given);
      }
    }
  }

  // Effet 4 : slot libéré.
  const freedSlot: ProductionSlotState = {
    slotIndex,
    recipeId:        null,
    startedAt:       null,
    lastProcessedAt: null,
    cyclesPlanned:   null,
    cyclesProcessed: null,
  };
  const updatedSlots = processed.updatedSlots.map((s) => s.slotIndex === slotIndex ? freedSlot : s);

  return {
    updatedSlots,
    updatedInventory,
    collected: processed.collected,
    discarded: processed.discarded,
    refunded,
    refundDiscarded,
  };
}
