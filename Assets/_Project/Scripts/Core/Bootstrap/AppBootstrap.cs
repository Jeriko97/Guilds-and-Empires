using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using GuildsAndEmpires.Core.Config;
using GuildsAndEmpires.Core.Lifecycle;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Core.Threading;
using GuildsAndEmpires.Services.Firebase;
using GuildsAndEmpires.UI.Screens;

namespace GuildsAndEmpires.Core.Bootstrap
{
    /// <summary>
    /// Application entry point. Lives on a DontDestroyOnLoad GameObject in the Boot scene.
    ///
    /// Initialization order (sequential, each step logs its outcome):
    ///   1. Logging configured from EnvironmentConfig
    ///   2. Core services registered in ServiceLocator
    ///   3. Network reachability checked (informational — Firebase handles offline via persistence)
    ///   4. Firebase SDK initialized, Firestore offline persistence enabled
    ///   5. Remote Config fetched and activated (non-fatal, falls back to ScriptableObject defaults)
    ///   6. AppState set to Ready or OfflineReady
    ///   7. ScreenManager.OnBootReady() called — first screen is pushed here
    ///
    /// CancellationToken is cancelled on OnDestroy. Any async step that checks the token will
    /// stop cleanly when the app is force-quit mid-init (e.g. in the editor).
    /// </summary>
    [DefaultExecutionOrder(-100)]
    [RequireComponent(typeof(MainThreadDispatcher))]
    [RequireComponent(typeof(GameLifecycleManager))]
    [RequireComponent(typeof(ScreenManager))]
    public sealed class AppBootstrap : MonoBehaviour
    {
        public enum AppState { Initializing, Ready, OfflineReady, Failed }

        [Header("Config Assets")]
        [SerializeField] private AppConfig _appConfig;
        [SerializeField] private EnvironmentConfig _environmentConfig;
        [SerializeField] private RemoteConfigDefaults _remoteConfigDefaults;

        [Header("Core Managers")]
        [SerializeField] private GameLifecycleManager _lifecycleManager;
        [SerializeField] private ScreenManager _screenManager;

        /// <summary>Current state of the initialization pipeline. Checked by late-initialising systems.</summary>
        public static AppState State { get; private set; } = AppState.Initializing;

        /// <summary>True if the device had network access when the app launched.</summary>
        public static bool IsOnline { get; private set; }

        private CancellationTokenSource _cts;

        private void Awake()
        {
            DontDestroyOnLoad(gameObject);
            _cts = new CancellationTokenSource();

            // Logging must be configured before any other system logs — do it first in Awake.
            GELogger.Configure(_environmentConfig);
            GELogger.Info("Bootstrap",
                $"Guilds & Empires v{_appConfig.Version}+{_appConfig.BuildNumber} " +
                $"[{_environmentConfig.Environment}] — init start");
        }

        private async void Start()
        {
            try
            {
                await RunInitPipeline(_cts.Token);
            }
            catch (OperationCanceledException)
            {
                GELogger.Warning("Bootstrap", "Init pipeline cancelled.");
            }
            catch (Exception ex)
            {
                GELogger.Error("Bootstrap", $"Fatal init error: {ex}");
                State = AppState.Failed;
                // TODO: Push a FatalErrorScreen via ScreenManager.
            }
        }

        private async Task RunInitPipeline(CancellationToken ct)
        {
            // --- Step 1: Register core services ------------------------------------------------
            // Synchronous. These services are safe to resolve from any subsequent step.
            ServiceLocator.Register<GameLifecycleManager>(_lifecycleManager);
            ServiceLocator.Register<ScreenManager>(_screenManager);
            GELogger.Debug("Bootstrap", "Core services registered.");

            // --- Step 2: Network check ---------------------------------------------------------
            // Informational only. Firebase offline persistence means we can still start offline.
            IsOnline = Application.internetReachability != NetworkReachability.NotReachable;
            GELogger.Info("Bootstrap", $"Network: {(IsOnline ? "online" : "offline")}");

            // --- Step 3: Firebase SDK ----------------------------------------------------------
            // Required. Configures Firestore offline persistence before any read/write occurs.
            var firebaseTimeout = TimeSpan.FromSeconds(_appConfig.FirebaseInitTimeoutSeconds);
            var firebaseBootstrap = new FirebaseBootstrap();
            bool firebaseReady = await firebaseBootstrap.InitializeAsync(ct, firebaseTimeout);

            if (!firebaseReady)
            {
                if (IsOnline)
                {
                    // Firebase failure while online = something is fundamentally wrong (missing config, etc.)
                    GELogger.Error("Bootstrap", "Firebase failed while online — cannot proceed.");
                    State = AppState.Failed;
                    return;
                }
                // Firebase failure while offline = tolerated. Firestore persistence serves cached data.
                GELogger.Warning("Bootstrap", "Firebase unavailable offline — starting in limited mode.");
            }

            // --- Step 4: Remote Config ---------------------------------------------------------
            // Non-fatal. ScriptableObject defaults are pre-loaded so values are always valid.
            // Skipped when EnvironmentConfig.SkipRemoteConfig is set (editor debug override).
            if (firebaseReady && !_environmentConfig.SkipRemoteConfig)
            {
                var rcTimeout = TimeSpan.FromSeconds(_appConfig.RemoteConfigTimeoutSeconds);
                var rcBootstrap = new RemoteConfigBootstrap(_remoteConfigDefaults);
                await rcBootstrap.FetchAndActivateAsync(ct, rcTimeout);
            }

            // --- Step 5: Ready -----------------------------------------------------------------
            State = firebaseReady ? AppState.Ready : AppState.OfflineReady;
            GELogger.Info("Bootstrap", $"Init complete — {State}");

            // Signal the screen layer. ScreenManager decides which screen to show first.
            _screenManager.OnBootReady(State);
        }

        private void OnDestroy()
        {
            State = AppState.Initializing;
            _cts?.Cancel();
            _cts?.Dispose();
        }
    }
}
