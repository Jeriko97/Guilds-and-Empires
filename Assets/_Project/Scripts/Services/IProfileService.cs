using System;
using System.Threading;

namespace GuildsAndEmpires.Services
{
    /// <summary>
    /// Service contract for player profile data.
    ///
    /// All callers depend on this interface — never on the concrete implementation.
    /// The concrete class accesses Firebase; callers must not import Firebase namespaces.
    ///
    /// IMPORTANT — AddGold is intentionally absent from this interface.
    /// Gold mutations are server-authoritative: the client calls a Cloud Function with only
    /// a building ID or action ID. The server computes the amount and writes to Firestore.
    /// A client-side AddGold is an economy exploit waiting to happen.
    /// </summary>
    public interface IProfileService
    {
        /// <summary>
        /// Subscribes to real-time profile updates for the given uid.
        /// The callback fires immediately with the current value, then on every change.
        /// Callback is guaranteed to arrive on the Unity main thread.
        /// The returned IDisposable must be disposed when the subscriber is destroyed.
        /// </summary>
        IDisposable Observe(string uid, Action<ProfileData> onChanged, CancellationToken ct);
    }

    /// <summary>
    /// Immutable snapshot of a player's profile as stored in Firestore.
    /// schemaVersion is required for forward-compatible migrations — increment when fields change.
    /// uid is NOT stored inside the document (the document key IS the uid — no redundancy).
    /// </summary>
    public readonly struct ProfileData
    {
        public readonly string DisplayName;
        public readonly int Level;
        public readonly long Gold;
        public readonly int SchemaVersion;

        public ProfileData(string displayName, int level, long gold, int schemaVersion)
        {
            DisplayName = displayName;
            Level = level;
            Gold = gold;
            SchemaVersion = schemaVersion;
        }
    }
}
