using System.Collections.Generic;
using System.Threading;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Production;
using GuildsAndEmpires.State;
using GuildsAndEmpires.UI.Screens;
using NUnit.Framework;

namespace GuildsAndEmpires.Tests.EditMode
{
    /// <summary>
    /// Tests de 19.4c-2 : estimation du slot actif (« lot k/N », temps restant, « Lot terminé — collecter »),
    /// bornes du temps restant (arbitrage du 2026-11-04), compteurs incohérents, filtrage des entrées à 0, résumés de
    /// collecte et d'arrêt, libellé et clé de l'intention d'arrêt, réponse d'arrêt écrite dans le store malgré
    /// l'annulation.
    /// </summary>
    public class ProductionSlotProgressTests
    {
        private const long Minute    = 60_000L;
        private const long Second    = 1_000L;
        private const long StartedAt = 1_700_000_000_000L;

        private static RecipeInfo Logs   => ProductionRecipes.Find(ProductionRecipes.LogsId);
        private static RecipeInfo Planks => ProductionRecipes.Find(ProductionRecipes.PlanksId);   // 25 min
        private static RecipeInfo Kits   => ProductionRecipes.Find(ProductionRecipes.ReconstructionKitsId);   // 60 min

        private static SlotSnapshot Batch(string recipeId, int? planned, int? processed,
            long startedAt = StartedAt, long lastProcessedAt = 0L) =>
            new SlotSnapshot(0, recipeId, startedAt, lastProcessedAt, planned, processed);

        private static SlotEstimate Estimate(SlotSnapshot slot, RecipeInfo recipe, long elapsedMs)
        {
            Assert.IsTrue(ProductionSlotProgress.TryEstimate(slot, recipe, elapsedMs, out var estimate));
            return estimate;
        }

        private static Dictionary<string, int> Map(params (string key, int value)[] entries)
        {
            var map = new Dictionary<string, int>();
            foreach (var (key, value) in entries) map[key] = value;
            return map;
        }

        private static InventoryState Inv(int logs, int planks, int kits) =>
            new InventoryState(new ResourceStack(logs, 50), new ResourceStack(planks, 30), new ResourceStack(kits, 10));

        private static BuildingSnapshot Building(params SlotSnapshot[] slots) =>
            new BuildingSnapshot("sawmill_0", "sawmill", 1, new List<SlotSnapshot>(slots));

        // ── Lot k/N ───────────────────────────────────────────────────────────

        [Test]
        public void Lot_KAZero_DesLeLancement()
        {
            var e = Estimate(Batch("planks", 10, 0), Planks, 0L);
            Assert.AreEqual(0, e.Cycle);
            Assert.AreEqual(10, e.Planned);
            Assert.AreEqual(10 * 25 * Minute, e.RemainingMs);
            Assert.IsFalse(e.IsFinished);
            Assert.AreEqual("lot 0/10", ProductionSlotProgress.FormatBatch(e.Cycle, e.Planned));
        }

        [Test]
        public void Lot_AuMilieu_CyclesTraitesPlusCyclesEcoules()
        {
            // 2 cycles déjà crédités + ⌊60 min ÷ 25 min⌋ = 2 → k = 4 ; restant = 8 × 25 − 60 = 140 min.
            var e = Estimate(Batch("planks", 10, 2), Planks, 60 * Minute);
            Assert.AreEqual(4, e.Cycle);
            Assert.AreEqual(140 * Minute, e.RemainingMs);
            Assert.AreEqual("lot 4/10", ProductionSlotProgress.FormatBatch(e.Cycle, e.Planned));
        }

        [Test]
        public void Lot_PlafonneAN_Termine()
        {
            var e = Estimate(Batch("reconstruction_kits", 3, 1), Kits, 10 * 60 * Minute);
            Assert.AreEqual(3, e.Cycle);
            Assert.AreEqual(0L, e.RemainingMs);
            Assert.IsTrue(e.IsFinished);
        }

        [Test]
        public void Lot_RestantZeroExact_Termine()
        {
            var e = Estimate(Batch("planks", 2, 0), Planks, 50 * Minute);
            Assert.AreEqual(2, e.Cycle);
            Assert.IsTrue(e.IsFinished);
            Assert.AreEqual("Lot terminé — collecter", ProductionSlotProgress.FormatRemaining(e.RemainingMs));

            var before = Estimate(Batch("planks", 2, 0), Planks, 50 * Minute - 1);
            Assert.AreEqual(1, before.Cycle);
            Assert.IsFalse(before.IsFinished);
        }

