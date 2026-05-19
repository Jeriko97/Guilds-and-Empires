# Doctrine — LiveOps

## Principe fondamental

Un jeu F2P sans LiveOps est un jeu qui meurt après le lancement.
La rétention J1/J7/J30 ne s'améliore pas sans itérations rapides sur l'équilibre et les événements.
Chaque valeur de gameplay qui pourrait changer est une clé Remote Config.

---

## Remote Config — Architecture complète

### Initialisation (avant tout gameplay)

```csharp
public class RemoteConfigManager : MonoBehaviour
{
    private static RemoteConfigManager _instance;
    public static RemoteConfigManager Instance => _instance;

    private FirebaseRemoteConfig _rc;

    // Valeurs typed — accès typé dans tout le projet
    public int GoldProductionRate      => _rc.GetValue("goldProductionRate").LongValue > 0
                                           ? (int)_rc.GetValue("goldProductionRate").LongValue
                                           : _defaults.goldProductionRate;
    public int CollectionIntervalSec   => (int)_rc.GetValue("collectionIntervalSeconds").LongValue;
    public int MarketFeePercent        => (int)_rc.GetValue("marketFeePercent").LongValue;
    public bool EventActive            => _rc.GetValue("eventActive").BooleanValue;
    public float EventMultiplier       => (float)_rc.GetValue("eventMultiplier").DoubleValue;
    public int MaxMarketListings       => (int)_rc.GetValue("maxMarketListingsPerPlayer").LongValue;
    public int GoldAnomalyThreshold    => (int)_rc.GetValue("maxGoldPerHour").LongValue;

    [SerializeField] private EconomyConstantsSO _defaults; // ScriptableObject fallback

    public async Task InitAsync(CancellationToken ct)
    {
        _rc = FirebaseRemoteConfig.DefaultInstance;
        await _rc.SetDefaultsAsync(BuildDefaults()).WaitAsync(ct);

        // Fetch + activate (cache 12h en prod, 0 en debug)
        var settings = new ConfigSettings
        {
            MinimumFetchInternalInMilliseconds = Application.isEditor ? 0UL : 43200000UL
        };
        await _rc.SetConfigSettingsAsync(settings).WaitAsync(ct);
        await _rc.FetchAndActivateAsync().WaitAsync(ct);
    }

    private Dictionary<string, object> BuildDefaults() => new()
    {
        ["goldProductionRate"]          = _defaults.goldProductionRate,
        ["collectionIntervalSeconds"]   = _defaults.collectionIntervalSeconds,
        ["marketFeePercent"]            = _defaults.marketFeePercent,
        ["maxMarketListingsPerPlayer"]  = _defaults.maxMarketListings,
        ["eventActive"]                 = false,
        ["eventMultiplier"]             = 1.0,
        ["guildMaxMembers"]             = 20,
        ["maxGoldPerHour"]              = 1000,
        ["newPlayerGoldBonus"]          = 100,
        ["buildingUpgradeBaseCost"]     = 200,
        ["buildingUpgradeScaling"]      = 1.8,
    };
}
```

### Refresh en session (événements temps réel)

```csharp
// Refresh Remote Config toutes les 30 minutes en session
// (permet d'activer/désactiver un événement sans relancer l'app)
private async Task ScheduleRemoteConfigRefresh(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        await Task.Delay(TimeSpan.FromMinutes(30), ct);
        await _rc.FetchAndActivateAsync().WaitAsync(ct);
        MainThreadDispatcher.Post(OnRemoteConfigUpdated);
    }
}

private void OnRemoteConfigUpdated()
{
    // Notifier les systèmes qui dépendent des valeurs RC
    EventBus.Publish(new RemoteConfigUpdatedEvent());
    // Exemple : réévaluer si un événement est actif
    if (RemoteConfigManager.Instance.EventActive)
        ShowEventBanner();
}
```

---

## Registry des clés Remote Config

Toute nouvelle clé DOIT être ajoutée ici ET dans `EconomyConstantsSO`.
Ne jamais hardcoder une valeur de gameplay en C# sans passer par ce registry.

| Clé | Type | Défaut SO | Portée | Note |
|---|---|---|---|---|
| `goldProductionRate` | int | 10 | Économie | Unités/heure/niveau |
| `collectionIntervalSeconds` | int | 300 | Économie | Min 60 |
| `marketFeePercent` | int | 5 | Économie | 0-20 |
| `maxMarketListingsPerPlayer` | int | 5 | Économie | 1-50 |
| `guildMaxMembers` | int | 20 | Guilde | |
| `eventActive` | bool | false | LiveOps | Activer/désactiver événement |
| `eventMultiplier` | float | 1.0 | LiveOps | Multiplicateur production |
| `eventName` | string | "" | LiveOps | Nom affiché de l'événement |
| `eventEndTimestamp` | long | 0 | LiveOps | Unix timestamp fin événement |
| `newPlayerGoldBonus` | int | 100 | Onboarding | Bonus démarrage |
| `maxGoldPerHour` | int | 1000 | Anti-triche | Seuil anomalie |
| `buildingUpgradeBaseCost` | int | 200 | Économie | Coût base upgrade |
| `buildingUpgradeScaling` | float | 1.8 | Économie | Multiplicateur/niveau |
| `pushNotifEnabled` | bool | true | FCM | Kill-switch notifs |
| `maintenanceMode` | bool | false | Ops | Afficher écran maintenance |

---

## Événements LiveOps — Architecture data-driven

Un événement LiveOps ne nécessite pas un nouveau build. Il s'active via Remote Config.

