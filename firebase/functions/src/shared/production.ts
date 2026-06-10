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
 * Throws Error (pas HttpsError) si une recette est inconnue — le handler convertit.
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

    const referenceTimestamp = slot.lastProcessedAt ?? slot.startedAt;
    const elapsedMs = now.toMillis() - referenceTimestamp.toMillis();
    const completedCycles = Math.floor(elapsedMs / recipe.durationMs);

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
    return { ...slot, lastProcessedAt: newLastProcessedAt };
  });

  return { updatedSlots, updatedInventory, collected, discarded, hasProcessedCycles };
}
