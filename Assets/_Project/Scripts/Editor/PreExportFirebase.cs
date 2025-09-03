#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class PreExportFirebase
{
    // Appelé par Unity Cloud Build (Pre-Export Method)
    public static void WriteFirebaseConfigs()
    {
        try
        {
            var sa = Path.Combine(Application.dataPath, "StreamingAssets");
            if (!Directory.Exists(sa)) Directory.CreateDirectory(sa);

#if UNITY_ANDROID
            var androidJson = Environment.GetEnvironmentVariable("FIREBASE_ANDROID_JSON");
            if (!string.IsNullOrEmpty(androidJson))
            {
                File.WriteAllText(Path.Combine(sa, "google-services.json"), androidJson);
                Debug.Log("[UCB] Wrote google-services.json");
            }
#endif

#if UNITY_IOS
            var iosPlist = Environment.GetEnvironmentVariable("FIREBASE_IOS_PLIST");
            if (!string.IsNullOrEmpty(iosPlist))
            {
                File.WriteAllText(Path.Combine(sa, "GoogleService-Info.plist"), iosPlist);
                Debug.Log("[UCB] Wrote GoogleService-Info.plist");
            }
#endif
        }
        catch (Exception e)
        {
            Debug.LogError("[UCB] Failed to write Firebase configs: " + e);
            throw;
        }
    }
}
#endif
