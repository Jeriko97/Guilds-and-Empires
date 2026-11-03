using System.Collections.Generic;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Production;
using NUnit.Framework;

namespace GuildsAndEmpires.Tests.EditMode
{
    /// <summary>
    /// Tests des parsings et utilitaires ajoutés en 19.4b : compteurs de lot du slot, AlreadyApplied,
    /// résultat de l'arrêt, ParseResourceMap déplacée, registre des clés d'intention, copie des recettes.
    /// Format wire du SDK : Dictionary&lt;object,object&gt;, entiers en long.
    /// </summary>
    public class ProductionParsingTests
    {
        private static Dictionary<object, object> D(params object[] kv)
        {
            var d = new Dictionary<object, object>();
            for (var i = 0; i < kv.Length; i += 2) d[kv[i]] = kv[i + 1];
            return d;
        }

        private static Dictionary<object, object> Stack(long quantity, long cap) =>
            D("quantity", quantity, "cap", cap, "upgradesApplied", 0L);

        private static Dictionary<object, object> Inventory() =>
            D("logs", Stack(10L, 50L), "planks", Stack(3L, 30L), "reconstructionKits", Stack(1L, 10L));

        private static Dictionary<object, object> Ts(long seconds) => D("_seconds", seconds, "_nanoseconds", 0L);

        private static Dictionary<object, object> LogsSlot() =>
            D("slotIndex", 0L, "recipeId", "logs", "startedAt", Ts(1700000000L), "lastProcessedAt", null);

        private static Dictionary<object, object> BatchSlot(long planned, long processed) =>
            D("slotIndex", 1L, "recipeId", "planks", "startedAt", Ts(1700000000L), "lastProcessedAt", null,
              "cyclesPlanned", planned, "cyclesProcessed", processed);

        private static Dictionary<object, object> Building(params object[] slots) =>
            D("buildingType", "sawmill", "level", 1L, "slots", new List<object>(slots));

        // ── SlotSnapshot : compteurs de lot ──────────────────────────────────────

        [Test]
        public void ParseSlot_Logs_SansCompteurs_DonneNull()
        {
            var slot = ProductionParsingHelpers.ParseSlot(LogsSlot());
            Assert.IsNull(slot.CyclesPlanned);
            Assert.IsNull(slot.CyclesProcessed);
        }

        [Test]
        public void ParseSlot_CompteursANull_DonneNull()
        {
            var raw = LogsSlot();
            raw["cyclesPlanned"]   = null;
            raw["cyclesProcessed"] = null;
            var slot = ProductionParsingHelpers.ParseSlot(raw);
            Assert.IsNull(slot.CyclesPlanned);
            Assert.IsNull(slot.CyclesProcessed);
        }

        [Test]
        public void ParseSlot_LotAuLancement_ZeroConserve()
        {
            var slot = ProductionParsingHelpers.ParseSlot(BatchSlot(10L, 0L));
            Assert.AreEqual(10, slot.CyclesPlanned);
            Assert.AreEqual(0, slot.CyclesProcessed);
        }

        [Test]
        public void ParseSlot_LotEnCours()
        {
            var slot = ProductionParsingHelpers.ParseSlot(BatchSlot(24L, 7L));
            Assert.AreEqual(24, slot.CyclesPlanned);
            Assert.AreEqual(7, slot.CyclesProcessed);
            Assert.AreEqual("planks", slot.RecipeId);
        }

        // ── ProductionResult.AlreadyApplied ───────────────────────────────────────

        [Test]
        public void ProductionResult_AlreadyApplied_Present()
        {
            var r = ProductionResult.Parse(
                D("building", Building(LogsSlot()), "inventory", Inventory(), "alreadyApplied", true), "sawmill_0");
            Assert.IsTrue(r.AlreadyApplied);
            Assert.AreEqual("sawmill_0", r.Building.Id);
        }

        [Test]
        public void ProductionResult_AlreadyApplied_Absent_DonneFalse()
        {
            var r = ProductionResult.Parse(D("building", Building(LogsSlot()), "inventory", Inventory()), "sawmill_0");
            Assert.IsFalse(r.AlreadyApplied);
        }

        // ── StopProductionResult ──────────────────────────────────────────────────

        [Test]
        public void StopProductionResult_QuatreMaps()
        {
            var r = StopProductionResult.Parse(
                D("building",        Building(LogsSlot()),
                  "inventory",       Inventory(),
                  "collected",       D("planks", 3L),
                  "discarded",       D("planks", 0L),
                  "refunded",        D("logs", 6L),
                  "refundDiscarded", D("logs", 2L),
                  "alreadyApplied",  false),
                "sawmill_0");

            Assert.AreEqual(3, r.Collected["planks"]);
            Assert.AreEqual(0, r.Discarded["planks"]);
            Assert.AreEqual(6, r.Refunded["logs"]);
            Assert.AreEqual(2, r.RefundDiscarded["logs"]);
            Assert.IsFalse(r.AlreadyApplied);
            Assert.AreEqual(10, r.Inventory.Logs.Quantity);
            Assert.AreEqual("sawmill_0", r.Building.Id);
        }

