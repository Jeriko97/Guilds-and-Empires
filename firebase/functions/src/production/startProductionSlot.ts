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
  ProductionOpDocument,
  ProductionSlotState,
  RecipeId,
} from "../shared/types";

// ── Types d'API — source de vérité pour tests et bindings client ──────────────

/** Données envoyées par le client. Toutes les valeurs sont unknown — validées au runtime. */
interface StartProductionSlotData {
  buildingId:     unknown;
  slotIndex:      unknown;
  recipeId:       unknown;
  /** N du lot (planks, kits — D-ETAPE19-001). Interdit pour logs (production continue). */
  cycles?:        unknown;
  /** UUID par intention, généré par le client (D-ETAPE19-003). */
  idempotencyKey: unknown;
}

export type StartProductionSlotRequest  = CallableRequest<StartProductionSlotData>;
export type StartProductionSlotResponse = {
  /** Building mis à jour avec le slot démarré. startedAt approximé par Timestamp.now() côté retour. */
  building:  BuildingDocument;
  /** Inventaire mis à jour après consommation des inputs. */
  inventory: InventoryState;
  /** true = clé d'idempotence déjà appliquée avec le même contenu : aucun effet, état courant renvoyé. */
  alreadyApplied: boolean;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const RATE_LIMIT_SECONDS = 2;

/**
 * Clé d'idempotence = UUID par intention (D-ETAPE19-003). Le format strict garantit aussi un
 * identifiant de document Firestore valide (pas de « / », de « . », ni de nom réservé « __x__ »).
 */
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Handler — logique métier, testé directement sans wrapper Firebase ─────────

/**
 * Démarre une production sur un slot d'un bâtiment.
 *
 * - Logs : production continue (D3.1), `cycles` refusé.
 * - Planks / kits : lot de N cycles (D-ETAPE19-001), 1 ≤ N ≤ RECIPES[recipeId].maxBatchCycles
 *   (D-ETAPE19-004) ; intrants des N cycles débités au lancement ; N × outputQty ≤ place libre.
 * - Idempotence (D-ETAPE19-003) : trace productionOps lue juste après le joueur, AVANT les
 *   contrôles métier — un renvoi après un lancement réussi trouve le slot occupé et doit recevoir
 *   alreadyApplied = true.
 * - Seule l'intention vient du client ; durées, coûts et bornes viennent de RECIPES.
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
  const { buildingId, slotIndex, recipeId, cycles, idempotencyKey } = request.data;

  if (typeof buildingId !== "string" || buildingId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      `'buildingId' doit être une chaîne non vide. Valeur reçue : ${JSON.stringify(buildingId)}.`
    );
  }

  requireValidSlotIndex(slotIndex); // asserts slotIndex is 0 | 1 | 2
  requireValidRecipeId(recipeId);   // asserts recipeId is RecipeId

  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new HttpsError("invalid-argument", "idempotencyKey requis (UUID).");
  }

  // N du lot : intention du client, bornée par la recette (jamais une durée ni un coût).
  const recipe = RECIPES[recipeId];
  let batchCycles: number | null;
  if (recipe.maxBatchCycles === null) {
    if (cycles !== undefined) {
      throw new HttpsError(
        "invalid-argument",
        `'cycles' est interdit pour '${recipeId}' (production continue).`
      );
    }
    batchCycles = null;
  } else {
    if (
      typeof cycles !== "number" || !Number.isInteger(cycles) ||
      cycles < 1 || cycles > recipe.maxBatchCycles
    ) {
      throw new HttpsError(
        "invalid-argument",
        `'cycles' doit être un entier entre 1 et ${recipe.maxBatchCycles} pour '${recipeId}'. ` +
        `Valeur reçue : ${JSON.stringify(cycles)}.`
      );
    }
    batchCycles = cycles;
  }

  const db          = admin.firestore();
  const playerRef   = db.collection("players").doc(uid);
  const buildingRef = db.collection("players").doc(uid).collection("buildings").doc(buildingId);
  const opRef       = db.collection("players").doc(uid).collection("productionOps").doc(idempotencyKey);

  try {

    // ── 4. Transaction atomique ───────────────────────────────────────────
    return await db.runTransaction(async (tx): Promise<StartProductionSlotResponse> => {

      // 4a. Lecture player + building + trace d'idempotence en parallèle
      const [playerSnap, buildingSnap, opSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(buildingRef),
        tx.get(opRef),
      ]);

      // 4b. Player existe + schema valide
      if (!playerSnap.exists) {
        throw new HttpsError("not-found", "Document joueur introuvable.");
      }
      const playerData = playerSnap.data() as PlayerDocument;
      requireSchemaVersion(playerData);

      // 4b'. Idempotence — AVANT les contrôles métier (D-ETAPE19-003).
      if (opSnap.exists) {
        const op = opSnap.data() as ProductionOpDocument;
        const samePayload =
          op.uid        === uid        &&
          op.op         === "start"    &&
          op.buildingId === buildingId &&
          op.slotIndex  === slotIndex  &&
          op.recipeId   === recipeId   &&
          op.cycles     === batchCycles;
        if (!samePayload) {
          throw new HttpsError(
            "failed-precondition",
            "idempotency key already used with different payload"
          );
        }
        if (!buildingSnap.exists) {
          throw new HttpsError(
            "not-found",
            `Bâtiment '${buildingId}' introuvable pour ce joueur.`
          );
        }
        return {
          building:       buildingSnap.data() as BuildingDocument,
          inventory:      playerData.inventory,
          alreadyApplied: true,
        };
      }

      // 4c. Building existe ?
      if (!buildingSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Bâtiment '${buildingId}' introuvable pour ce joueur.`
        );
      }
      const buildingData = buildingSnap.data() as BuildingDocument;

      // 4d. Recette compatible avec ce bâtiment ?
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
      // Lot : intrants des N cycles (N × coût unitaire), débités au lancement.
      const inputMultiplier = batchCycles ?? 1;
      if (recipe.inputs !== null) {
        const missing: string[] = [];
        for (const [inputId, unitCost] of Object.entries(recipe.inputs) as Array<[RecipeId, number]>) {
          const required  = unitCost * inputMultiplier;
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

      }

      // 4g'. Lot : N × outputQty ≤ place libre de la ressource produite (D-ETAPE19-004).
      // Ne protège pas d'un autre slot qui remplirait la même ressource en parallèle.
      if (batchCycles !== null) {
        const output    = updatedInventory[RECIPE_TO_INVENTORY_KEY[recipeId]];
        const freeSpace = output.cap - output.quantity;
        const needed    = batchCycles * recipe.outputQty;
        if (needed > freeSpace) {
          throw new HttpsError(
            "failed-precondition",
            `Place insuffisante pour un lot de ${batchCycles} '${recipeId}' : ` +
            `requis ${needed}, place libre ${freeSpace}.`
          );
        }
      }

      // 4h. Décrément atomique — uniquement si toutes les vérifications ont passé.
      if (recipe.inputs !== null) {
        for (const [inputId, unitCost] of Object.entries(recipe.inputs) as Array<[RecipeId, number]>) {
          const key = RECIPE_TO_INVENTORY_KEY[inputId];
          updatedInventory[key] = {
            ...updatedInventory[key],
            quantity: updatedInventory[key].quantity - unitCost * inputMultiplier,
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
        cyclesPlanned:   batchCycles,
        cyclesProcessed: batchCycles === null ? null : 0,
      };

      const updatedSlots = buildingData.slots.map((s) => s.slotIndex === slotIndex ? updatedSlot : s);

      const op: ProductionOpDocument = {
        uid,
        op:        "start",
        buildingId,
        slotIndex,
        recipeId,
        cycles:    batchCycles,
        createdAt: now,
      };

      // 4j-l. Écritures atomiques
      tx.update(buildingRef, { slots: updatedSlots });
      tx.update(playerRef,   { inventory: updatedInventory });
      tx.set(opRef, op);

      // ── 5. Retour ───────────────────────────────────────────────────────
      const building: BuildingDocument = { ...buildingData, slots: updatedSlots };
      return { building, inventory: updatedInventory, alreadyApplied: false };
    });

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
