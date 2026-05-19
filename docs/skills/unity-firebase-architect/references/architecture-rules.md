# Architecture Rules — Guilds & Empires (V2)

## Structure des dossiers Assets (cible)

```
Assets/
└── _Project/
    ├── Scripts/
    │   ├── App/
    │   │   ├── AppController.cs          # Bootstrap Firebase + séquence init
    │   │   ├── AppStateMachine.cs        # Boot → Auth → MainHub → [screens]
    │   │   └── MainThreadDispatcher.cs   # Dispatch Firebase callbacks → main thread
    │   ├── Services/
    │   │   ├── Interfaces/
    │   │   │   ├── IAuthService.cs
    │   │   │   ├── IProfileService.cs
    │   │   │   ├── IEconomyService.cs
    │   │   │   ├── IBuildingService.cs
    │   │   │   ├── IMarketService.cs
    │   │   │   └── IRemoteConfigService.cs
    │   │   ├── Firebase/
    │   │   │   ├── FirebaseAuthService.cs
    │   │   │   ├── FirebaseProfileService.cs
    │   │   │   ├── FirebaseEconomyService.cs
    │   │   │   ├── FirebaseBuildingService.cs
    │   │   │   └── FirebaseMarketService.cs
    │   │   └── ServiceLocator.cs
    │   ├── Economy/
    │   │   ├── Models/
    │   │   │   ├── PlayerProfile.cs
    │   │   │   ├── ResourceBundle.cs
    │   │   │   ├── Building.cs
    │   │   │   └── MarketListing.cs
    │   │   └── EconomyCalculator.cs     # Logique pure — pas de Firebase ici
    │   ├── UI/
    │   │   ├── Screens/
    │   │   │   ├── Auth/
    │   │   │   ├── MainHub/
    │   │   │   └── Market/
    │   │   └── Components/
    │   │       └── SafeAreaPanel.cs
    │   ├── LiveOps/
    │   │   ├── RemoteConfigManager.cs
    │   │   └── AnalyticsEvents.cs
    │   └── Editor/
    │       └── PreExportFirebase.cs
    ├── Data/                              # ScriptableObjects uniquement
    │   ├── Economy/
    │   │   └── EconomyConstantsSO.cs     # Fallback RC — contient tous les defaults
    │   ├── Resources/
    │   │   └── ResourceTypeSO.cs
    │   └── Buildings/
    │       └── BuildingDefinitionSO.cs
    ├── Scenes/
    │   ├── Boot.unity
    │   ├── Auth.unity
    │   ├── MainHub.unity
    │   └── Market.unity
    └── Addressables/
        ├── UI/
        ├── Icons/
        └── Audio/
```

---

## Service Layer — Règles strictes

### Interface obligatoire pour tout service Firebase

```csharp
// OBLIGATOIRE — une interface par domaine
public interface IEconomyService
{
    Task<ResourceBundle> GetResourcesAsync(CancellationToken ct);
    Task RequestCollectAsync(string buildingId, CancellationToken ct);
    Task RequestTradeAsync(string listingId, CancellationToken ct);
    IDisposable ObserveResources(string uid, Action<ResourceBundle> onChanged);
}

// WRONG — static class non mockable, non testable, non remplaçable
public static class EconomyService
{
    public static async Task CollectAsync(string id) { /* accès Firebase direct */ }
}
```

### ServiceLocator (pas de DI framework)

```csharp
public static class Services
{
    public static IAuthService Auth             { get; private set; }
    public static IProfileService Profile       { get; private set; }
    public static IEconomyService Economy       { get; private set; }
    public static IBuildingService Buildings    { get; private set; }
    public static IMarketService Market         { get; private set; }
    public static IRemoteConfigService RC       { get; private set; }

    public static void Initialize()
    {
        Auth      = new FirebaseAuthService();
        Profile   = new FirebaseProfileService();
        Economy   = new FirebaseEconomyService();
        Buildings = new FirebaseBuildingService();
        Market    = new FirebaseMarketService();
        RC        = new FirebaseRemoteConfigService();
    }

    // Pour les tests d'intégration avec Firebase Emulator (pas de mocks)
    public static void InitializeForTesting()
    {
        // Même implémentation — pointe vers l'émulateur via configuration
        Initialize();
    }
}
```

---

## AppController — Séquence d'init obligatoire

