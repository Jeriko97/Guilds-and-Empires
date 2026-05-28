export const INVENTORY_UPGRADE_COSTS = {
  logs:               [40, 80],   // palier 0 : 40g, palier 1 : 80g
  planks:             [60, 120],  // palier 0 : 60g, palier 1 : 120g
  reconstructionKits: [100],      // palier 0 : 100g, pas de palier 1
} as const;

export const INVENTORY_UPGRADE_AMOUNTS = {
  logs:               [25, 25],   // +25 par palier
  planks:             [15, 15],   // +15 par palier
  reconstructionKits: [5],        // +5 au palier 0
} as const;

export type UpgradeableResource = keyof typeof INVENTORY_UPGRADE_COSTS;
export type UpgradeIndex = 0 | 1;
