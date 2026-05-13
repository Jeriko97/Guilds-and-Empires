using System;
using System.Threading;
using Firebase.Firestore;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Core.Threading;

namespace GuildsAndEmpires.Services
{
    /// <summary>
    /// Implémentation Firebase de <see cref="IProfileService"/>.
    /// Lit le profil Firestore en temps réel et dispatche les callbacks sur le main thread Unity.
    ///
    /// Le profil est créé côté client par <c>AuthUIController.CreatePlayerProfileAsync</c>
    /// immédiatement après le signup Firebase Auth.
    ///
    /// SUPPRIMÉ : AddGoldAsync — toute mutation économique passe par IEconomyService
    /// (Cloud Function claimDailyBonus / collectBuilding / etc.).
    /// </summary>
    public sealed class ProfileService : IProfileService
    {
        private static CollectionReference Profiles =>
            FirebaseFirestore.DefaultInstance.Collection("profiles");

        public IDisposable Observe(string uid, Action<ProfileData> onChanged, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(uid))
                throw new ArgumentException("uid ne peut pas être null ou vide.", nameof(uid));

            var listener = Profiles.Document(uid).Listen(snapshot =>
            {
                // Le callback Firestore arrive sur un thread du pool — jamais sur le main thread Unity.
                // MainThreadDispatcher.Post garantit que l'UI ne crashe pas sur Android.
                if (!snapshot.Exists)
                {
                    // Le profil n'existe pas encore (écriture Firestore en cours ou échouée).
                    // Ne rien faire : le listener se redéclenchera quand le profil sera créé.
                    GELogger.Debug("ProfileService", $"Snapshot inexistant pour uid {uid} — en attente du trigger.");
                    return;
                }

                ProfileData data;
                try
                {
                    data = MapSnapshot(snapshot);
                }
                catch (Exception ex)
                {
                    GELogger.Error("ProfileService", $"Erreur de mapping snapshot: {ex.Message}");
                    return;
                }

                MainThreadDispatcher.Post(() => onChanged?.Invoke(data));
            });

            // Arrête le listener proprement si le CancellationToken est annulé
            // (ex: OnDisable du MonoBehaviour, OnDestroy, ou timeout de session).
            ct.Register(() => listener.Stop());
            return listener;
        }

        // ── Modèle Firestore (lecture seule) ────────────────────────────────────────
        // uid intentionnellement absent : la clé du document EST l'uid, pas de redondance.
        [FirestoreData]
        private sealed class FirestoreProfile
        {
            [FirestoreProperty] public string displayName  { get; set; } = string.Empty;
            [FirestoreProperty] public int    level        { get; set; } = 1;
            [FirestoreProperty] public long   gold         { get; set; } = 0;
            [FirestoreProperty] public int    schemaVersion { get; set; } = 0;
        }

        private static ProfileData MapSnapshot(DocumentSnapshot snapshot)
        {
            var p = snapshot.ConvertTo<FirestoreProfile>();
            return new ProfileData(p.displayName, p.level, p.gold, p.schemaVersion);
        }
    }
}
