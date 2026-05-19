import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

interface RateLimitDocument {
  uid: string;
  action: string;
  lastCalledAt: admin.firestore.Timestamp;
}

/**
 * Vérifie le rate limit pour une action donnée par uid.
 * Bloque si l'action a déjà été appelée dans les `intervalSeconds` dernières secondes.
 * Écrit dans /rateLimits/{uid}_{action} — uniquement accessible via Admin SDK.
 *
 * @param uid             - UID Firebase Auth du joueur.
 * @param action          - Identifiant de l'action (ex: 'resolveLoginState').
 * @param intervalSeconds - Fenêtre minimale entre deux appels autorisés.
 *
 * @throws HttpsError('resource-exhausted') si le rate limit est dépassé.
 *
 * @example
 * await checkRateLimit(uid, "resolveLoginState", 5);
 * // Throw si appelé moins de 5 secondes après le précédent appel du même uid.
 */
export async function checkRateLimit(
  uid: string,
  action: string,
  intervalSeconds: number
): Promise<void> {
  const db = admin.firestore();
  const docId = `${uid}_${action}`;
  const ref = db.collection("rateLimits").doc(docId);

  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data() as RateLimitDocument;
    const lastCalledAt = data.lastCalledAt;
    const now = admin.firestore.Timestamp.now();

    const elapsedMs = now.toMillis() - lastCalledAt.toMillis();
    const intervalMs = intervalSeconds * 1000;

    if (elapsedMs < intervalMs) {
      const remainingSeconds = Math.ceil((intervalMs - elapsedMs) / 1000);
      throw new HttpsError(
        "resource-exhausted",
        `Rate limit dépassé pour l'action '${action}'. Réessaie dans ${remainingSeconds} seconde${remainingSeconds > 1 ? "s" : ""}.`
      );
    }
  }

  // Autorisé — on pose le timestamp serveur pour la prochaine vérification.
  await ref.set({
    uid,
    action,
    lastCalledAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
