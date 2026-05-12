using System.Diagnostics;
using GuildsAndEmpires.Core.Config;

namespace GuildsAndEmpires.Core.Logging
{
    /// <summary>
    /// Structured logging abstraction. All game code uses this — never UnityEngine.Debug directly.
    ///
    /// Verbose and Debug calls are stripped entirely from release builds (no string allocation,
    /// no method call) via [Conditional]. Info/Warning/Error remain but are filtered by _minLevel.
    ///
    /// Remote Config can lower _minLevel at runtime for live debugging without a store update.
    /// </summary>
    public static class GELogger
    {
        public enum LogLevel { Verbose = 0, Debug = 1, Info = 2, Warning = 3, Error = 4, None = 5 }

        private static LogLevel _minLevel = LogLevel.Info;

        /// <summary>Must be called first in AppBootstrap.Awake before any other log output.</summary>
        public static void Configure(EnvironmentConfig config)
        {
            _minLevel = config != null ? config.MinLogLevel : LogLevel.Info;
        }

        /// <summary>Overrides the minimum level at runtime (e.g. applied from Remote Config).</summary>
        public static void SetMinLevel(LogLevel level) => _minLevel = level;

        /// <summary>Stripped from release builds. Use for spam-level diagnostic traces.</summary>
        [Conditional("DEVELOPMENT_BUILD"), Conditional("UNITY_EDITOR")]
        public static void Verbose(string tag, string message)
        {
            if (_minLevel <= LogLevel.Verbose)
                UnityEngine.Debug.Log($"[{tag}] {message}");
        }

        /// <summary>Stripped from release builds. Use for per-frame or high-frequency logs.</summary>
        [Conditional("DEVELOPMENT_BUILD"), Conditional("UNITY_EDITOR")]
        public static void Debug(string tag, string message)
        {
            if (_minLevel <= LogLevel.Debug)
                UnityEngine.Debug.Log($"[{tag}] {message}");
        }

        public static void Info(string tag, string message)
        {
            if (_minLevel <= LogLevel.Info)
                UnityEngine.Debug.Log($"[{tag}] {message}");
        }

        public static void Warning(string tag, string message)
        {
            if (_minLevel <= LogLevel.Warning)
                UnityEngine.Debug.LogWarning($"[{tag}] {message}");
        }

        public static void Error(string tag, string message)
        {
            if (_minLevel <= LogLevel.Error)
                UnityEngine.Debug.LogError($"[{tag}] {message}");
        }
    }
}
