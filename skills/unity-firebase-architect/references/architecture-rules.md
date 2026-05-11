# Architecture Rules — Guilds & Empires

## Unity Project Structure

```
Assets/
└── _Project/
    ├── Scripts/
    │   ├── App/               # Bootstrap, AppController, StateMachine
    │   ├── Services/
    │   │   ├── Interfaces/    # IAuthService, IEconomyService, etc.
    │   │   └── Firebase/      # Concrete implementations
    │   ├── Economy/           # Models, EconomyManager, MarketManager
    │   ├── UI/
    │   │   ├── Screens/       # One folder per screen
    │   │   └── Components/    # Reusable UI widgets
    │   ├── LiveOps/           # RemoteConfigManager, AnalyticsManager
    │   └── Editor/            # Build scripts, editor tools
    ├── Data/                  # ScriptableObjects only
    │   ├── Resources/
    │   ├── Buildings/
    │   └── Economy/           # EconomyConstantsSO (RC fallback values)
    ├── Scenes/
    └── Addressables/
```

## Service Layer Rules

Every service that touches Firebase must have an interface:
```csharp
public interface IEconomyService
{
    Task<ResourceBundle> GetResourcesAsync(string uid);
    Task RequestAddResourcesAsync(string uid, string source, ResourceType type, int amount);
}
// WRONG — static class, not mockable
public static class EconomyService { ... }
```

## ServiceLocator (no DI framework needed at this scale)
```csharp
public static class Services
{
    public static IAuthService Auth { get; private set; }
    public static IProfileService Profile { get; private set; }
    public static IEconomyService Economy { get; private set; }
    public static IRemoteConfigService RemoteConfig { get; private set; }

    public static void Initialize(bool useMocks = false)
    {
        Auth        = useMocks ? new MockAuthService()    : new FirebaseAuthService();
        Profile     = useMocks ? new MockProfileService() : new FirebaseProfileService();
        Economy     = useMocks ? new MockEconomyService() : new FirebaseEconomyService();
        RemoteConfig = new FirebaseRemoteConfigService();
    }
}
```

## No service access in Awake/Start
Firebase may not be initialized. Always go through AppController's init sequence:
```csharp
// WRONG
void Start() { var profile = await Services.Profile.GetAsync(uid); }
// CORRECT
void OnEnable() { AppController.OnReady += InitializeUI; }
```

## App Lifecycle — Required States
```
Boot → FirebaseInit → Auth → MainHub → [Game screens]
              ↓ (failure)
          ErrorScreen (with retry)
```

## MonoBehaviour lifecycle hygiene
```csharp
public class ProfileScreen : MonoBehaviour
{
    private IDisposable _profileListener;
    private CancellationTokenSource _cts;

    void OnEnable()
    {
        _cts = new CancellationTokenSource();
        _profileListener = Services.Profile.Observe(uid, OnProfileChanged);
    }

    void OnDisable()
    {
        _cts?.Cancel(); _cts?.Dispose();
        _profileListener?.Dispose();  // ALWAYS dispose Firestore listeners
    }

    private void OnProfileChanged(PlayerProfile p)
    {
        // Firebase callbacks arrive on background thread
        MainThreadDispatcher.Post(() => UpdateUI(p));
    }
}
```

## MainThreadDispatcher (required — write before any Firebase UI)
```csharp
public class MainThreadDispatcher : MonoBehaviour
{
    private static readonly Queue<Action> _queue = new Queue<Action>();

    public static void Post(Action action)
    {
        lock (_queue) { _queue.Enqueue(action); }
    }

    void Update()
    {
        while (true)
        {
            Action action;
            lock (_queue)
            {
                if (_queue.Count == 0) break;
                action = _queue.Dequeue();
            }
            action();
        }
    }
}
```

## ScriptableObject for all config
```csharp
[CreateAssetMenu(menuName = "G&E/Economy/ResourceType")]
public class ResourceTypeSO : ScriptableObject
{
    public string resourceId;
    public Sprite icon;
    public int baseProductionRate;  // fallback if RC not set
    public int maxStorage;
}
```

## What NOT to build (YAGNI for solo founder)
- Generic repository pattern with T generics
- Event sourcing / CQRS
- Kubernetes / containerized backend
- Custom authentication server
- WebSockets outside Firebase Realtime DB
- Microservices before 50k DAU
