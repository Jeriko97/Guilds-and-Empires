import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";

import {
  requireAuth,
  requireSchemaVersion,
  requireValidSlotIndex,
  requireValidRecipeId,
} from "../shared/validators";
import { checkRateLimit } from "../shared/rateLimiter";
import { RECIPES, RECIPE_TO_INVENTORY_KEY } from "../shared/recipes";
import type {
  PlayerDocument,
  BuildingDocument,
  InventoryState,
  ProductionSlotState,
  RecipeId,
} from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

/** Données envoyées par le client. Toutes les valeurs sont unknown — validées au runtime. */
interface StartProductionSlotData {
  buildingId: unknown;
  slotIndex:  unknown;
  recipeId:   unknown;
}

export type StartProductionSlotRequest  = CallableRequest<StartProductionSlotData>;
export type StartProductionSlotResponse = {
  /** Building mis à jour avec le slot démarré. startedAt approximé par Timestamp.now() côté retour. */
  building:  BuildingDocument;
  /** Inventaire mis à jour après consommation des inputs. */
  inventory: InventoryState;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const RATE_LIMIT_SECONDS = 2;

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

/**
 * Démarre un cycle de production sur un slot d'un bâtiment.
 *
 * - Valide les inputs côté serveur (buildingId, slotIndex, recipeId).
 * - Vérifie la compatibilité recette/bâtiment via RECIPES[recipeId].producibleBy.
 * - Vérifie que le slot est libre et que le joueur dispose des ressources requises.
 * - Consomme les inputs d'inventaire et pose startedAt = serverTimestamp().
 * - La transaction est atomique : toute vérification échouée annule l'ensemble.
 */
export async function startProductionSlotHandler(
  request: StartProductionSlotRequest
): Promise<StartProductionSlotResponse> {

  // ── 1. Authentification ───────────────────────────────────────────────────
  const uid = requireAuth(request);

  // ── 2. Rate limit — 1 appel / 2s par uid ─────────────────────────────────
  await checkRateLimit(uid, "startProductionSlot", RATE_LIMIT_SECONDS);

  // ── 3. Validation des inputs ──────────────────────────────────────────────
  const { buildingId, slotIndex, recipeId } = request.data;

  if (typeof buildingId !== "string" || buildingId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      `'buildingId' doit être une chaîne non vide. Valeur reçue : ${JSON.stringify(buildingId)}.`
    );
  }

  requireValidSlotIndex(slotIndex); // asserts slotIndex is 0 | 1 | 2
  requireValidRecipeId(recipeId);   // asserts recipeId is RecipeId

  const db          = admin.firestore();
  const playerRef   = db.collection("players").doc(uid);
  const buildingRef = db.collection("players").doc(uid).collection("buildings").doc(buildingId);

  try {

    // ── 4. Transaction atomique ───────────────────────────────────────────
    const { building, updatedInventory } = await db.runTransaction(async (tx) => {

      // 4a. Lecture player + building en parallèle
      const [playerSnap, buildingSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(buildingRef),
      ]);

      // 4b. Player existe + schema valide
      if (!playerSnap.exists) {
        throw new HttpsError("not-found", "Document joueur introuvable.");
      }
      const playerData = playerSnap.data() as PlayerDocument;
      requireSchemaVersion(playerData);

      // 4c. Building existe ?
      if (!buildingSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Bâtiment '${buildingId}' introuvable pour ce joueur.`
        );
      }
      const buildingData = buildingSnap.data() as BuildingDocument;

      // 4d. Recette compatible avec ce bâtiment ?
      const recipe = RECIPES[recipeId];
      if (!recipe.producibleBy.includes(buildingData.buildingType)) {
        throw new HttpsError(
          "failed-precondition",
          `La recette '${recipeId}' ne peut pas être produite par un bâtiment de type ` +
          `'${buildingData.buildingType}'. Bâtiments compatibles : ${recipe.producibleBy.join(", ")}.`
        );
      }

      // 4e. Slot disponible ?
      const targetSlot = buildingData.slots.find((s) => s.slotIndex === slotIndex);
      if (targetSlot === undefined) {
        throw new HttpsError(
          "not-found",
          `Slot ${slotIndex} introuvable dans le bâtiment '${buildingId}'.`
        );
      }
      if (targetSlot.recipeId !== null) {
        throw new HttpsError(
          "failed-precondition",
          `Le slot ${slotIndex} est déjà occupé par la recette '${targetSlot.recipeId}'.`
        );
      }

      // 4f. Copie défensive de l'inventaire — on ne mute pas le document Firestore directement.
      const updatedInventory: InventoryState = {
        logs:               { ...playerData.inventory.logs },
        planks:             { ...playerData.inventory.planks },
        reconstructionKits: { ...playerData.inventory.reconstructionKits },
      };

      // 4g. Vérification complète des ressources avant tout décrément.
      // Fail atomique : si une ressource manque, aucune n'est consommée.
      if (recipe.inputs !== null) {
        const missing: string[] = [];
        for (const [inputId, required] of Object.entries(recipe.inputs) as Array<[RecipeId, number]>) {
          const available = updatedInventory[RECIPE_TO_INVENTORY_KEY[inputId]].quantity;
          if (available < required) {
            missing.push(`${inputId} (requis : ${required}, disponible : ${available})`);
          }
        }
        if (missing.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            `Ressources insuffisantes pour démarrer '${recipeId}' : ${missing.join(" ; ")}.`
          );
        }

        // 4h. Décrément atomique — uniquement si toutes les vérifications ont passé.
        for (const [inputId, required] of Object.entries(recipe.inputs) as Array<[RecipeId, number]>) {
          const key = RECIPE_TO_INVENTORY_KEY[inputId];
          updatedInventory[key] = {
            ...updatedInventory[key],
            quantity: updatedInventory[key].quantity - required,
          };
        }
      }

      // 4i. Construction du slot mis à jour.
      // FieldValue.serverTimestamp() est interdit dans un array Firestore.
      // Timestamp.now() est fiable côté Cloud Function (horloge serveur
      // Google synchronisée NTP, drift = microseconde). Voir TD-007.
      const now = admin.firestore.Timestamp.now();

      const updatedSlot: ProductionSlotState = {
        ...targetSlot,
        recipeId,
        startedAt:       now,
        lastProcessedAt: null,
      };

      const updatedSlots = buildingData.slots.map((s) => s.slotIndex === slotIndex ? updatedSlot : s);

      // 4j-k. Écritures atomiques
      tx.update(buildingRef, { slots: updatedSlots });
      tx.update(playerRef,   { inventory: updatedInventory });

      const building: BuildingDocument = { ...buildingData, slots: updatedSlots };
      return { building, updatedInventory };
    });

    // ── 5. Retour ─────────────────────────────────────────────────────────
    return { building, inventory: updatedInventory };

  } catch (err) {
    // HttpsError remontés tels quels (auth, rate-limit, schema, validations, etc.).
    if (err instanceof HttpsError) throw err;

    logger.error("startProductionSlot: erreur inattendue", {
      uid,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    });
    throw new HttpsError("internal", "Erreur interne du serveur.");
  }
}

// ── Wrapper production — runtime Firebase uniquement ─────────────────────────

export const startProductionSlot = onCall(
  { invoker: "public" },
  startProductionSlotHandler
);