```csharp
public class AppController : MonoBehaviour
{
    public static event Action OnReady;

    private async void Start()
    {
        ShowLoadingScreen();

        // 1. Firebase init (peut prendre 2-5 secondes sur Snapdragon 665)
        try
        {
            var status = await FirebaseApp.CheckAndFixDependenciesAsync()
                .WaitAsync(TimeSpan.FromSeconds(10));
            if (status != DependencyStatus.Available)
            {
                ShowError($"Firebase unavailable: {status}");
                return;
            }
        }
        catch (TimeoutException)
        {
            ShowError("Connexion impossible. Vérifiez votre réseau.");
            return;
        }

        // 2. Offline persistence (avant tout read)
        FirebaseFirestore.DefaultInstance.Settings = new FirebaseFirestoreSettings
        {
            PersistenceEnabled = true,
            CacheSizeBytes = 50 * 1024 * 1024
        };

        // 3. Remote Config (avant que le gameplay soit visible)
        await RemoteConfigManager.Instance.InitAsync(destroyCancellationToken);

        // 4. ServiceLocator
        Services.Initialize();

        // 5. App Check
        FirebaseAppCheck.DefaultInstance.SetAppCheckProviderFactory(
            new PlayIntegrityProviderFactory());

        HideLoadingScreen();
        OnReady?.Invoke();
    }
}
```

---

## MonoBehaviour — Cycle de vie correct

```csharp
public class BuildingScreen : MonoBehaviour
{
    private IDisposable _buildingListener;
    private CancellationTokenSource _cts;

    // WRONG — Start peut être appelé avant AppController.OnReady
    // void Start() { LoadBuildings(); }

    // CORRECT — attendre que Firebase soit prêt
    void OnEnable()
    {
        _cts = new CancellationTokenSource();
        AppController.OnReady += InitializeScreen;

        // Si déjà prêt (scène chargée après init)
        if (AppController.IsReady) InitializeScreen();
    }

    void OnDisable()
    {
        AppController.OnReady -= InitializeScreen;
        _cts?.Cancel();
        _cts?.Dispose();
        _buildingListener?.Dispose(); // TOUJOURS disposer les listeners Firestore
    }

    // WRONG — suspend Firebase en background sans fermer les listeners
    // void OnApplicationPause(bool p) { } // ← ne rien faire = drain batterie + charges Firestore

    // CORRECT
    void OnApplicationPause(bool paused)
    {
        if (paused)
        {
            _buildingListener?.Dispose();
            _buildingListener = null;
        }
        else
        {
            if (AppController.IsReady) ResubscribeListener();
        }
    }

    private void OnBuildingChanged(Building b)
    {
        // WRONG — accès UI sur thread Firebase → crash Android
        // buildingLevelText.text = b.level.ToString();

        // CORRECT — dispatch sur le main thread
        MainThreadDispatcher.Post(() => UpdateBuildingUI(b));
    }
}
```

---

## App State Machine

```
Boot
  ↓ (Firebase init OK)
FirebaseReady
  ↓ (Auth.CurrentUser != null)    ↓ (CurrentUser == null)
MainHub                          AuthScreen
  ↓ (all game screens)              ↓ (login success)
[BuildingScreen, MarketScreen,    MainHub
 GuildScreen, etc.]

Error states :
  Boot → FirebaseUnavailable (timeout, offline)
  Any  → MaintenanceScreen (Remote Config maintenanceMode = true)
```

---

## Patterns interdits (VETO immédiat)

| Pattern | VETO reason |
|---|---|
| `FirebaseFirestore.DefaultInstance` dans un MonoBehaviour | Passe par Services.Economy / Services.Profile |
| `FirebaseAuth.DefaultInstance.CurrentUser` dans l'UI | Passe par Services.Auth |
| Static class avec état Firebase | Non testable, non injectable |
| `async void` hors callback Unity | Exception silencieuse |
| Listener sans Dispose | Fuite mémoire + batterie + charges Firestore |
| `Resources.Load` en gameplay | Bloque le main thread, gonfle le build |
| `DateTime.Now` dans un contexte de jeu | Spoofable — `FieldValue.serverTimestamp()` |
| `PlayerPrefs` pour l'état économique | Client-side = pas server-authoritative |

---

## Ce qu'on ne construit PAS (YAGNI — respecté jusqu'à 50k DAU)

```
✗ Generic IRepository<T>
✗ Event sourcing / CQRS
✗ Kubernetes / Docker
✗ Custom DI container (Zenject, VContainer)
✗ Microservices Firebase projects séparés
✗ Serveur de jeu dédié (Mirror, Photon, Fish-Net)
✗ Message queue (Pub/Sub, RabbitMQ)
✗ ORM Firebase
✗ Redux / MVI pattern
```

Ces patterns seront envisagés quand un problème spécifique les justifie,
pas par anticipation.
