import * as admin from "firebase-admin";
import { beforeUserCreated } from "firebase-functions/v2/identity";

// Trigger Firebase Auth : crée le profil Firestore à l'inscription de chaque nouveau joueur.
// Le client ne peut pas créer de document profil (Security Rules : allow write: if false).
// Ce trigger garantit qu'un profil existe avant que le client tente de le lire.
export const initPlayerProfile = beforeUserCreated(
  { region: "us-central1" },
  async (event) => {
    const { uid, email, displayName } = event.data;

    // Nom affiché dérivé de l'email si absent (ex: "alice" depuis "alice@example.com")
    const derivedName = displayName
      ?? email?.split("@")[0]
      ?? `Player_${uid.slice(0, 6)}`;

    await admin.firestore().collection("profiles").doc(uid).set({
      displayName:  derivedName,
      level:        1,
      gold:         0,
      schemaVersion: 1,
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastClaimedDailyBonusAt: null,
    });
  }
);