        [Test]
        public void StopProductionResult_Rejeu_MapsVides()
        {
            var r = StopProductionResult.Parse(
                D("building", Building(LogsSlot()), "inventory", Inventory(),
                  "collected", D(), "discarded", D(), "refunded", D(), "refundDiscarded", D(),
                  "alreadyApplied", true),
                "sawmill_0");

            Assert.IsTrue(r.AlreadyApplied);
            Assert.AreEqual(0, r.Collected.Count);
            Assert.AreEqual(0, r.Discarded.Count);
            Assert.AreEqual(0, r.Refunded.Count);
            Assert.AreEqual(0, r.RefundDiscarded.Count);
        }

        // ── ParseResourceMap (déplacée de CollectProductionResult) ────────────────

        [Test]
        public void ParseResourceMap_EntreesAZeroConservees()
        {
            var map = ProductionParsingHelpers.ParseResourceMap(D("logs", 1L, "planks", 0L));
            Assert.AreEqual(2, map.Count);
            Assert.AreEqual(1, map["logs"]);
            Assert.AreEqual(0, map["planks"]);
        }

        [Test]
        public void ParseResourceMap_ValeurNonNumerique_DonneZero()
        {
            var map = ProductionParsingHelpers.ParseResourceMap(D("logs", "abc"));
            Assert.AreEqual(0, map["logs"]);
        }

        [Test]
        public void ParseResourceMap_AbsenteOuMalFormee_DonneVide()
        {
            Assert.AreEqual(0, ProductionParsingHelpers.ParseResourceMap(null).Count);
            Assert.AreEqual(0, ProductionParsingHelpers.ParseResourceMap("x").Count);
        }

        [Test]
        public void CollectProductionResult_UtiliseParseResourceMap()
        {
            var r = CollectProductionResult.Parse(
                D("building", Building(LogsSlot()), "inventory", Inventory(),
                  "collected", D("logs", 1L), "discarded", D("logs", 0L)),
                "sawmill_0");
            Assert.AreEqual(1, r.Collected["logs"]);
            Assert.AreEqual(0, r.Discarded["logs"]);
        }

        // ── Registre des clés d'intention ─────────────────────────────────────────

        [Test]
        public void PendingIntentKeys_MemeIntentionMemeEtat_MemeCle()
        {
            var keys  = new PendingIntentKeys();
            var state = new object();
            var k1 = keys.GetOrCreate("start:sawmill_0:0:logs", state);
            var k2 = keys.GetOrCreate("start:sawmill_0:0:logs", state);
            Assert.AreEqual(k1, k2);
            Assert.IsTrue(System.Guid.TryParse(k1, out _));
        }

        [Test]
        public void PendingIntentKeys_AutreEtatAffiche_NouvelleCle()
        {
            var keys = new PendingIntentKeys();
            var k1 = keys.GetOrCreate("start:sawmill_0:0:logs", new object());
            var k2 = keys.GetOrCreate("start:sawmill_0:0:logs", new object());
            Assert.AreNotEqual(k1, k2);
            Assert.AreEqual(1, keys.Count);
        }

        [Test]
        public void PendingIntentKeys_ApresEchec_CleConservee()
        {
            var keys  = new PendingIntentKeys();
            var state = new object();
            var k1 = keys.GetOrCreate("stop:sawmill_0:1", state);
            // Échec : aucun Resolve. Le réessai sur le même état réutilise la clé.
            var k2 = keys.GetOrCreate("stop:sawmill_0:1", state);
            Assert.AreEqual(k1, k2);
            Assert.AreEqual(1, keys.Count);
        }

        [Test]
        public void PendingIntentKeys_LibereeApresSuccesSeulement()
        {
            var keys  = new PendingIntentKeys();
            var state = new object();
            var k1 = keys.GetOrCreate("start:sawmill_0:0:logs", state);

            keys.Resolve("start:sawmill_0:0:logs", "autre-cle");   // clé remplacée entre-temps : rien ne bouge
            Assert.AreEqual(1, keys.Count);

            keys.Resolve("start:sawmill_0:0:logs", k1);
            Assert.AreEqual(0, keys.Count);
            Assert.AreNotEqual(k1, keys.GetOrCreate("start:sawmill_0:0:logs", state));
        }

        // ── Copie client des recettes (affichage) ─────────────────────────────────

        [Test]
        public void ProductionRecipes_KitsSortentSurLaCleInventaire()
        {
            var kits = ProductionRecipes.Find("reconstruction_kits");
            Assert.IsNotNull(kits);
            Assert.AreEqual(EconomyResourceKeys.RECONSTRUCTION_KITS, kits.OutputKey);
            Assert.AreEqual("reconstructionKits", kits.OutputKey);
            Assert.AreEqual(3, kits.InputsPerCycle[EconomyResourceKeys.PLANKS]);
        }

        [Test]
        public void ProductionRecipes_LogsSansLot_PlanksAvecLot()
        {
            Assert.IsNull(ProductionRecipes.Find("logs").MaxBatchCycles);
            Assert.AreEqual(0, ProductionRecipes.Find("logs").InputsPerCycle.Count);
            Assert.AreEqual(24, ProductionRecipes.Find("planks").MaxBatchCycles);
            Assert.AreEqual(2, ProductionRecipes.Find("planks").InputsPerCycle[EconomyResourceKeys.LOGS]);
            Assert.IsNull(ProductionRecipes.Find("dragon_scales"));
            Assert.AreEqual(3, ProductionRecipes.All.Count);
        }
    }
}
