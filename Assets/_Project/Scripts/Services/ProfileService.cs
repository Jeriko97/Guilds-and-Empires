using System;
using System.Threading.Tasks;
using Firebase.Firestore;

public static class ProfileService
{
    // Modèle Firestore
    [FirestoreData]
    public class Profile
    {
        [FirestoreProperty] public int level { get; set; } = 1;
        [FirestoreProperty] public int gold { get; set; } = 0;
        [FirestoreProperty] public string displayName { get; set; } = "";
        [FirestoreProperty] public string uid { get; set; } = "";
    }

    // Référence à la collection
    private static CollectionReference Profiles =>
        FirebaseFirestore.DefaultInstance.Collection("profiles");

    /// Observer un profil en temps réel (création si inexistant)
    public static IDisposable Observe(string uid, Action<Profile> onChanged)
    {
        var doc = Profiles.Document(uid);

        return doc.Listen(snapshot =>
        {
            if (!snapshot.Exists)
            {
                var p = new Profile { uid = uid, level = 1, gold = 0 };
                doc.SetAsync(p); // Création si pas encore présent
                onChanged?.Invoke(p);
                return;
            }

            var profile = snapshot.ConvertTo<Profile>();
            onChanged?.Invoke(profile);
        });
    }

    /// Ajouter de l’or de manière atomique (+ création doc si besoin)
    public static Task AddGoldAsync(string uid, int amount)
    {
        var db = FirebaseFirestore.DefaultInstance;
        var doc = Profiles.Document(uid);

        return db.RunTransactionAsync(async tr =>
        {
            var snap = await tr.GetSnapshotAsync(doc);
            var p = snap.Exists
                ? snap.ConvertTo<Profile>()
                : new Profile { uid = uid, level = 1, gold = 0 };

            p.gold += amount;
            tr.Set(doc, p); // upsert
        });
    }
}
