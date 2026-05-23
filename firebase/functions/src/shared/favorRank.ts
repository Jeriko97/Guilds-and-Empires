import type { FavorRank } from "./types";

/**
 * Calcule le favorRank correspondant à un montant d'imperialFavor.
 * Fonction pure, déterministe, sans side effects.
 * Seuils définis dans phase-1-economy-values.md Section 5.
 */
export function computeFavorRank(imperialFavor: number): FavorRank {
  if (imperialFavor >= 350) return "guild_charter_eligible";
  if (imperialFavor >= 200) return "imperial_entrepreneur";
  if (imperialFavor >= 50) return "approved_merchant";
  return "local_supplier";
}
