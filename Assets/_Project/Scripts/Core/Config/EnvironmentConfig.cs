using UnityEngine;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Core.Config
{
    public enum AppEnvironment { Development, Staging, Production }

    /// <summary>
    /// Per-environment settings. Create three assets (Dev/Staging/Prod) and assign the correct one
    /// to AppBootstrap in each build configuration. Only the Development asset should have
    /// SkipRemoteConfig enabled.
    ///
    /// Firebase project is determined by google-services.json — this asset controls app behaviour,
    /// not which Firebase project is used.
    /// </summary>
    [CreateAssetMenu(fileName = "EnvironmentConfig", menuName = "GuildsAndEmpires/Config/Environment Config")]
    public sealed class EnvironmentConfig : GameConfigBase
    {
        [Header("Environment")]
        [SerializeField] private AppEnvironment _environment = AppEnvironment.Development;

        [Header("Logging")]
        [SerializeField] private GELogger.LogLevel _minLogLevel = GELogger.LogLevel.Debug;

        [Header("Remote Config")]
        [Tooltip("Minimum seconds between Remote Config fetches. Firebase enforces 3600s minimum in production.")]
        [SerializeField] private long _remoteConfigFetchIntervalSeconds = 3600;

        [Header("Developer Overrides")]
        [Tooltip("Skip Remote Config fetch and run on ScriptableObject defaults only. Effective in Editor only.")]
        [SerializeField] private bool _skipRemoteConfig;

        public AppEnvironment Environment => _environment;
        public GELogger.LogLevel MinLogLevel => _minLogLevel;
        public long RemoteConfigFetchIntervalSeconds => _remoteConfigFetchIntervalSeconds;
        public bool IsProduction => _environment == AppEnvironment.Production;

        /// <summary>True only when SkipRemoteConfig is checked AND we are running in the Editor.</summary>
        public bool SkipRemoteConfig => _skipRemoteConfig && Application.isEditor;
    }
}
