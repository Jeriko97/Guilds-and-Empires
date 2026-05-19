import type { RecipeId } from "./types";

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
}

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
  },
  planks: {
    durationMs: 25 * 60 * 1000, // 25 minutes — TO_PLAYTEST
    outputQty: 1,
    inputs: { logs: 2 },
  },
  reconstruction_kits: {
    durationMs: 60 * 60 * 1000, // 60 minutes — TO_PLAYTEST (valeur critique : anchor session pacing)
    outputQty: 1,
    inputs: { planks: 3 },
  },
};
