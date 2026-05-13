import * as admin from "firebase-admin";

// Initialisation unique du SDK Admin pour toutes les fonctions.
admin.initializeApp();

// ── Économie ──────────────────────────────────────────────────────────────────
export { claimDailyBonus } from "./economy/claimDailyBonus";

// initPlayerProfile supprimé : le profil Firestore est créé côté client
// (Unity) immédiatement après le signup Firebase Auth.

// ── À venir ───────────────────────────────────────────────────────────────────
// export { collectBuilding }   from "./economy/collectBuilding";
// export { purchaseItem }      from "./economy/purchaseItem";
// export { validateIapReceipt } from "./economy/validateIapReceipt";
