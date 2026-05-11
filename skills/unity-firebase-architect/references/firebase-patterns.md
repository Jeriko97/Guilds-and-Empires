# Firebase Patterns — Guilds & Empires

## Firestore Schema V2

```
players/{uid}/
  profile:
    displayName: string
    level: int / xp: int
    createdAt: timestamp       ← FieldValue.serverTimestamp()
    lastLoginAt: timestamp
    schemaVersion: int         ← migration versioning, start at 1
  resources:
    gold: int / wood: int / stone: int / food: int
    gems: int                  ← premium currency (IAP only)
    updatedAt: timestamp
  buildings/{buildingId}:
    type: string / level: int
    lastCollectedAt: timestamp ← serverTimestamp on collection
    isLocked: bool
  inventory/{itemId}: { quantity: int }

guilds/{guildId}/
  info: { name, ownerId, memberCount, createdAt }
  members/{uid}: { role: "owner"|"officer"|"member", joinedAt }
  treasury: { gold: int, updatedAt: timestamp }

market/{region}/listings/{listingId}:
  sellerId / resourceType / quantity / pricePerUnit
  listedAt / expiresAt (TTL) / status: "active"|"sold"|"cancelled"

globalEconomy/prices: { wood, stone, food, updatedAt }
idempotency/{requestId}: { uid, processedAt }
```

**Schema rules:**
- Never store `uid` inside a document already keyed by `uid`
- Always include `schemaVersion` on top-level player documents
- All times = `FieldValue.serverTimestamp()`, never `DateTime.Now`
- TTL fields allow Firestore TTL policy for auto-deletion

## Firestore Security Rules (deploy before launch)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /players/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false;
      match /{subcollection}/{docId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false;
      }
    }
    match /guilds/{guildId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /market/{region}/listings/{listingId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /globalEconomy/{doc} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Cloud Function pattern (all economic mutations)

```typescript
export const collectBuilding = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'Login required');
  const uid = context.auth.uid;
  const { buildingId, requestId } = data;

  // 1. Idempotency check
  const idempKey = db.doc(`idempotency/${requestId}`);
  if ((await idempKey.get()).exists) return { status: 'already_processed' };

  // 2. Rate limiting
  await checkRateLimit(uid, 'collect');

  // 3. Atomic transaction — server calculates yield
  let yieldAmount = 0;
  await db.runTransaction(async t => {
    const buildingSnap = await t.get(db.doc(`players/${uid}/buildings/${buildingId}`));
    if (!buildingSnap.exists) throw new HttpsError('not-found', '');
    const building = buildingSnap.data()!;
    const elapsed = Date.now() - building.lastCollectedAt.toMillis();
    if (elapsed < MIN_INTERVAL_MS) throw new HttpsError('failed-precondition', 'Not ready');
    yieldAmount = calculateYield(building.type, building.level, elapsed);
    t.update(db.doc(`players/${uid}/buildings/${buildingId}`),
      { lastCollectedAt: FieldValue.serverTimestamp() });
    t.update(db.doc(`players/${uid}/resources`),
      { [building.type]: FieldValue.increment(yieldAmount),
        updatedAt: FieldValue.serverTimestamp() });
    t.set(idempKey, { uid, processedAt: FieldValue.serverTimestamp() });
  });
  return { status: 'ok', yield: yieldAmount };
});
```

## Firebase Initialization (correct order)

```csharp
public async Task InitializeAsync()
{
    var status = await FirebaseApp.CheckAndFixDependenciesAsync();
    if (status != DependencyStatus.Available)
        throw new Exception($"Firebase unavailable: {status}");

    // Enable offline persistence BEFORE any reads
    FirebaseFirestore.DefaultInstance.Settings = new FirebaseFirestoreSettings
    {
        PersistenceEnabled = true,
        CacheSizeBytes = 50 * 1024 * 1024
    };

    FirebaseAuth.DefaultInstance.StateChanged += OnAuthStateChanged;
}
```

## Cost control

- Never real-time listener on a document updated by all players simultaneously
- Always `Limit(50)` on collection listeners — never unbounded
- Close listeners in `OnApplicationPause(true)`
- Scheduled price updates: 1 Cloud Scheduler write every 5 min (not per-player listener)
- Set Firebase budget alert at $10/month in Console → Billing

## Remote Config defaults

```csharp
private Dictionary<string, object> GetDefaults() => new()
{
    ["woodProductionRate"]        = 10,
    ["collectionIntervalSeconds"] = 300,
    ["marketListingFeePercent"]   = 5,
    ["maxMarketListingsPerPlayer"]= 5,
    ["eventActive"]               = false,
    ["eventMultiplier"]           = 1.0,
};
```
