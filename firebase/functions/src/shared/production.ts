import type { firestore } from "firebase-admin";
import type { BuildingDocument, InventoryState, ProductionSlotState } from "./types";
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
 * - recette inconnue (donnée corrompue) ;
 * - slot de transformation sans cyclesPlanned (lancé avant l'ÉTAPE 19) : donnée à reprendre,
 *   jamais traitée comme une production continue (TD-023).
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
    if (slot.recipeId === null || slot.startedAt === null) return { ...slot };

    const recipe = (RECIPES as Record<string, RecipeConfig | undefined>)[slot.recipeId];
    if (!recipe) {
      throw new Error(`unknown recipe: ${slot.recipeId}`);
    }

    // Lot (transformation) : cyclesPlanned obligatoire. Logs : jamais de lot.
    const cyclesPlanned = recipe.maxBatchCycles === null ? null : (slot.cyclesPlanned ?? null);
    if (recipe.maxBatchCycles !== null && cyclesPlanned === null) {
      throw new Error(
        `legacy transformation slot without cyclesPlanned: ${slot.recipeId} (slot ${slot.slotIndex})`
      );
    }
    const cyclesProcessed = slot.cyclesProcessed ?? 0;

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
