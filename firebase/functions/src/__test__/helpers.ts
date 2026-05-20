import * as admin from "firebase-admin";
import type { CallableRequest } from "firebase-functions/v2/https";
import type {
  PlayerDocument,
  BuildingDocument,
  ProductionSlotState,
} from "../shared/types";
import { CURRENT_SCHEMA_VERSION } from "../shared/types";

// ── Initialisation unique du SDK Admin ────────────────────────────────────────
// Garde-fou : n'initialise qu'une seule fois même si helpers.ts est importé
// depuis plusieurs fichiers de test.
if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-guilds-empires" });
}

export const db = admin.firestore();

// ── Nettoyage entre les tests ─────────────────────────────────────────────────

/** Supprime tous les documents de test pour garantir l'isolation entre tests. */
export async function clearTestData(): Promise<void> {
  const collections = ["players", "rateLimits"];
  await Promise.all(
    collections.map(async (col) => {
      const snap = await db.collection(col).get();
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      if (snap.docs.length > 0) await batch.commit();
    })
  );

  // Subcollections players/{uid}/buildings et players/{uid}/contracts
  // sont supprimées automatiquement quand le doc parent est supprimé
  // via l'émulateur (comportement différent de la prod — acceptable pour les tests).
}

// ── Builders de mock CallableRequest ─────────────────────────────────────────

/** Crée un mock CallableRequest<void> pour un utilisateur authentifié. */
export function makeRequest(uid: string, displayName?: string): CallableRequest<void> {
  return {
    data: undefined,
    auth: {
      uid,
      rawToken: "",
      token: {
        uid,
        name: displayName ?? "Test Player",
        email: `${uid}@test.com`,
        email_verified: false,
        firebase: { identities: {}, sign_in_provider: "custom" },
        iss: "",
        aud: "",
        sub: uid,
        iat: 0,
        exp: 0,
        auth_time: 0,
      },
    },
    rawRequest: {} as never,
    acceptsStreaming: false,
  };
}

/** Crée un mock CallableRequest<void> sans authentification (uid absent). */
export function makeUnauthRequest(): CallableRequest<void> {
  return {
    data: undefined,
    auth: undefined,
    rawRequest: {} as never,
    acceptsStreaming: false,
  };
}

// ── Builders de documents Firestore ──────────────────────────────────────────

/** Insère un document joueur dans Firestore avec les valeurs fournies. */
export async function createTestPlayer(
  uid: string,
  overrides: Partial<PlayerDocument> = {}
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const base: PlayerDocument = {
    schemaVersion:          CURRENT_SCHEMA_VERSION,
    displayName:            "Test Player",
    createdAt:              now,
    lastLoginAt:            now,
    gold:                   0,
    imperialFavor:          0,
    inventory: {
      logs:               { quantity: 0, cap: 50 },
      planks:             { quantity: 0, cap: 30 },
      reconstructionKits: { quantity: 0, cap: 10 },
    },
    favorRank:              "local_supplier",
    guildCharterUnlocked:   false,
    guildCharterPurchasedAt:null,
    firstContractCompleted: false,
    ...overrides,
  };
  await db.collection("players").doc(uid).set(base);
}

/** Insère un document building pour un joueur. */
export async function createTestBuilding(
  uid: string,
  slots: ProductionSlotState[],
  buildingId = "sawmill_0"
): Promise<void> {
  const building: BuildingDocument = {
    buildingType: "sawmill",
    level: 1,
    slots,
  };
  await db
    .collection("players").doc(uid)
    .collection("buildings").doc(buildingId)
    .set(building);
}

// ── Builders de slots ─────────────────────────────────────────────────────────

/** Slot inactif (recipeId null, startedAt null). */
export function makeIdleSlot(slotIndex: 0 | 1 | 2 = 0): ProductionSlotState {
  return { slotIndex, recipeId: null, startedAt: null, lastProcessedAt: null };
}

/**
 * Slot actif avec startedAt = now - offsetMs.
 * lastProcessedAt peut être passé explicitement (ou laissé null pour simuler
 * un slot fraîchement démarré / pré-migration).
 */
export function makeActiveSlot(
  slotIndex: 0 | 1 | 2,
  recipeId: "logs" | "planks" | "reconstruction_kits",
  offsetMs: number,
  lastProcessedAt: admin.firestore.Timestamp | null = null
): ProductionSlotState {
  const startedAt = admin.firestore.Timestamp.fromMillis(
    Date.now() - offsetMs
  );
  return { slotIndex, recipeId, startedAt, lastProcessedAt };
}
