import { logger } from "firebase-functions/logger";
import type { HttpsError } from "firebase-functions/v2/https";

// ── Marqueur d'alerte (TD-021, ÉTAPE 19.5a, D-ETAPE19-017) ────────────────────
//
// Chaque erreur visée par une alerte de TD-021 est journalisée par `logger.error` avec un champ
// structuré `alerte`. Dans Cloud Logging, ce champ apparaît sous `jsonPayload.alerte` ; les
// politiques d'alerte versionnées (`firebase/monitoring/td021-*.json`) filtrent sur sa valeur.
// Source unique : `src/__test__/alertes.test.ts` vérifie que les filtres des politiques reprennent
// ces valeurs exactes.

/** Nom du champ structuré qui porte le marqueur d'alerte (`jsonPayload.alerte`). */
export const CHAMP_ALERTE = "alerte";

/** Échec d'une Cloud Function planifiée (`updateMarketPrices`, demain `processWorldEventLifecycle`). */
export const ALERTE_CF_PLANIFIEE = "cf-planifiee";

/** État de slot corrompu (`HttpsError` `data-loss`, D-ETAPE19-010 Q1). */
export const ALERTE_SLOT_CORROMPU = "slot-corrompu";

/**
 * Enveloppe des Cloud Functions planifiées : appelle le handler ; en cas d'erreur, journalise le
 * marqueur `cf-planifiee` (champs `fonction` : nom de la fonction, et `erreur` : message de l'erreur d'origine),
 * puis relance la même erreur. Le champ s'appelle `erreur`, pas `message` : le logger de firebase-functions
 * écrase un champ structuré `message` par le texte du journal (`entryFromArgs`).
 * Comportement d'échec inchangé : la planification voit toujours l'échec.
 *
 * Toute nouvelle CF planifiée doit l'utiliser, sinon aucune alerte ne part : `updateMarketPrices`
 * aujourd'hui ; `processWorldEventLifecycle` à sa création (ÉTAPE 20), dont le service Cloud Run et
 * le job Cloud Scheduler devront aussi être ajoutés au filtre de `td021-cf-planifiees.json` (TD-021).
 */
export function avecAlerteCfPlanifiee<E>(
  nom: string,
  handler: (event: E) => void | Promise<void>,
): (event: E) => Promise<void> {
  return async (event: E): Promise<void> => {
    try {
      await handler(event);
    } catch (err) {
      logger.error(`${nom}: échec de la CF planifiée`, {
        [CHAMP_ALERTE]: ALERTE_CF_PLANIFIEE,
        fonction: nom,
        erreur: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

/**
 * Champs ajoutés au `logger.error` « état de slot corrompu » : le marqueur `slot-corrompu` et le
 * code de l'`HttpsError` levée (tiré de l'erreur, jamais écrit en dur ; vaut `data-loss`,
 * D-ETAPE19-010 Q1). Le filtre de l'alerte vise ce code (« Le filtre d'alerte de TD-021 vise ce
 * code. »). Tout nouveau point de journalisation d'un état de slot corrompu doit les porter, sinon
 * aucune alerte ne part.
 */
export function champsAlerteSlotCorrompu(err: HttpsError): { [CHAMP_ALERTE]: string; code: string } {
  return { [CHAMP_ALERTE]: ALERTE_SLOT_CORROMPU, code: err.code };
}
