# Doctrine — Anti-Cheat

## Principe fondamental

Le client est territoire hostile. Toute valeur provenant du client est potentiellement falsifiée.
Le serveur re-dérive toutes les valeurs depuis l'état stocké dans Firestore.
L'anti-triche n'est pas une feature — c'est une propriété structurelle de l'architecture.

---

## Modèle de menace (threat model)

| Vecteur d'attaque | Méthode | Impact | Mitigation |
|---|---|---|---|
| Gold injection | Client-side Firestore write | Economy collapse | Security Rules `write: if false` |
| Timer manipulation | Client sends fake elapsed time | Free production | Server reads `lastCollectedAt` |
| Amount spoofing | Client sends `amount: 999999` | Economy inflation | Server re-derives amount |
| Profile hijacking | Write to another uid's doc | Account theft | Rules: `request.auth.uid == uid` |
| API scraping/bots | Script calls Firebase API | Economy farming | App Check + rate limiting |
| Memory editing | GameGuardian/Cheat Engine on client RAM | UI-only — no server effect if correctly architected | Server-authoritative state |
| Replay attacks | Resend valid request packet | Double spend | Idempotency keys + nonce |
| Receipt forgery | Fake IAP receipt | Free premium currency | Server-side receipt validation |
| Clock manipulation | Device clock spoofed | Timer exploitation | `FieldValue.serverTimestamp()` |
| Negative values | `amount: -999999` to drain others | Account destruction | Validation: `amount > 0 && amount <= MAX` |

---

## Couches de défense (defence in depth)

```
Layer 1 — App Check        : bloc les clients non-officiels (bots, scripts)
Layer 2 — Auth             : uid vérifié par Firebase Auth (JWT côté serveur)
Layer 3 — Security Rules   : write: if false sur tout l'état économique
Layer 4 — Cloud Function   : validation, rate limiting, re-dérivation des montants
Layer 5 — Transaction      : atomicité + optimistic locking Firestore
Layer 6 — Idempotency      : protection double-spend
Layer 7 — Anomaly detection: flag/freeze si pattern suspect
```

---

## Firebase App Check — Configuration obligatoire

```csharp
// AppController.cs — init sequence
private async Task InitFirebaseAsync()
{
    // 1. Init Firebase
    var status = await FirebaseApp.CheckAndFixDependenciesAsync();
    if (status != DependencyStatus.Available) throw new Exception($"Firebase unavailable: {status}");

    // 2. App Check (Play Integrity sur Android, DeviceCheck sur iOS)
    var appCheck = FirebaseAppCheck.DefaultInstance;
    appCheck.SetAppCheckProviderFactory(
        new PlayIntegrityProviderFactory() // Android
        // new DeviceCheckProviderFactory() // iOS
    );
    
    // Sans App Check, n'importe quel script peut appeler vos Cloud Functions
    // avec vos credentials Firebase (qui sont dans google-services.json dans l'APK)
}
```

**Activer dans Firebase Console :** App Check → Enforce pour Firestore + Cloud Functions.

---

