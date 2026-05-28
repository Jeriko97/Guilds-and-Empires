import type { FavorRank } from "./types";

export const FAVOR_THRESHOLDS = {
  approved_merchant:      50,
  imperial_entrepreneur:  200,
  guild_charter_eligible: 350,
} as const;

export function computeFavorRank(imperialFavor: number): FavorRank {
  if (imperialFavor >= FAVOR_THRESHOLDS.guild_charter_eligible) return "guild_charter_eligible";
  if (imperialFavor >= FAVOR_THRESHOLDS.imperial_entrepreneur)  return "imperial_entrepreneur";
  if (imperialFavor >= FAVOR_THRESHOLDS.approved_merchant)      return "approved_merchant";
  return "local_supplier";
}
