import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getAuth } from "firebase-admin/auth";

// Crée le profil Firestore automatiquement à l'inscription d'un nouveau joueur.
// Le client ne peut pas créer de document profil (Security Rules : allow write: if false).
// Ce trigger Auth garantit qu'un profil existe avant que le client tente de le lire.
export const createUserProfile = onDocumentCreated(
  { document: "dummyTrigger/{id}", region: "us-central1" },
  async () => { /* placeholder — voir onUserCreated ci-dessous */ }
);

// Trigger Firebase Auth : se déclenche à chaque création de compte.
import { onRequest } from "firebase-functions/v2/https";

// Note: Firebase Functions v2 Auth triggers utilisent le SDK firebase-functions/v2/identity
// Activation : https://firebase.google.com/docs/functions/auth-events
import { beforeUserCreated } from "firebase-functions/v2/identity";

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

    // Aucun retour — beforeUserCreated peut retourner des claims supplémentaires si besoin.
  }
);