## Firestore Security Rules — Minima absolus

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Profil joueur : lecture = propriétaire uniquement, écriture = jamais (Cloud Functions)
    match /players/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false;

      match /{subcollection}/{docId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false;  // tout passe par Cloud Functions
      }
    }

    // Guildes : lecture si authentifié, écriture CF only
    match /guilds/{guildId} {
      allow read: if request.auth != null;
      allow write: if false;
      match /{sub}/{doc} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }

    // Marché : lecture si authentifié, écriture CF only
    match /market/{region}/listings/{listingId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // Prix globaux : lecture si authentifié, écriture CF only (Cloud Scheduler)
    match /globalEconomy/{doc} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // Idempotency : inaccessible aux clients
    match /idempotency/{doc} {
      allow read, write: if false;
    }

    // Anomalies : inaccessible aux clients
    match /anomalies/{doc} {
      allow read, write: if false;
    }

    // Tout le reste : interdit
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Cloud Function — Template de validation complet

```typescript
export const collectBuilding = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) throw new HttpsError('unauthenticated', 'Login required');
  const uid = context.auth.uid;

  // 2. Input validation (type + bounds)
  const { buildingId, requestId } = data;
  if (typeof buildingId !== 'string' || !buildingId.match(/^[a-zA-Z0-9_-]{1,64}$/))
    throw new HttpsError('invalid-argument', 'Invalid buildingId');
  if (typeof requestId !== 'string' || !requestId.match(/^[a-f0-9-]{36}$/))
    throw new HttpsError('invalid-argument', 'Invalid requestId');

  // 3. Idempotency check
  const idempRef = db.doc(`idempotency/${requestId}`);
  if ((await idempRef.get()).exists) return { status: 'already_processed' };

  // 4. Rate limiting
  await checkRateLimit(uid, 'collect', MAX_COLLECTS_PER_MINUTE);

  // 5. Transaction atomique — server derives all values
  let yieldAmount = 0;
  await db.runTransaction(async t => {
    const buildingSnap = await t.get(db.doc(`players/${uid}/buildings/${buildingId}`));
    if (!buildingSnap.exists) throw new HttpsError('not-found', 'Building not found');

    const building = buildingSnap.data()!;
    // Elapsed time comes from Firestore server timestamp, NOT from client
    const elapsed = Date.now() - building.lastCollectedAt.toMillis();
    if (elapsed < MIN_COLLECTION_INTERVAL_MS)
      throw new HttpsError('failed-precondition', 'Not ready');

    // Yield is server-calculated from building state
    yieldAmount = Math.min(
      calculateYield(building.type, building.level, elapsed),
      getStorageCap(building.type, building.level)
    );

    t.update(db.doc(`players/${uid}/buildings/${buildingId}`),
      { lastCollectedAt: FieldValue.serverTimestamp() });
    t.update(db.doc(`players/${uid}/resources`),
      { [building.resourceType]: FieldValue.increment(yieldAmount),
        updatedAt: FieldValue.serverTimestamp() });
    t.set(idempRef, { uid, processedAt: FieldValue.serverTimestamp() });
  });

  // 6. Anomaly check (non-bloquant pour l'UX — log async)
  checkEconomyAnomaly(uid, yieldAmount, 'collect').catch(console.error);

  return { status: 'ok', yield: yieldAmount };
});
```

---

## Rate Limiting — Implémentation

```typescript
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  collect:  { max: 10,  windowMs: 60_000  }, // 10 collectes/minute
  trade:    { max: 20,  windowMs: 60_000  }, // 20 trades/minute
  upgrade:  { max: 5,   windowMs: 60_000  }, // 5 upgrades/minute
  listItem: { max: 10,  windowMs: 3_600_000 }, // 10 listings/heure
};

async function checkRateLimit(uid: string, action: string, max?: number): Promise<void> {
  const limit = RATE_LIMITS[action];
  if (!limit) return;

  const window = Math.floor(Date.now() / limit.windowMs);
  const ref = db.doc(`rateLimits/${uid}/${action}_${window}`);

  await db.runTransaction(async t => {
    const snap = await t.get(ref);
    const count = snap.exists ? snap.data()!.count : 0;
    if (count >= limit.max)
      throw new HttpsError('resource-exhausted', `Too many ${action} requests`);
    t.set(ref, { count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}
```

---

## Ce que l'anti-triche NE peut PAS empêcher (et ce n'est pas grave)

| Vecteur | Impact réel | Décision |
|---|---|---|
| Modification RAM côté client | Affichage incorrect uniquement — le serveur est la vérité | Accepté — pas de risque économique |
| Screenshots/screen capture | Pas de donnée sensible dans l'UI | Accepté |
| Reverse engineering de l'APK | Firebase config exposée — App Check protège l'API | App Check est la mitigation |
| VPN / IP spoofing | Pas de logique géo-dépendante | Accepté |

**Règle d'or :** Ne pas sur-investir dans l'anti-cheat client. Tout ce qui compte est
protégé par le serveur. Le client est une interface — pas un arbitre.
