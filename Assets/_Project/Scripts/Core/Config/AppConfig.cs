using UnityEngine;

namespace GuildsAndEmpires.Core.Config
{
    /// <summary>
    /// App-wide settings: version, timeouts, and session policy.
    /// Create one asset per environment (dev/staging/prod) and select via EnvironmentConfig.
    /// </summary>
    [CreateAssetMenu(fileName = "AppConfig", menuName = "GuildsAndEmpires/Config/App Config")]
    public sealed class AppConfig : GameConfigBase
    {
        [Header("Identity")]
        [SerializeField] private string _version = "0.1.0";
        [SerializeField] private string _buildNumber = "1";

        [Header("Session")]
        [Tooltip("Seconds of background time before a resume is treated as a fresh session.")]
        [SerializeField] private float _sessionTimeoutSeconds = 1800f;

        [Header("Initialization Timeouts")]
        [Tooltip("Max seconds to wait for Firebase CheckAndFixDependencies before treating it as failed.")]
        [SerializeField] private float _firebaseInitTimeoutSeconds = 10f;
        [Tooltip("Max seconds to wait for Remote Config fetch before falling back to ScriptableObject defaults.")]
        [SerializeField] private float _remoteConfigTimeoutSeconds = 5f;

        public string Version => _version;
        public string BuildNumber => _buildNumber;
        public float SessionTimeoutSeconds => _sessionTimeoutSeconds;
        public float FirebaseInitTimeoutSeconds => _firebaseInitTimeoutSeconds;
        public float RemoteConfigTimeoutSeconds => _remoteConfigTimeoutSeconds;
    }
}
