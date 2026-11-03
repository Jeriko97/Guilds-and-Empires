using GuildsAndEmpires.Services.Firebase;
using NUnit.Framework;

namespace GuildsAndEmpires.Tests.EditMode
{
    /// <summary>
    /// Décision de la garde du mode émulateur (ÉTAPE 19.4a, D-ETAPE19-011) : tout ou rien. Un seul élément non conforme
    /// suffit à interrompre le démarrage ; chaque élément fautif est nommé.
    /// </summary>
    public class FirebaseEmulatorGuardTests
    {
        private static FirebaseEmulatorMode.EmulatorState Conforme() => new FirebaseEmulatorMode.EmulatorState
        {
            AppName                     = FirebaseEmulatorMode.EmulatorAppName,
            ProjectId                   = FirebaseEmulatorMode.EmulatorProjectId,
            ApiKey                      = FirebaseEmulatorMode.EmulatorApiKey,
            UseAuthEmulator             = FirebaseEmulatorMode.AuthEmulatorFlag,
            AuthEmulatorPort            = FirebaseEmulatorMode.AuthPort,
            HttpsProxy                  = FirebaseEmulatorMode.SinkholeProxy,
            NoProxy                     = FirebaseEmulatorMode.NoProxy,
            GrpcProxy                   = FirebaseEmulatorMode.SinkholeProxy,
            NoGrpcProxy                 = FirebaseEmulatorMode.NoProxy,
            FirestoreHost               = FirebaseEmulatorMode.FirestoreHost,
            FirestoreSslEnabled         = false,
            FirestorePersistenceEnabled = false,
            FunctionsConfigured         = true,
        };

        private static void AssertSeul(FirebaseEmulatorMode.EmulatorState s, string element)
        {
            var missing = FirebaseEmulatorMode.FindUnconfigured(s);
            Assert.AreEqual(1, missing.Count, string.Join(" ; ", missing));
            StringAssert.StartsWith(element, missing[0]);
        }

        [Test]
        public void ToutConforme_AucunManque()
        {
            Assert.IsEmpty(FirebaseEmulatorMode.FindUnconfigured(Conforme()));
        }

        [Test]
        public void InstanceParDefaut_InstanceNommee()
        {
            var s = Conforme(); s.AppName = "__FIRAPP_DEFAULT";
            AssertSeul(s, "Instance");
        }

        [Test]
        public void ProjetOuCleDeProduction_InstanceNommee()
        {
            var s = Conforme(); s.ProjectId = "guildsandempires-ca543";
            AssertSeul(s, "Instance");
            s = Conforme(); s.ApiKey = "une-vraie-cle";
            AssertSeul(s, "Instance");
        }

        [Test]
        public void PuitsAbsentOuAutre_PuitsNomme()
        {
            var s = Conforme(); s.HttpsProxy = null;
            AssertSeul(s, "Puits");
            s = Conforme(); s.HttpsProxy = "http://proxy.entreprise:8080";
            AssertSeul(s, "Puits");
            s = Conforme(); s.NoProxy = null;
            AssertSeul(s, "Puits");
        }

        [Test]
        public void PuitsGrpcAbsentOuContourne_PuitsNomme()
        {
            var s = Conforme(); s.GrpcProxy = null;
            AssertSeul(s, "Puits");
            s = Conforme(); s.GrpcProxy = "http://proxy.entreprise:8080";
            AssertSeul(s, "Puits");
            s = Conforme(); s.NoGrpcProxy = "*";
            AssertSeul(s, "Puits");
        }

        [Test]
        public void AuthAbsentVideOuAutrePort_AuthNomme()
        {
            var s = Conforme(); s.UseAuthEmulator = null;
            AssertSeul(s, "Auth");
            s = Conforme(); s.UseAuthEmulator = string.Empty;
            AssertSeul(s, "Auth");
            s = Conforme(); s.AuthEmulatorPort = null;
            AssertSeul(s, "Auth");
            s = Conforme(); s.AuthEmulatorPort = "9098";
            AssertSeul(s, "Auth");
        }

        [Test]
        public void FirestoreHoteSslOuPersistance_FirestoreNomme()
        {
            var s = Conforme(); s.FirestoreHost = "firestore.googleapis.com";
            AssertSeul(s, "Firestore");
            s = Conforme(); s.FirestoreSslEnabled = true;
            AssertSeul(s, "Firestore");
            s = Conforme(); s.FirestorePersistenceEnabled = true;
            AssertSeul(s, "Firestore");
        }

        [Test]
        public void FunctionsNonApplique_FunctionsNomme()
        {
            var s = Conforme(); s.FunctionsConfigured = false;
            AssertSeul(s, "Functions");
        }

        [Test]
        public void RienDeConfigure_CinqElementsNommes()
        {
            var missing = FirebaseEmulatorMode.FindUnconfigured(new FirebaseEmulatorMode.EmulatorState
            {
                AppName = "__FIRAPP_DEFAULT", FirestoreHost = "firestore.googleapis.com",
                FirestoreSslEnabled = true, FirestorePersistenceEnabled = true,
            });
            Assert.AreEqual(5, missing.Count);
            StringAssert.StartsWith("Instance",  missing[0]);
            StringAssert.StartsWith("Puits",     missing[1]);
            StringAssert.StartsWith("Auth",      missing[2]);
            StringAssert.StartsWith("Firestore", missing[3]);
            StringAssert.StartsWith("Functions", missing[4]);
        }
    }
}
