import * as admin from "firebase-admin";

// Initialisation unique du SDK Admin pour toutes les fonctions.
admin.initializeApp();

// ── Login ─────────────────────────────────────────────────────────────────────
export { resolveLoginState } from "./login/resolveLoginState";

// ── Production ────────────────────────────────────────────────────────────────
export { startProductionSlot }  from "./production/startProductionSlot";
export { collectProduction }    from "./production/collectProduction";

// ── Économie (legacy — pré-spec, à supprimer fin Phase 1) ────────────────────
export { claimDailyBonus } from "./economy/claimDailyBonus";

// ── Contrats ──────────────────────────────────────────────────────────────────
export { acceptContract }     from "./contracts/acceptContract";
export { deliverToContract }  from "./contracts/deliverToContract";

// ── Marché ────────────────────────────────────────────────────────────────────
export { sellToMarket } from "./market/sellToMarket";

// ── Inventaire ────────────────────────────────────────────────────────────────
export { upgradeInventoryCap } from "./inventory/upgradeInventoryCap";

// ── Guild Charter ─────────────────────────────────────────────────────────────
export { purchaseGuildCharter } from "./guildCharter/purchaseGuildCharter";

// ── Scheduled ─────────────────────────────────────────────────────────────────
export { updateMarketPrices } from "./market/updateMarketPrices";

// ── À venir — Phase 1 Vertical Slice ─────────────────────────────────────────
// export { processWorldEventLifecycle } from "./scheduled/processWorldEventLifecycle";
