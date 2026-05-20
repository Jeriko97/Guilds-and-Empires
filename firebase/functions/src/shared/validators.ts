import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { CURRENT_SCHEMA_VERSION } from "./types";
import type { PlayerDocument, RecipeId, ContractTier } from "./types";

// Tableaux de référence pour les validations runtime (les types TS sont effacés à l'exécution).
const VALID_RECIPE_IDS: RecipeId[] = ["logs", "planks", "reconstruction_kits"];
const VALID_CONTRACT_TIERS: ContractTier[] = ["standard", "reinforced", "priority"];
const VALID_SLOT_INDICES: Array<0 | 1 | 2> = [0, 1, 2];

/**
 * Extrait l'uid depuis request.auth.
 * Throw si la requête n'est pas authentifiée.
 *
 * @example
 * const uid = requireAuth(request);
 * // uid: string garanti non-null après cet appel
 */
export function requireAuth(request: CallableRequest<unknown>): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentification requise.");
  }
  return request.auth.uid;
}

/**
 * Vérifie que le document joueur correspond au schéma actif.
 * Throw si la version diffère — le joueur doit passer par la migration avant toute opération économique.
 *
 * @example
 * requireSchemaVersion(playerDoc);
 * // Passe si playerDoc.schemaVersion === CURRENT_SCHEMA_VERSION
 */
export function requireSchemaVersion(playerDoc: PlayerDocument): void {
  if (playerDoc.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new HttpsError(
      "failed-precondition",
      `Schéma joueur obsolète : version ${playerDoc.schemaVersion} trouvée, version ${CURRENT_SCHEMA_VERSION} attendue. Migration requise.`
    );
  }
}

/**
 * Vérifie que value est un entier strictement positif.
 * Throw si ce n'est pas un nombre, si c'est un flottant, ou si value <= 0.
 *
 * @param fieldName - Nom du champ affiché dans le message d'erreur.
 *
 * @example
 * requirePositiveInteger(request.data.quantity, "quantity");
 * requirePositiveInteger(request.data.slotIndex, "slotIndex");
 */
export function requirePositiveInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new HttpsError(
      "invalid-argument",
      `'${fieldName}' doit être un entier strictement positif. Valeur reçue : ${JSON.stringify(value)}.`
    );
  }
}

/**
 * Vérifie que value est un RecipeId valide.
 * Throw si la valeur n'appartient pas à l'ensemble autorisé.
 *
 * @example
 * requireValidRecipeId(request.data.recipeId);
 */
export function requireValidRecipeId(value: unknown): asserts value is RecipeId {
  if (!VALID_RECIPE_IDS.includes(value as RecipeId)) {
    throw new HttpsError(
      "invalid-argument",
      `recipeId invalide : '${value}'. Valeurs acceptées : ${VALID_RECIPE_IDS.join(", ")}.`
    );
  }
}

/**
 * Vérifie que value est un index de slot valide (0, 1 ou 2).
 * Throw si la valeur n'est pas exactement 0, 1 ou 2.
 *
 * Note : requirePositiveInteger ne convient pas — 0 est un slot valide mais pas un entier
 * strictement positif. Ce validator accepte explicitement les trois valeurs entières autorisées.
 *
 * @param fieldName - Nom du champ affiché dans le message d'erreur (défaut : "slotIndex").
 *
 * @example
 * requireValidSlotIndex(request.data.slotIndex);
 * // slotIndex: 0 | 1 | 2 garanti après cet appel
 */
export function requireValidSlotIndex(
  value: unknown,
  fieldName = "slotIndex"
): asserts value is 0 | 1 | 2 {
  if (!VALID_SLOT_INDICES.includes(value as 0 | 1 | 2)) {
    throw new HttpsError(
      "invalid-argument",
      `'${fieldName}' doit être 0, 1 ou 2. Valeur reçue : ${JSON.stringify(value)}.`
    );
  }
}

/**
 * Vérifie que value est un ContractTier valide.
 * Throw si la valeur n'appartient pas à l'ensemble autorisé.
 *
 * @example
 * requireValidContractTier(request.data.tier);
 */
export function requireValidContractTier(value: unknown): asserts value is ContractTier {
  if (!VALID_CONTRACT_TIERS.includes(value as ContractTier)) {
    throw new HttpsError(
      "invalid-argument",
      `tier invalide : '${value}'. Valeurs acceptées : ${VALID_CONTRACT_TIERS.join(", ")}.`
    );
  }
}
