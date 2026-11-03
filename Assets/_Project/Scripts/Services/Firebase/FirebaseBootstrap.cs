using System;
using System.Threading;
using System.Threading.Tasks;
using Firebase;
using Firebase.Firestore;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Services.Firebase
{
    /// <summary>
    /// Initialises the Firebase SDK: dependency check and Firestore offline persistence.
    ///
    /// Offline persistence MUST be configured before any Firestore read or write. Enabling it
    /// here, immediately after CheckAndFixDependencies, guarantees the app can serve cached data
    /// even when the device has no network connection on subsequent launches.
    ///
    /// Returns false if dependencies are unavailable (no Google Play Services, emulator down).
    /// AppBootstrap treats an offline failure as a degraded-mode start, not a fatal error.
    ///
    /// <see cref="App"/> is the Firebase instance every service must use: the default instance, or — in the Editor
    /// with the emulator switch on — the named emulator instance (FirebaseEmulatorMode, ÉTAPE 19.4a).
    /// </summary>
    public sealed class FirebaseBootstrap
    {
        /// <summary>Instance chosen after the dependency check; null until InitializeAsync returns true.</summary>
        public FirebaseApp App { get; private set; }

        public async Task<bool> InitializeAsync(CancellationToken ct, TimeSpan timeout)
        {
            try
            {
                var checkTask = FirebaseApp.CheckAndFixDependenciesAsync();
                var timeoutTask = Task.Delay(timeout, ct);

                var winner = await Task.WhenAny(checkTask, timeoutTask);
                ct.ThrowIfCancellationRequested();

                if (winner == timeoutTask)
                {
                    GELogger.Warning("Firebase", $"Dependency check timed out after {timeout.TotalSeconds}s.");
                    return false;
                }

                var status = await checkTask;
                if (status != DependencyStatus.Available)
                {
                    GELogger.Error("Firebase", $"Dependencies unavailable: {status}");
                    return false;
                }

                // Only after DependencyStatus.Available: the instance must not be touched earlier (Android).
                var app = SelectApp();
                ConfigureFirestore(app);
                App = app;
                return true;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                GELogger.Error("Firebase", $"Init failed: {ex.Message}");
                return false;
            }
        }

        private static FirebaseApp SelectApp()
        {
#if UNITY_EDITOR
            if (FirebaseEmulatorMode.IsActive) return FirebaseEmulatorMode.CreateApp();
#endif
            return FirebaseApp.DefaultInstance;
        }

        private static void ConfigureFirestore(FirebaseApp app)
        {
            // Must be set before the first Firestore operation on this app instance.
            var db = FirebaseFirestore.GetInstance(app);
#if UNITY_EDITOR
            if (FirebaseEmulatorMode.IsActive)
            {
                FirebaseEmulatorMode.ConfigureFirestore(db);
                return;
            }
#endif
            // PersistenceEnabled = true keeps a local SQLite cache so reads succeed offline
            // and writes are queued and replayed when connectivity returns.
            db.Settings.PersistenceEnabled = true;
            GELogger.Info("Firebase", "SDK ready — offline persistence enabled.");
        }
    }
}
