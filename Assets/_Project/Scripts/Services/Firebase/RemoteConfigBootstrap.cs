using System;
using System.Threading;
using System.Threading.Tasks;
using Firebase.RemoteConfig;
using GuildsAndEmpires.Core.Config;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Services.Firebase
{
    /// <summary>
    /// Fetches and activates Firebase Remote Config with a timeout and graceful fallback.
    ///
    /// Flow:
    ///   1. Push ScriptableObject defaults to the SDK — values are available immediately.
    ///   2. Fetch from the network (capped by timeout).
    ///   3. Activate fetched config so GetValue() returns the new values.
    ///   4. On timeout or error, ScriptableObject defaults remain active — no crash, no stall.
    ///
    /// This method is non-fatal. The game ALWAYS has valid config because defaults are set first.
    /// A timeout just means this session runs on last-fetch or default values.
    /// </summary>
    public sealed class RemoteConfigBootstrap
    {
        private readonly RemoteConfigDefaults _defaults;

        public RemoteConfigBootstrap(RemoteConfigDefaults defaults)
        {
            _defaults = defaults;
        }

        public async Task FetchAndActivateAsync(CancellationToken ct, TimeSpan fetchTimeout)
        {
            try
            {
                var rc = FirebaseRemoteConfig.DefaultInstance;

                // Set ScriptableObject values as in-process defaults so they are accessible
                // immediately via GetValue(), before the network round-trip completes.
                await rc.SetDefaultsAsync(_defaults.ToDictionary());
                GELogger.Debug("RemoteConfig", "Defaults applied from ScriptableObject.");

                var fetchTask = rc.FetchAsync(TimeSpan.Zero);
                var timeoutTask = Task.Delay(fetchTimeout, ct);

                var winner = await Task.WhenAny(fetchTask, timeoutTask);
                ct.ThrowIfCancellationRequested();

                if (winner == timeoutTask)
                {
                    GELogger.Warning("RemoteConfig",
                        $"Fetch timed out after {fetchTimeout.TotalSeconds}s — running on defaults.");
                    return;
                }

                await fetchTask;
                await rc.ActivateAsync();
                GELogger.Info("RemoteConfig", "Fetched and activated.");
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Non-fatal. ScriptableObject defaults are already active via SetDefaultsAsync.
                GELogger.Warning("RemoteConfig", $"Fetch failed: {ex.Message} — running on defaults.");
            }
        }
    }
}
