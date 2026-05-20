import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import { requireAuth, requireSchemaVersion } from "../shared/validators";
import { checkRateLimit } from "../shared/rateLimiter";
import { RECIPES, RECIPE_TO_INVENTORY_KEY } from "../shared/recipes";
import { CURRENT_SCHEMA_VERSION } from "../shared/types";
import type {
  PlayerDocument,
  BuildingDocument,
  ContractDocument,
  InventoryState,
  PlayerStateSnapshot,
  RecipeId,
} from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

export type ResolveLoginStateRequest  = CallableRequest<void>;
export type ResolveLoginStateResponse = PlayerStateSnapshot;

// ── Constantes ────────────────────────────────────────────────────────────────

const RATE_LIMIT_SECONDS = 5;

/** Valeurs initiales de l'inventaire à la création du joueur. */
const INITIAL_INVENTORY: InventoryState = {
  logs:              { quantity: 0, cap: 50 },
  planks:            { quantity: 0, cap: 30 },
  reconstructionKits:{ quantity: 0, cap: 10 },
};

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

/**
 * Résout l'état du joueur au login.
 *
 * - Calcule la production différée pour chaque slot actif depuis son startedAt.
 * - Clampe le yield par le cap d'inventaire (production continue jusqu'à saturation).
 * - startedAt n'est JAMAIS resetté — le slot reste actif après saturation.
 * - Le client ne fournit AUCUN paramètre temporel. Tout temps vient du serveur.
 * - Idempotent : un double appel dans la fenêtre de rate limit est rejeté.
 * - Premier login : crée le document joueur avec les valeurs initiales.
 */
