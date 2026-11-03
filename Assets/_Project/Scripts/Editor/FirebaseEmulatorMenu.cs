using GuildsAndEmpires.Services.Firebase;
using UnityEditor;
using UnityEngine;

namespace GuildsAndEmpires.EditorTools
{
    /// <summary>
    /// Menus du mode émulateur Firebase (ÉTAPE 19.4a, D-ETAPE19-011). Les clés EditorPrefs sont lues par
    /// FirebaseEmulatorMode au démarrage de la Play suivante ; menus grisés pendant une Play.
    /// </summary>
    internal static class FirebaseEmulatorMenu
    {
        private const string ToggleMenuPath    = "GuildsAndEmpires/Firebase/Utiliser les émulateurs";
        private const string ClearTestMenuPath = "GuildsAndEmpires/Firebase/Retirer le test de la garde";

        [MenuItem(ToggleMenuPath)]
        private static void Toggle()
        {
            var enabled = !EditorPrefs.GetBool(FirebaseEmulatorMode.UseEmulatorsPrefKey, false);
            EditorPrefs.SetBool(FirebaseEmulatorMode.UseEmulatorsPrefKey, enabled);
            Debug.Log(enabled
                ? "[FirebaseEmulator] Émulateurs ACTIVÉS pour la prochaine Play (projet demo-guilds-empires)."
                : "[FirebaseEmulator] Émulateurs DÉSACTIVÉS : la prochaine Play vise la PRODUCTION (redémarrer l'Éditeur si une Play émulateur a eu lieu).");
        }

        [MenuItem(ToggleMenuPath, true)]
        private static bool ToggleValidate()
        {
            Menu.SetChecked(ToggleMenuPath, EditorPrefs.GetBool(FirebaseEmulatorMode.UseEmulatorsPrefKey, false));
            return !EditorApplication.isPlayingOrWillChangePlaymode;
        }

        [MenuItem(ClearTestMenuPath)]
        private static void ClearGuardTest()
        {
            EditorPrefs.DeleteKey(FirebaseEmulatorMode.GuardTestSkipPrefKey);
            Debug.Log("[FirebaseEmulator] Test de la garde retiré.");
        }

        [MenuItem(ClearTestMenuPath, true)]
        private static bool ClearGuardTestValidate() =>
            EditorPrefs.HasKey(FirebaseEmulatorMode.GuardTestSkipPrefKey) && !EditorApplication.isPlayingOrWillChangePlaymode;
    }
}
