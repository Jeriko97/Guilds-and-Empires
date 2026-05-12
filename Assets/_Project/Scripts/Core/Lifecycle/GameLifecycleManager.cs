using System;
using UnityEngine;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Core.Lifecycle
{
    /// <summary>
    /// Centralises application lifecycle events for mobile: pause, resume, and focus changes.
    ///
    /// Firebase listeners MUST be suspended on pause to prevent battery drain and background
    /// Firestore read charges. Subscribe to Paused/Resumed and call listener.Stop()/listener.Start().
    ///
    /// Session time is tracked here so other systems can decide whether a resume constitutes
    /// a new session (e.g. re-authenticate, refresh data) based on background duration.
    /// </summary>
    [DefaultExecutionOrder(-90)]
    public sealed class GameLifecycleManager : MonoBehaviour
    {
        /// <summary>Fired when the app moves to the background. Suspend Firebase listeners here.</summary>
        public static event Action Paused;

        /// <summary>Fired when the app returns to the foreground. Resume Firebase listeners here.</summary>
        public static event Action Resumed;

        public static event Action FocusLost;
        public static event Action FocusGained;

        private float _sessionStartTime;
        private float _backgroundedAt;
        private bool _isPaused;

        /// <summary>Elapsed real-time seconds since the current session started.</summary>
        public float SessionDurationSeconds => Time.realtimeSinceStartup - _sessionStartTime;

        /// <summary>Seconds the app spent in the background during the most recent pause.</summary>
        public float LastBackgroundDurationSeconds { get; private set; }

        public bool IsPaused => _isPaused;

        private void Awake()
        {
            _sessionStartTime = Time.realtimeSinceStartup;
        }

        private void OnApplicationPause(bool paused)
        {
            // Unity fires OnApplicationPause(false) on first focus on some Android versions.
            // Guard against duplicate events.
            if (paused == _isPaused) return;
            _isPaused = paused;

            if (paused)
            {
                _backgroundedAt = Time.realtimeSinceStartup;
                GELogger.Info("Lifecycle", $"App paused — session t={SessionDurationSeconds:F0}s");
                Paused?.Invoke();
            }
            else
            {
                LastBackgroundDurationSeconds = Time.realtimeSinceStartup - _backgroundedAt;
                GELogger.Info("Lifecycle", $"App resumed — was backgrounded {LastBackgroundDurationSeconds:F0}s");
                Resumed?.Invoke();
            }
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (hasFocus)
                FocusGained?.Invoke();
            else
                FocusLost?.Invoke();
        }
    }
}
