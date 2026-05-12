import * as admin from "firebase-admin";

// Initialisation unique du SDK Admin pour toutes les fonctions.
admin.initializeApp();

// ── Économie ──────────────────────────────────────────────────────────────────
export { claimDailyBonus } from "./economy/claimDailyBonus";
export { initPlayerProfile } from "./economy/createUserProfile";

// ── À venir ───────────────────────────────────────────────────────────────────
// export { collectBuilding }   from "./economy/collectBuilding";
// export { purchaseItem }      from "./economy/purchaseItem";
// export { validateIapReceipt } from "./economy/validateIapReceipt";
