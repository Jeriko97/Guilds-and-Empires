using UnityEngine;

namespace GuildsAndEmpires.Core.Config
{
    /// <summary>
    /// Base class for all game configuration ScriptableObjects.
    ///
    /// ScriptableObjects hold the design-time default for every tunable value.
    /// Remote Config overrides those defaults at runtime — the SO is the fallback, not the source of truth.
    /// Never hardcode a balance value in C#; always use a config asset that Remote Config can override.
    /// </summary>
    public abstract class GameConfigBase : ScriptableObject { }
}
