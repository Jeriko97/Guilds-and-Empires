#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Firestore;
using Firebase.Functions;
using UnityEditor;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Services.Firebase
{
    /// <summary>
    /// Mode émulateur Firebase de l'Éditeur (ÉTAPE 19.4a, D-ETAPE19-011). Compilé dans l'Éditeur seulement.
    ///
    /// Interrupteur : EditorPrefs <see cref="UseEmulatorsPrefKey"/> (propre au poste, jamais commité), absent =
    /// production ; menu « GuildsAndEmpires/Firebase/Utiliser les émulateurs ».
    ///
    /// Barrières, toutes vérifiées par la garde avant tout accès à Auth et tout appel :
    /// - instance nommée <see cref="EmulatorAppName"/> au projet demo- et à la clé factice : l'instance par défaut
    ///   (production) et sa session ne sont jamais lues (« Option 2 » du founder) ;
    /// - puits : toute sortie HTTPS des bibliothèques natives Firebase part vers un proxy local sans issue
    ///   (le SDK de bureau 13.1 envoie le renouvellement du jeton à la production en dur, TD-029) ;
    /// - Auth, Firestore et Functions de l'instance dirigés vers les émulateurs.
    /// Les variables d'environnement passent par l'UCRT (ucrtbase.dll, importée par FirebaseCppApp) :
    /// Environment.SetEnvironmentVariable ne l'atteint pas.
    ///
    /// Une session de l'Éditeur ne joue qu'un seul environnement : l'état natif du SDK survit d'une Play à l'autre.
    /// </summary>
    internal static class FirebaseEmulatorMode
    {
        internal const string UseEmulatorsPrefKey = "GAE.Firebase.UseEmulators";

        /// <summary>
        /// Test de la garde : « auth », « proxy », « firestore » ou « functions » — ce réglage est sauté, la garde doit
        /// interrompre le démarrage. Lue en mode émulateur seulement ; menu « Retirer le test de la garde ».
        /// </summary>
        internal const string GuardTestSkipPrefKey = "GAE.Firebase.GuardTestSkip";

        private const string SessionEnvironmentKey = "GAE.Firebase.SessionEnvironment";
        private const string EmulatorEnvironment   = "émulateur";
        private const string ProductionEnvironment = "production";

        internal const string EmulatorAppName   = "gae-emulator";
        internal const string EmulatorProjectId = "demo-guilds-empires";
        internal const string EmulatorApiKey    = "demo-gae-emulator-key";
        private  const string EmulatorAppId     = "1:000000000000:android:0000000000000000";

        internal const string AuthEmulatorFlag = "yes";
        internal const string AuthPort         = "9099";
        internal const string SinkholeProxy    = "http://127.0.0.1:18999";
        internal const string NoProxy          = "localhost,127.0.0.1,::1";
        internal const string FirestoreHost    = "127.0.0.1:8080";
        internal const string FunctionsOrigin  = "http://127.0.0.1:5001";
        private  const string AuthEmulatorOrigin = "http://127.0.0.1:9099";

        // Compte de test de l'émulateur Auth (projet demo-, jamais valable ailleurs).
        private const string TestEmail    = "joueur@gae-emulateur.test";
        private const string TestPassword = "emulateur-seulement-19-4a";

        private const string AuthEmulatorVar     = "USE_AUTH_EMULATOR";
        private const string AuthEmulatorPortVar = "AUTH_EMULATOR_PORT";
        private const string HttpsProxyVar       = "https_proxy";
        private const string NoProxyVar          = "no_proxy";
        private const string GrpcProxyVar        = "grpc_proxy";     // prioritaire sur https_proxy pour gRPC (Firestore)
        private const string NoGrpcProxyVar      = "no_grpc_proxy";  // prioritaire sur no_proxy pour gRPC

        /// <summary>Mode lu une fois par démarrage (<see cref="Begin"/>) : basculer le menu en cours de Play est sans effet.</summary>
        internal static bool IsActive { get; private set; }

        private static string _guardTestSkip = string.Empty;
        private static bool   _functionsConfigured;

        /// <summary>État relu par la garde.</summary>
        internal struct EmulatorState
        {
            public string AppName;
            public string ProjectId;
            public string ApiKey;
            public string UseAuthEmulator;
            public string AuthEmulatorPort;
            public string HttpsProxy;
            public string NoProxy;
            public string GrpcProxy;
            public string NoGrpcProxy;
            public string FirestoreHost;
            public bool   FirestoreSslEnabled;
            public bool   FirestorePersistenceEnabled;
            public bool   FunctionsConfigured;
        }

        // ── 1. Avant l'étape 3 ────────────────────────────────────────────────

        internal static void Begin()
        {
            IsActive             = EditorPrefs.GetBool(UseEmulatorsPrefKey, false);
            _guardTestSkip       = IsActive ? EditorPrefs.GetString(GuardTestSkipPrefKey, string.Empty) : string.Empty;
            _functionsConfigured = false;

            // Avant toute variable posée : un démarrage interrompu ensuite bloque quand même l'autre environnement.
            var current  = IsActive ? EmulatorEnvironment : ProductionEnvironment;
            var previous = SessionState.GetString(SessionEnvironmentKey, string.Empty);
            if (previous.Length > 0 && previous != current)
                throw new InvalidOperationException(
                    $"Démarrage refusé : cette session de l'Éditeur a déjà joué en {previous}. " +
                    $"Redémarrer l'Éditeur pour jouer en {current} (l'état natif du SDK survit d'une Play à l'autre).");
            SessionState.SetString(SessionEnvironmentKey, current);

            ClearEmulatorEnvironment();
            if (!IsActive) return;

            if (!SkippedForGuardTest("proxy"))
            {
                PutCrtEnv(HttpsProxyVar,  SinkholeProxy);
                PutCrtEnv(GrpcProxyVar,   SinkholeProxy);
                PutCrtEnv(NoProxyVar,     NoProxy);
                PutCrtEnv(NoGrpcProxyVar, NoProxy);
            }
            if (!SkippedForGuardTest("auth"))
            {
                PutCrtEnv(AuthEmulatorVar, AuthEmulatorFlag);
                PutCrtEnv(AuthEmulatorPortVar, AuthPort);
            }
            GELogger.Warning("FirebaseEmulator", "Mode émulateur demandé (EditorPrefs) — vérifications avant tout appel.");
        }

        // ── 2. Étape 3, appelés par FirebaseBootstrap ─────────────────────────

        /// <summary>Instance nommée, aux options demo- et factices ; réutilisée si elle existe déjà dans le processus.</summary>
        internal static FirebaseApp CreateApp()
        {
            return FirebaseApp.GetInstance(EmulatorAppName) ?? FirebaseApp.Create(new AppOptions
            {
                ProjectId = EmulatorProjectId,
                ApiKey    = EmulatorApiKey,
                AppId     = EmulatorAppId,
            }, EmulatorAppName);
        }

        internal static void ConfigureFirestore(FirebaseFirestore db)
        {
            if (SkippedForGuardTest("firestore")) return;
            // Réglés seulement s'ils diffèrent : une instance réutilisée et déjà démarrée refuse toute modification.
            var settings = db.Settings;
            if (settings.Host != FirestoreHost) settings.Host = FirestoreHost;
            if (settings.SslEnabled)            settings.SslEnabled = false;
            if (settings.PersistenceEnabled)    settings.PersistenceEnabled = false;
            GELogger.Info("Firebase", $"Firestore → émulateur {FirestoreHost}, persistance coupée.");
        }

        // ── 3. Après l'étape 3 : garde, avant tout accès à Auth ───────────────

        internal static void EnsureConfigured(FirebaseApp app)
        {
            if (!SkippedForGuardTest("functions"))
            {
                FirebaseFunctions.GetInstance(app).UseFunctionsEmulator(FunctionsOrigin);
                _functionsConfigured = true; // le SDK n'expose pas de lecture de l'origine
            }

            var settings = FirebaseFirestore.GetInstance(app).Settings;
            var missing  = FindUnconfigured(new EmulatorState
            {
                AppName                     = app.Name,
                ProjectId                   = app.Options.ProjectId,
                ApiKey                      = app.Options.ApiKey,
                UseAuthEmulator             = ReadCrtEnv(AuthEmulatorVar),
                AuthEmulatorPort            = ReadCrtEnv(AuthEmulatorPortVar),
                HttpsProxy                  = ReadCrtEnv(HttpsProxyVar),
                NoProxy                     = ReadCrtEnv(NoProxyVar),
                GrpcProxy                   = ReadCrtEnv(GrpcProxyVar),
                NoGrpcProxy                 = ReadCrtEnv(NoGrpcProxyVar),
                FirestoreHost               = settings.Host,
                FirestoreSslEnabled         = settings.SslEnabled,
                FirestorePersistenceEnabled = settings.PersistenceEnabled,
                FunctionsConfigured         = _functionsConfigured,
            });

            if (missing.Count > 0)
            {
                var hint = _guardTestSkip.Length == 0
                    ? string.Empty
                    : $" Test de la garde actif ({GuardTestSkipPrefKey}={_guardTestSkip}) : menu « GuildsAndEmpires/Firebase/Retirer le test de la garde ».";
                throw new InvalidOperationException(
                    "Mode émulateur Firebase : démarrage interrompu avant tout appel réseau. Non conforme : " +
                    string.Join(" ; ", missing) + "." + hint);
            }

            GELogger.Info("FirebaseEmulator",
                $"Mode émulateur actif — instance « {app.Name} » ({EmulatorProjectId}), Auth 127.0.0.1:{AuthPort}, " +
                $"Firestore {FirestoreHost}, Functions {FunctionsOrigin}, sorties HTTPS vers le puits {SinkholeProxy}.");
        }

        /// <summary>Décision de la garde — pure. Liste vide = tout est conforme.</summary>
        internal static List<string> FindUnconfigured(EmulatorState s)
        {
            var missing = new List<string>();
            if (s.AppName != EmulatorAppName || s.ProjectId != EmulatorProjectId || s.ApiKey != EmulatorApiKey)
                missing.Add($"Instance ({s.AppName}, projet {s.ProjectId})");
            if (s.HttpsProxy != SinkholeProxy || s.GrpcProxy != SinkholeProxy || s.NoProxy != NoProxy || s.NoGrpcProxy != NoProxy)
                missing.Add($"Puits ({HttpsProxyVar}={s.HttpsProxy ?? "absent"}, {GrpcProxyVar}={s.GrpcProxy ?? "absent"}, " +
                            $"{NoProxyVar}={s.NoProxy ?? "absent"}, {NoGrpcProxyVar}={s.NoGrpcProxy ?? "absent"})");
            if (s.UseAuthEmulator != AuthEmulatorFlag || s.AuthEmulatorPort != AuthPort)
                missing.Add($"Auth ({AuthEmulatorVar}={s.UseAuthEmulator ?? "absent"}, {AuthEmulatorPortVar}={s.AuthEmulatorPort ?? "absent"})");
            if (s.FirestoreHost != FirestoreHost || s.FirestoreSslEnabled || s.FirestorePersistenceEnabled)
                missing.Add($"Firestore (hôte {s.FirestoreHost}, SSL {s.FirestoreSslEnabled}, persistance {s.FirestorePersistenceEnabled})");
            if (!s.FunctionsConfigured)
                missing.Add("Functions (UseFunctionsEmulator non appliqué)");
            return missing;
        }

        // ── 4. Étape 4 : connexion au compte de test de l'émulateur ───────────

        /// <summary>
        /// Connexion par e-mail à CHAQUE Play : jeton neuf, aucun renouvellement nécessaire (il viserait la
        /// production et finirait dans le puits). Le compte est créé au besoin directement dans l'émulateur Auth.
        /// </summary>
        internal static async Task<FirebaseUser> SignInAsync(FirebaseApp app, CancellationToken ct)
        {
            var auth    = FirebaseAuth.GetAuth(app);
            var current = auth.CurrentUser;
            if (current != null && current.Email != TestEmail)
                throw new InvalidOperationException(
                    "Mode émulateur Firebase : démarrage interrompu, l'instance de l'émulateur porte une session qu'elle " +
                    "n'a pas créée (stockage partagé avec la production ?). Aucun appel n'a été fait.");

            await EnsureTestAccountAsync(ct);
            var result = await auth.SignInWithEmailAndPasswordAsync(TestEmail, TestPassword);
            ct.ThrowIfCancellationRequested();
            return result.User;
        }

        private static async Task EnsureTestAccountAsync(CancellationToken ct)
        {
            // URL locale codée en dur, sans proxy : jamais ailleurs que l'émulateur Auth.
            var url = $"{AuthEmulatorOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key={EmulatorApiKey}";
            using var http = new HttpClient(new HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(10) };
            using var body = new StringContent($"{{\"email\":\"{TestEmail}\",\"password\":\"{TestPassword}\"}}", Encoding.UTF8, "application/json");
            using var response = await http.PostAsync(url, body, ct);
            if (response.IsSuccessStatusCode)
            {
                GELogger.Info("FirebaseEmulator", "Compte de test créé dans l'émulateur Auth.");
                return;
            }
            var text = await response.Content.ReadAsStringAsync();
            if (!text.Contains("EMAIL_EXISTS"))
                throw new InvalidOperationException(
                    $"Mode émulateur Firebase : compte de test non créé dans l'émulateur Auth (HTTP {(int)response.StatusCode}).");
        }

        // ── Outils ────────────────────────────────────────────────────────────

        private static bool SkippedForGuardTest(string setting)
        {
            if (_guardTestSkip != setting) return false;
            GELogger.Warning("FirebaseEmulator", $"Test de la garde : réglage « {setting} » sauté volontairement.");
            return true;
        }

        /// <summary>Retire les variables du mode émulateur ; le proxy seulement s'il s'agit du puits (jamais un proxy du poste).</summary>
        private static void ClearEmulatorEnvironment()
        {
            PutCrtEnv(AuthEmulatorVar, string.Empty);
            PutCrtEnv(AuthEmulatorPortVar, string.Empty);
            foreach (var name in new[] { HttpsProxyVar, GrpcProxyVar })
                if (ReadCrtEnv(name) == SinkholeProxy) PutCrtEnv(name, string.Empty);
            foreach (var name in new[] { NoProxyVar, NoGrpcProxyVar })
                if (ReadCrtEnv(name) == NoProxy) PutCrtEnv(name, string.Empty);

            if (ReadCrtEnv(AuthEmulatorVar) != null || ReadCrtEnv(AuthEmulatorPortVar) != null ||
                ReadCrtEnv(HttpsProxyVar) == SinkholeProxy || ReadCrtEnv(GrpcProxyVar) == SinkholeProxy)
                throw new InvalidOperationException("Démarrage refusé : variables du mode émulateur encore présentes. Redémarrer l'Éditeur.");
        }

#if UNITY_EDITOR_WIN
        [DllImport("ucrtbase.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern IntPtr getenv(string name);

        [DllImport("ucrtbase.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int _putenv_s(string name, string value);

        /// <summary>Valeur vide = suppression de la variable.</summary>
        private static void PutCrtEnv(string name, string value)
        {
            var err = _putenv_s(name, value);
            if (err != 0)
                throw new InvalidOperationException($"Mode émulateur Firebase : _putenv_s({name}) a échoué (errno {err}).");
        }

        private static string ReadCrtEnv(string name)
        {
            var ptr = getenv(name);
            return ptr == IntPtr.Zero ? null : Marshal.PtrToStringAnsi(ptr);
        }
#else
        // Les variables passent par l'UCRT de Windows : ailleurs, le mode émulateur est refusé ; la production n'y touche pas.
        private static void PutCrtEnv(string name, string value)
        {
            if (!string.IsNullOrEmpty(value))
                throw new InvalidOperationException("Mode émulateur Firebase : Éditeur Windows seulement.");
        }

        private static string ReadCrtEnv(string name) => null;
#endif
    }
}
#endif
