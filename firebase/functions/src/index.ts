import * as admin from "firebase-admin";

// Initialisation unique du SDK Admin pour toutes les fonctions.
admin.initializeApp();

// ── Login ─────────────────────────────────────────────────────────────────────
export { resolveLoginState } from "./login/resolveLoginState";

// ── Économie (legacy — pré-spec, à supprimer fin Phase 1) ────────────────────
export { claimDailyBonus } from "./economy/claimDailyBonus";

// ── À venir — Phase 1 Vertical Slice ─────────────────────────────────────────
// export { startProductionSlot }    from "./production/startProductionSlot";
// export { collectProduction }      from "./production/collectProduction";
// export { acceptContract }         from "./contracts/acceptContract";
// export { deliverToContract }      from "./contracts/deliverToContract";
// export { sellToMarket }           from "./market/sellToMarket";
// export { upgradeInventoryCap }    from "./upgrades/upgradeInventoryCap";
// export { purchaseGuildCharter }   from "./guild/purchaseGuildCharter";
// export { updateMarketPrices }     from "./scheduled/updateMarketPrices";
// export { processWorldEventLifecycle } from "./scheduled/processWorldEventLifecycle";
