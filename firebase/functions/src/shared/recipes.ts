import type { BuildingType, InventoryState, RecipeId } from "./types";

export interface RecipeConfig {
  /** Durée d'un cycle de production en millisecondes. TO_PLAYTEST — voir phase-1-economy-values.md section 1. */
  durationMs: number;
  /** Quantité produite par cycle complété. */
  outputQty: number;
  /**
   * Ressources consommées au démarrage du slot (validées par startProductionSlot).
   * null = pas d'input requis (production primaire).
   * TODO: migrer vers Remote Config pour permettre le rebalancing LiveOps sans redéploiement.
   */
  inputs: Partial<Record<RecipeId, number>> | null;
  /**
   * Types de bâtiments capables de produire cette recette.
   * Vérifié par startProductionSlot — empêche d'associer une recette à un bâtiment incompatible.
   * Permet à une recette d'être produite par plusieurs bâtiments en Phase 2+
   * (ex: planks par Sawmill OU Workshop) sans modifier le handler.
   */
  producibleBy: BuildingType[];
}

/**
 * Mapping de RecipeId vers la clé correspondante dans InventoryState.
 * Nécessaire car 'reconstruction_kits' (snake_case Firestore) → 'reconstructionKits' (camelCase TS).
 * Source de vérité unique — importé par tous les handlers qui accèdent à l'inventaire par recette.
 */
export const RECIPE_TO_INVENTORY_KEY: Record<RecipeId, keyof InventoryState> = {
  logs:                "logs",
  planks:              "planks",
  reconstruction_kits: "reconstructionKits",
};

/**
 * Configuration de toutes les recettes de production Phase 1.
 * Valeurs issues de phase-1-economy-values.md — TO_PLAYTEST dans leur intégralité.
 *
 * Note: ces valeurs sont des constantes compile-time pour Phase 1. La migration vers
 * Remote Config permettra de les ajuster en LiveOps sans redéploiement de Cloud Functions.
 */
export const RECIPES: Record<RecipeId, RecipeConfig> = {
  logs: {
    durationMs: 20 * 60 * 1000, // 20 minutes — TO_PLAYTEST
    outputQty: 1,
    inputs: null,
    producibleBy: ["sawmill"],
  },
  planks: {
    durationMs: 25 * 60 * 1000, // 25 minutes — TO_PLAYTEST
    outputQty: 1,
    inputs: { logs: 2 },
    producibleBy: ["sawmill"],
  },
  reconstruction_kits: {
    durationMs: 60 * 60 * 1000, // 60 minutes — TO_PLAYTEST (valeur critique : anchor session pacing)
    outputQty: 1,
    inputs: { planks: 3 },
    producibleBy: ["sawmill"],
  },
};