```
Remote Config → eventActive: true
             → eventName: "Festival des Marchands"
             → eventMultiplier: 2.0
             → eventEndTimestamp: 1753056000 (UNIX)
```

```csharp
public class LiveOpsEventBanner : MonoBehaviour
{
    [SerializeField] private TMP_Text _eventTitle;
    [SerializeField] private TMP_Text _timeRemaining;

    void OnEnable()
    {
        EventBus.Subscribe<RemoteConfigUpdatedEvent>(OnConfigUpdated);
        Refresh();
    }

    void OnDisable() => EventBus.Unsubscribe<RemoteConfigUpdatedEvent>(OnConfigUpdated);

    private void Refresh()
    {
        var rc = RemoteConfigManager.Instance;
        gameObject.SetActive(rc.EventActive);
        if (!rc.EventActive) return;

        _eventTitle.SetText(rc.EventName);
        var endTime = DateTimeOffset.FromUnixTimeSeconds(rc.EventEndTimestamp);
        var remaining = endTime - DateTimeOffset.UtcNow;
        _timeRemaining.SetText("{0}h {1}m", (int)remaining.TotalHours, remaining.Minutes);
    }
}
```

---

## Analytics — Events obligatoires

Firebase Analytics est une dépendance de production. Sans données, pas de décisions LiveOps éclairées.

### Events au lancement (Day 1)

```csharp
public static class AnalyticsEvents
{
    // Session
    public static void SessionStart(string uid, int level)
        => FirebaseAnalytics.LogEvent("session_start",
            new Parameter("uid", uid),
            new Parameter("player_level", level));

    // Auth
    public static void AuthSuccess(string method)
        => FirebaseAnalytics.LogEvent("auth_success",
            new Parameter("method", method)); // "email", "google", "anonymous"

    // Économie (critique pour détecter les déséquilibres)
    public static void BuildingCollected(string type, int level, int yield)
        => FirebaseAnalytics.LogEvent("building_collected",
            new Parameter("building_type", type),
            new Parameter("building_level", level),
            new Parameter("yield_amount", yield));

    public static void TradeExecuted(string resourceType, int quantity, int pricePerUnit, bool isBuying)
        => FirebaseAnalytics.LogEvent("trade_executed",
            new Parameter("resource_type", resourceType),
            new Parameter("quantity", quantity),
            new Parameter("price_per_unit", pricePerUnit),
            new Parameter("is_buying", isBuying ? 1L : 0L));

    public static void IAPCompleted(string productId, int gemsGranted)
        => FirebaseAnalytics.LogEvent("iap_completed",
            new Parameter("product_id", productId),
            new Parameter("gems_granted", gemsGranted));

    // Erreurs (diagnostic production)
    public static void CloudFunctionFailed(string functionName, string errorCode)
        => FirebaseAnalytics.LogEvent("cf_error",
            new Parameter("function_name", functionName),
            new Parameter("error_code", errorCode));

    // LiveOps
    public static void EventBannerSeen(string eventName)
        => FirebaseAnalytics.LogEvent("liveops_event_seen",
            new Parameter("event_name", eventName));
}
```

### Métriques de rétention (à configurer dans Firebase Console)

| Audience | Condition | Usage |
|---|---|---|
| D1 returning | Session dans les 24h | Rétention J1 |
| D7 returning | Session entre J6 et J8 | Rétention J7 |
| D30 returning | Session entre J29 et J31 | Rétention J30 |
| High spender | IAP cumulé > seuil | Segment monétisation |
| At-risk | Pas de session depuis 5 jours | Cibler pour push notif |

---

## Firebase Cloud Messaging (FCM) — Re-engagement

```csharp
// Push notification quand un bâtiment est prêt à collecter
// Envoyé par Cloud Function (Scheduled) — pas par le client

// Cloud Function (scheduled toutes les heures) :
export const notifyReadyBuildings = functions.pubsub.schedule('every 1 hours').onRun(async () => {
  const now = Date.now();
  // Cherche les bâtiments prêts (lastCollectedAt + interval < now)
  const readyBuildings = await db.collectionGroup('buildings')
    .where('lastCollectedAt', '<', new Date(now - MIN_INTERVAL_MS))
    .where('notifiedAt', '<', new Date(now - 3_600_000)) // pas de spam (1 notif/heure max)
    .limit(500).get();

  for (const doc of readyBuildings.docs) {
    const uid = doc.ref.parent.parent!.id;
    const playerToken = await getFCMToken(uid);
    if (!playerToken) continue;

    await admin.messaging().send({
      token: playerToken,
      notification: { title: 'Guilds & Empires', body: 'Votre production est prête !' },
      data: { screen: 'main_hub', buildingId: doc.id }
    });
    await doc.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
  }
});
```

---

## A/B Testing via Remote Config Conditions

```
Firebase Console → Remote Config → Add condition → "User in 50% bucket"
→ Assign eventMultiplier = 3.0 for this bucket (vs 2.0 default)
→ Track trade_executed volume per bucket in Analytics
→ After 7 days: promote winning variant as new default
```

Pas de code C# différent par variant — le code lit `RemoteConfigManager.Instance.EventMultiplier`
sans savoir dans quel bucket il est. Les conditions Remote Config gèrent la randomisation.

---

## Maintenance Mode

```csharp
// AppController — vérification au démarrage et toutes les 5 minutes
private async Task CheckMaintenanceModeAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        if (RemoteConfigManager.Instance.MaintenanceMode)
        {
            ShowMaintenanceScreen();
            return; // Arrêt — l'utilisateur doit relancer l'app
        }
        await Task.Delay(TimeSpan.FromMinutes(5), ct);
    }
}
```
