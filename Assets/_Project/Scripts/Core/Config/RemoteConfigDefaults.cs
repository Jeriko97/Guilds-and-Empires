using System;
using System.Collections.Generic;
using UnityEngine;

namespace GuildsAndEmpires.Core.Config
{
    /// <summary>
    /// Defines the default values for every Firebase Remote Config key used in the game.
    ///
    /// These defaults are pushed to the Firebase SDK at startup so values are immediately
    /// available even before the first network fetch completes.
    ///
    /// RULE: every tunable gameplay number must have an entry here.
    /// The ScriptableObject is the fallback; Remote Config overrides it for A/B tests,
    /// seasonal events, and emergency rebalancing — no store update required.
    /// </summary>
    [CreateAssetMenu(fileName = "RemoteConfigDefaults", menuName = "GuildsAndEmpires/Config/Remote Config Defaults")]
    public sealed class RemoteConfigDefaults : GameConfigBase
    {
        [SerializeField] private List<RemoteConfigEntry> _entries = new();

        /// <summary>Converts entries to the dictionary format expected by Firebase Remote Config SDK.</summary>
        public Dictionary<string, object> ToDictionary()
        {
            var dict = new Dictionary<string, object>(_entries.Count);
            foreach (var entry in _entries)
            {
                if (!string.IsNullOrWhiteSpace(entry.key))
                    dict[entry.key] = entry.defaultValue;
            }
            return dict;
        }
    }

    [Serializable]
    public struct RemoteConfigEntry
    {
        [Tooltip("The Remote Config key. Must match exactly what is set in the Firebase console.")]
        public string key;
        [Multiline(2)]
        [Tooltip("Default value used when Remote Config is unavailable or the key is not yet in the console.")]
        public string defaultValue;
    }
}