        [Test]
        public void Ecoule_NegatifPlanche()
        {
            // Horloge de l'appareil en retard sur la référence : écoulé planché à 0.
            Assert.AreEqual(0L, ProductionSlotProgress.ElapsedMs(StartedAt, StartedAt - 5 * Minute, 0L));
            Assert.AreEqual(0L, ProductionSlotProgress.ElapsedMs(StartedAt, StartedAt - 5 * Minute, 2 * Minute));
            Assert.AreEqual(3 * Minute, ProductionSlotProgress.ElapsedMs(StartedAt, StartedAt + Minute, 2 * Minute));

            // Écoulé négatif passé directement à l'estimation : planché aussi.
            var e = Estimate(Batch("planks", 4, 1), Planks, -10 * Minute);
            Assert.AreEqual(1, e.Cycle);
            Assert.AreEqual(3 * 25 * Minute, e.RemainingMs);
        }

        [Test]
        public void Reference_StartedAt_QuandLastProcessedAtNul_LastProcessedAtSinon()
        {
            Assert.AreEqual(StartedAt, ProductionSlotProgress.ReferenceMs(Batch("planks", 10, 0)));
            Assert.AreEqual(StartedAt + 50 * Minute,
                ProductionSlotProgress.ReferenceMs(Batch("planks", 10, 2, lastProcessedAt: StartedAt + 50 * Minute)));
        }

