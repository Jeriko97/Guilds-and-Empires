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
  /**
   * Nombre maximal de cycles d'un lot (D-ETAPE19-004). null = production continue (logs, D3.1) :
   * pas de lot, `cycles` refusé au lancement. Sinon, transformation par lot de N cycles (D-ETAPE19-001).
   */
  maxBatchCycles: number | null;
}

/** Borne max d'un lot de planks : 24 cycles = 10 h, 48 logs pour un plafond de départ de 50 (D-ETAPE19-004). */
export const PLANKS_MAX_BATCH_CYCLES = 24;
/** Borne max d'un lot de kits : 10 cycles = 10 h, 30 planks pour un plafond de départ de 30 (D-ETAPE19-004). */
export const KITS_MAX_BATCH_CYCLES = 10;

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
    maxBatchCycles: null,
  },
  planks: {
    durationMs: 25 * 60 * 1000, // 25 minutes — TO_PLAYTEST
    outputQty: 1,
    inputs: { logs: 2 },
    producibleBy: ["sawmill"],
    maxBatchCycles: PLANKS_MAX_BATCH_CYCLES,
  },
  reconstruction_kits: {
    durationMs: 60 * 60 * 1000, // 60 minutes — TO_PLAYTEST (valeur critique : anchor session pacing)
    outputQty: 1,
    inputs: { planks: 3 },
    producibleBy: ["sawmill"],
    maxBatchCycles: KITS_MAX_BATCH_CYCLES,
  },
};