export async function resolveLoginStateHandler(
  request: ResolveLoginStateRequest
): Promise<ResolveLoginStateResponse> {

  // ── 1. Authentification ───────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Rate limit — 1 appel / 5s par uid ─────────────────────────────────
  await checkRateLimit(uid, "resolveLoginState", RATE_LIMIT_SECONDS);

  const db = admin.firestore();
  const playerRef    = db.collection("players").doc(uid);
  const buildingsRef = db.collection("players").doc(uid).collection("buildings");
  const contractsRef = db.collection("players").doc(uid).collection("contracts");

  try {

    // ── 3-8. Transaction atomique ─────────────────────────────────────────
    // Lit player + buildings, calcule la production différée, écrit player.
    // Si l'écriture échoue, aucun état n'est modifié.
    const { playerForSnapshot, buildings } = await db.runTransaction(async (tx) => {

      const [playerSnap, buildingsSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(buildingsRef),
      ]);

      // ── Premier login : création du document joueur ─────────────────────
      if (!playerSnap.exists) {
        const displayName = request.auth?.token.name ?? "Marchand";
        const now = admin.firestore.Timestamp.now();

        tx.set(playerRef, {
          schemaVersion:          CURRENT_SCHEMA_VERSION,
          displayName,
          createdAt:              admin.firestore.FieldValue.serverTimestamp(),
          lastLoginAt:            admin.firestore.FieldValue.serverTimestamp(),
          gold:                   0,
          imperialFavor:          0,
          inventory:              INITIAL_INVENTORY,
          favorRank:              "local_supplier",
          guildCharterUnlocked:   false,
          guildCharterPurchasedAt:null,
          firstContractCompleted: false,
        });

        // Le snapshot retourné approxime les timestamps avec now().
        // L'écart avec le serverTimestamp() stocké est négligeable au premier login.
        const playerForSnapshot: PlayerDocument = {
          schemaVersion:          CURRENT_SCHEMA_VERSION,
          displayName,
          createdAt:              now,
          lastLoginAt:            now,
          gold:                   0,
          imperialFavor:          0,
          inventory:              INITIAL_INVENTORY,
          favorRank:              "local_supplier",
          guildCharterUnlocked:   false,
          guildCharterPurchasedAt:null,
          firstContractCompleted: false,
        };

        return { playerForSnapshot, buildings: [] as BuildingDocument[] };
      }

      // ── Joueur existant ─────────────────────────────────────────────────
      const playerData = playerSnap.data() as PlayerDocument;
      requireSchemaVersion(playerData);

      // ── Calcul de production différée ───────────────────────────────────
      // elapsed = now - lastProcessedAt (ou startedAt si premier calcul).
      // Le client ne fournit aucun paramètre temporel (Doctrine Anti-Cheat).
      // startedAt n'est JAMAIS la référence de calcul après le premier traitement —
      // sinon les cycles déjà comptés seraient recomptés à chaque login.
      const now = admin.firestore.Timestamp.now();

      // Copie de l'inventaire — on ne mute pas le document Firestore directement.
      const inventory: InventoryState = {
        logs:              { ...playerData.inventory.logs },
        planks:            { ...playerData.inventory.planks },
        reconstructionKits:{ ...playerData.inventory.reconstructionKits },
      };

      // Traitement des buildings : calcul de production + mise à jour des slots.
      const buildings: BuildingDocument[] = [];

      for (const buildingSnap of buildingsSnap.docs) {
        const building = buildingSnap.data() as BuildingDocument;
        let buildingModified = false;

        const updatedSlots = building.slots.map((slot) => {
          if (slot.recipeId === null || slot.startedAt === null) return slot;

          const recipe = RECIPES[slot.recipeId];

          // lastProcessedAt comme référence de calcul — fallback sur startedAt
          // pour les slots qui n'ont pas encore été traités (migration one-shot, TD-003).
          const referenceTimestamp = slot.lastProcessedAt ?? slot.startedAt;
          const elapsedMs = now.toMillis() - referenceTimestamp.toMillis();

          if (elapsedMs <= 0) return slot;

          const completedCycles = Math.floor(elapsedMs / recipe.durationMs);
          if (completedCycles === 0) return slot;

          // Option B : lastProcessedAt mis à jour si completedCycles > 0,
          // même si le yield est clampé à 0 par saturation d'inventaire.
          // Production perdue à saturation = intentionnelle (mécanisme de check-in).
          const inventoryKey = RECIPE_TO_INVENTORY_KEY[slot.recipeId];
          const resource = inventory[inventoryKey];
          const rawYield = completedCycles * recipe.outputQty;
          const actualYield = Math.min(rawYield, resource.cap - resource.quantity);

          inventory[inventoryKey] = {
            ...resource,
            quantity: resource.quantity + actualYield,
          };

          buildingModified = true;
          return { ...slot, lastProcessedAt: now };
        });

        if (buildingModified) {
          tx.update(buildingSnap.ref, { slots: updatedSlots });
        }

        buildings.push({ ...building, slots: updatedSlots });
      }

      // ── Écriture atomique — inventaire + lastLoginAt ────────────────────
      tx.update(playerRef, {
        inventory,
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Le snapshot retourné approxime lastLoginAt avec now().
      // L'écart avec le serverTimestamp() stocké est sub-secondaire et
      // sans impact économique — lastLoginAt est informatif, pas calculatoire.
      const playerForSnapshot: PlayerDocument = {
        ...playerData,
        inventory,
        lastLoginAt: now,
      };

      return { playerForSnapshot, buildings };
    });

    // ── 9. Lecture des contrats actifs (hors transaction — read-only) ──────
    const contractsSnap = await contractsRef
      .where("status", "==", "active")
      .get();

    const activeContracts: ContractDocument[] = contractsSnap.docs.map(
      (doc) => doc.data() as ContractDocument
    );

    return {
      player:          playerForSnapshot,
      buildings,
      activeContracts,
    };

  } catch (err) {
    // HttpsError remontés tels quels (auth, rate-limit, schema, etc.).
    if (err instanceof HttpsError) throw err;

    logger.error("resolveLoginState: erreur inattendue", {
      uid,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const resolveLoginState = onCall(
  { invoker: "public" },
  resolveLoginStateHandler
);