        [Test]
        public void Reference_LesDeuxANul_PasDEstimation()
        {
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("planks", 10, 0, startedAt: 0L), Planks, 0L, out _));
        }

        [Test]
        public void Ancre_ReleveeSansNouvelleReponse_EcouleInchange()
        {
            // Même instant vu depuis deux ancres : (mur à l'ancre − référence) + monotone depuis l'ancre.
            var fromFirst  = ProductionSlotProgress.ElapsedMs(StartedAt, StartedAt + 10 * Minute, 30 * Second);
            var fromSecond = ProductionSlotProgress.ElapsedMs(StartedAt, StartedAt + 10 * Minute + 30 * Second, 0L);
            Assert.AreEqual(fromFirst, fromSecond);
        }

        // ── Compteurs incohérents → pas d'estimation ──────────────────────────

        [Test]
        public void Incoherent_PasDEstimation()
        {
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("planks", null, 0), Planks, 0L, out _), "planned null");
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("planks", 0, 0), Planks, 0L, out _), "planned 0");
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("planks", 5, 6), Planks, 0L, out _), "processed > planned");
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("planks", 5, -1), Planks, 0L, out _), "processed < 0");
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("planks", 5, null), Planks, 0L, out _), "processed null");
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(Batch("charcoal", 5, 0), null, 0L, out _), "recette inconnue");
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(null, Planks, 0L, out _), "slot absent");
        }

        [Test]
        public void Logs_JamaisDEstimation()
        {
            var logs = new SlotSnapshot(0, "logs", StartedAt, 0L);
            Assert.IsFalse(ProductionSlotProgress.TryEstimate(logs, Logs, 5 * 60 * Minute, out _));
        }

        [Test]
        public void ProcessedEgalPlanned_Termine()
        {
            var e = Estimate(Batch("planks", 5, 5), Planks, 0L);
            Assert.AreEqual(5, e.Cycle);
            Assert.IsTrue(e.IsFinished);
        }

        // ── Temps restant : bornes de l'arbitrage du 2026-11-04 ──────────────

        [Test]
        public void TempsRestant_BornesDeLArbitrage()
        {
            Assert.AreEqual("< 1 min",          ProductionSlotProgress.FormatRemaining(59 * Second));
            Assert.AreEqual("1 min restante",   ProductionSlotProgress.FormatRemaining(60 * Second));
            Assert.AreEqual("1 min restante",   ProductionSlotProgress.FormatRemaining(119 * Second));
            Assert.AreEqual("2 min restantes",  ProductionSlotProgress.FormatRemaining(120 * Second));
            Assert.AreEqual("59 min restantes", ProductionSlotProgress.FormatRemaining(3_599 * Second));
            Assert.AreEqual("1 h 00 restantes", ProductionSlotProgress.FormatRemaining(3_600 * Second));
        }

        [Test]
        public void TempsRestant_ExemplesDuFounder_EtRestantNulOuNegatif()
        {
            Assert.AreEqual("4 h 10 restantes", ProductionSlotProgress.FormatRemaining(250 * Minute));
            Assert.AreEqual("25 min restantes", ProductionSlotProgress.FormatRemaining(25 * Minute));
            Assert.AreEqual("< 1 min", ProductionSlotProgress.FormatRemaining(1L));
            Assert.AreEqual("Lot terminé — collecter", ProductionSlotProgress.FormatRemaining(0L));
            Assert.AreEqual("Lot terminé — collecter", ProductionSlotProgress.FormatRemaining(-5L));
        }

        [Test]
        public void TempsRestant_FormatsDeLApercuInchanges()
        {
            Assert.AreEqual("25 min", ProductionLaunchPlanner.FormatDuration(25 * Minute));
            Assert.AreEqual("1 h 00", ProductionLaunchPlanner.FormatDuration(60 * Minute));
        }

        [Test]
        public void MinutesAffichees_ValeurDuTick()
        {
            Assert.AreEqual(-1L, ProductionSlotProgress.DisplayedMinutes(0L));
            Assert.AreEqual(0L,  ProductionSlotProgress.DisplayedMinutes(59 * Second));
            Assert.AreEqual(1L,  ProductionSlotProgress.DisplayedMinutes(119 * Second));
            Assert.AreEqual(250L, ProductionSlotProgress.DisplayedMinutes(250 * Minute));
        }

        // ── Filtrage des zéros ────────────────────────────────────────────────

        [Test]
        public void Filtrage_MapVide_ToutAZero_Melange()
        {
            Assert.AreEqual(0, ProductionSlotProgress.NonZeroOrdered(new Dictionary<string, int>()).Count);
            Assert.AreEqual(0, ProductionSlotProgress.NonZeroOrdered(null).Count);
            Assert.AreEqual(0, ProductionSlotProgress.NonZeroOrdered(Map(("logs", 0), ("planks", 0))).Count);

            var mixed = ProductionSlotProgress.NonZeroOrdered(Map(("planks", 0), ("logs", 3), ("reconstructionKits", 0)));
            Assert.AreEqual(1, mixed.Count);
            Assert.AreEqual("logs", mixed[0].Key);
            Assert.AreEqual(3, mixed[0].Value);
        }

        [Test]
        public void Filtrage_OrdreFixe_CleInconnueEnsuiteOrdinal()
        {
            var entries = ProductionSlotProgress.NonZeroOrdered(Map(
                ("zinc", 1), ("reconstructionKits", 2), ("Amber", 4), ("planks", 3), ("logs", 5)));
            var keys = new List<string>();
            foreach (var kv in entries) keys.Add(kv.Key);
            CollectionAssert.AreEqual(new[] { "logs", "planks", "reconstructionKits", "Amber", "zinc" }, keys);
        }

        [Test]
        public void LigneDeResume_NomsInvariables_OrdreFixe()
        {
            Assert.AreEqual("Récolté : 2 logs, 1 planks, 3 kits",
                ProductionSlotProgress.FormatResourceLine(PlayerMessages.SummaryCollectedFormat,
                    Map(("reconstructionKits", 3), ("planks", 1), ("logs", 2))));
            Assert.IsNull(ProductionSlotProgress.FormatResourceLine(PlayerMessages.SummaryCollectedFormat,
                Map(("logs", 0))));
        }

        // ── Résumé de collecte ────────────────────────────────────────────────

        [Test]
        public void Collecte_ToutVide_TexteExistant()
        {
            Assert.AreEqual("Rien à récolter pour l'instant.",
                ProductionSlotProgress.BuildCollectSummary(new Dictionary<string, int>(), new Dictionary<string, int>()));
            Assert.AreEqual("Rien à récolter pour l'instant.",
                ProductionSlotProgress.BuildCollectSummary(Map(("logs", 0)), Map(("logs", 0))));
        }

        [Test]
        public void Collecte_PerduSeulementSiUneEntreePositive_CasDuPlay194a()
        {
            // Play 19.4a : « Récolté : 1 logs — perdu (cap plein) : 0 logs » → plus de ligne « Perdu ».
            Assert.AreEqual("Récolté : 1 logs",
                ProductionSlotProgress.BuildCollectSummary(Map(("logs", 1)), Map(("logs", 0))));
        }

        [Test]
        public void Collecte_UneLigneParCategorie_StockPlein()
        {
            Assert.AreEqual("Récolté : 3 logs, 2 kits\nPerdu (stock plein) : 1 kits",
                ProductionSlotProgress.BuildCollectSummary(
                    Map(("reconstructionKits", 2), ("logs", 3)), Map(("reconstructionKits", 1), ("logs", 0))));
            Assert.AreEqual("Perdu (stock plein) : 4 planks",
                ProductionSlotProgress.BuildCollectSummary(Map(("planks", 0)), Map(("planks", 4))));
        }

        // ── Résumé d'arrêt ────────────────────────────────────────────────────

        [Test]
        public void Arret_OrdreDesLignes()
        {
            Assert.AreEqual(
                "Récolté : 2 planks\nPerdu (stock plein) : 1 planks\nRendu : 14 logs\nIntrants perdus (stock plein) : 2 logs",
                ProductionSlotProgress.BuildStopSummary(false,
                    Map(("planks", 2)), Map(("planks", 1)), Map(("logs", 14)), Map(("logs", 2))));
        }

        [Test]
        public void Arret_CategoriesVidesMasquees()
        {
            Assert.AreEqual("Rendu : 20 logs",
                ProductionSlotProgress.BuildStopSummary(false,
                    Map(("planks", 0)), Map(("planks", 0)), Map(("logs", 20)), Map(("logs", 0))));
        }

        [Test]
        public void Arret_ToutVide_TexteVide()
        {
            Assert.AreEqual(string.Empty,
                ProductionSlotProgress.BuildStopSummary(false,
                    Map(("logs", 0)), new Dictionary<string, int>(), new Dictionary<string, int>(), Map(("planks", 0))));
        }

        [Test]
        public void Arret_Rejeu_ArretDejaEnregistre()
        {
            var empty = new Dictionary<string, int>();
            Assert.AreEqual("Arrêt déjà enregistré",
                ProductionSlotProgress.BuildStopSummary(true, empty, empty, empty, empty));

            var replay = new StopProductionResult(Building(), Inv(0, 0, 0), empty, empty, empty, empty, alreadyApplied: true);
            Assert.AreEqual("Arrêt déjà enregistré", ProductionSlotProgress.BuildStopSummary(replay));
        }

        [Test]
        public void Arret_DepuisLaReponseDuServeur()
        {
            var result = new StopProductionResult(
                Building(), Inv(20, 0, 0),
                Map(("logs", 1), ("planks", 0)), Map(("logs", 0)), Map(("logs", 20)), new Dictionary<string, int>(),
                alreadyApplied: false);
            Assert.AreEqual("Récolté : 1 logs\nRendu : 20 logs", ProductionSlotProgress.BuildStopSummary(result));
        }

        // ── Intention d'arrêt et clé ──────────────────────────────────────────

        [Test]
        public void IntentionDArret_Libelle()
        {
            Assert.AreEqual("stop:sawmill_0:2", ProductionSlotProgress.BuildStopIntent("sawmill_0", 2));
            Assert.AreNotEqual(ProductionSlotProgress.BuildStopIntent("sawmill_0", 1),
                ProductionSlotProgress.BuildStopIntent("sawmill_0", 2));
        }

        [Test]
        public void IntentionDArret_ReessaiApresErreur_MemeCle_NouvelleReponse_NouvelleCle()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(0, 0, 0),
                Building(Batch("planks", 10, 0), new SlotSnapshot(1, null, 0L, 0L), new SlotSnapshot(2, null, 0L, 0L)));
            var keys   = new PendingIntentKeys();
            var intent = ProductionSlotProgress.BuildStopIntent(store.Building.Id, 0);

            keys.PurgeStale(store.Building);
            var first = keys.GetOrCreate(intent, store.Building);   // erreur : clé conservée

            keys.PurgeStale(store.Building);
            Assert.AreEqual(first, keys.GetOrCreate(intent, store.Building), "réessai : même contenu, même référence");

            keys.Resolve(intent, first);   // réponse parsée
            Assert.AreEqual(0, keys.Count);

            store.ApplyServerProductionState(store.IssueRequestNumber(),
                Building(Batch("planks", 10, 0), new SlotSnapshot(1, null, 0L, 0L), new SlotSnapshot(2, null, 0L, 0L)), null);
            keys.PurgeStale(store.Building);
            Assert.AreNotEqual(first, keys.GetOrCreate(intent, store.Building));
        }

        [Test]
        public void Arret_ReponseRecueApresAnnulation_EcriteDansLeStore_AucuneUI()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 7, Inv(0, 0, 0),
                Building(Batch("planks", 10, 0), new SlotSnapshot(1, null, 0L, 0L), new SlotSnapshot(2, null, 0L, 0L)));

            var request = store.IssueRequestNumber();
            var empty   = new Dictionary<string, int>();
            var result  = new StopProductionResult(
                Building(new SlotSnapshot(0, null, 0L, 0L), new SlotSnapshot(1, null, 0L, 0L), new SlotSnapshot(2, null, 0L, 0L)),
                Inv(20, 0, 0), empty, empty, Map(("logs", 20)), empty, alreadyApplied: false);
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            Assert.IsFalse(ProductionStoreWriter.ApplyProductionState(store, request, result.Building, result.Inventory, cts.Token));
            Assert.AreSame(result.Building, store.Building);
            Assert.AreSame(result.Inventory, store.Inventory);
            Assert.AreEqual(7, store.Gold);
        }

        // ── Confirmation d'arrêt ───────────────────────────────────────────

        [Test]
        public void Textes_ConfirmationSansChiffres()
        {
            foreach (var c in PlayerMessages.StopConfirmation)
                Assert.IsFalse(char.IsDigit(c), "confirmation d'arrêt sans chiffres (Q4)");
        }
    }
}
