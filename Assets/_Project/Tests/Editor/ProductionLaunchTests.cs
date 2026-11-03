using System;
using System.Collections.Generic;
using System.Threading;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Production;
using GuildsAndEmpires.State;
using GuildsAndEmpires.UI.Screens;
using NUnit.Framework;

namespace GuildsAndEmpires.Tests.EditMode
{
    /// <summary>
    /// Tests de 19.4c-1 : calcul pur du panneau de lancement (Max, boutons, aperçu, durée, saturation, intention),
    /// registre des clés d'intention (purge, libellé avec N, ancrage sur le store), application d'une réponse au
    /// store malgré l'annulation, immuabilité de la copie des recettes (report de 19.4b).
    /// </summary>
    public class ProductionLaunchTests
    {
        private static RecipeInfo Logs   => ProductionRecipes.Find(ProductionRecipes.LogsId);
        private static RecipeInfo Planks => ProductionRecipes.Find(ProductionRecipes.PlanksId);
        private static RecipeInfo Kits   => ProductionRecipes.Find(ProductionRecipes.ReconstructionKitsId);

        private static InventoryState Inv(int logs, int planks, int kits, int logsCap = 50, int planksCap = 30, int kitsCap = 10) =>
            new InventoryState(new ResourceStack(logs, logsCap), new ResourceStack(planks, planksCap), new ResourceStack(kits, kitsCap));

        private static SlotSnapshot Free(int index) => new SlotSnapshot(index, null, 0L, 0L);

        private static SlotSnapshot Batch(int index, string recipeId, int? planned, int? processed) =>
            new SlotSnapshot(index, recipeId, 1_700_000_000_000L, 0L, planned, processed);

        private static BuildingSnapshot Building(params SlotSnapshot[] slots) =>
            new BuildingSnapshot("sawmill_0", "sawmill", 1, new List<SlotSnapshot>(slots));

        // ── Max ───────────────────────────────────────────────────────────────

        [Test]
        public void Max_LimiteParLaBorne()
        {
            Assert.AreEqual(24, ProductionLaunchPlanner.ComputeMaxCycles(Planks, Inv(50, 0, 0, planksCap: 100)));
            Assert.AreEqual(10, ProductionLaunchPlanner.ComputeMaxCycles(Kits, Inv(0, 90, 0, planksCap: 100, kitsCap: 50)));
        }

        [Test]
        public void Max_LimiteParLesIntrants_Plancher()
        {
            Assert.AreEqual(3, ProductionLaunchPlanner.ComputeMaxCycles(Planks, Inv(7, 0, 0)));   // ⌊7 ÷ 2⌋
            Assert.AreEqual(2, ProductionLaunchPlanner.ComputeMaxCycles(Kits, Inv(0, 8, 0)));     // ⌊8 ÷ 3⌋
        }

        [Test]
        public void Max_LimiteParLaPlaceLibre()
        {
            Assert.AreEqual(5, ProductionLaunchPlanner.ComputeMaxCycles(Planks, Inv(50, 25, 0)));  // 30 − 25
            Assert.AreEqual(2, ProductionLaunchPlanner.ComputeMaxCycles(Kits, Inv(0, 30, 8)));     // 10 − 8
        }

        [Test]
        public void Max_Zero_IntrantsInsuffisants()
        {
            Assert.AreEqual(0, ProductionLaunchPlanner.ComputeMaxCycles(Planks, Inv(1, 0, 0)));
        }

        [Test]
        public void Max_TermeNegatifRameneAZero()
        {
            // Stock au-dessus du plafond → place libre négative → Max = 0 (refus serveur needed > freeSpace).
            Assert.AreEqual(0, ProductionLaunchPlanner.ComputeMaxCycles(Planks, Inv(50, 35, 0)));
            // Quantité négative d'un intrant → terme ramené à 0.
            Assert.AreEqual(0, ProductionLaunchPlanner.ComputeMaxCycles(Planks, Inv(-3, 0, 0)));
        }

        [Test]
        public void Max_InventaireAbsent_TermeOmis_ResteLaBorne()
        {
            Assert.AreEqual(24, ProductionLaunchPlanner.ComputeMaxCycles(Planks, null));
            Assert.AreEqual(10, ProductionLaunchPlanner.ComputeMaxCycles(Kits, null));
        }

        [Test]
        public void Max_PileAbsente_TermeOmis()
        {
            var noLogs = new InventoryState(null, new ResourceStack(25, 30), new ResourceStack(0, 10));
            Assert.AreEqual(5, ProductionLaunchPlanner.ComputeMaxCycles(Planks, noLogs));   // reste la place libre
            var noPlanks = new InventoryState(new ResourceStack(7, 50), null, new ResourceStack(0, 10));
            Assert.AreEqual(3, ProductionLaunchPlanner.ComputeMaxCycles(Planks, noPlanks)); // reste les intrants
        }

        [Test]
        public void Max_LogsOuRecetteInconnue_Zero()
        {
            Assert.AreEqual(0, ProductionLaunchPlanner.ComputeMaxCycles(Logs, Inv(50, 0, 0)));
            Assert.AreEqual(0, ProductionLaunchPlanner.ComputeMaxCycles(null, Inv(50, 0, 0)));
        }

        // ── Boutons ───────────────────────────────────────────────────────────

        [Test]
        public void Boutons_MaxZero_TroisNInactifs_LancerInactif_AucunN()
        {
            foreach (var choice in new[] { CyclesChoice.None, CyclesChoice.One, CyclesChoice.Ten, CyclesChoice.Max })
            {
                var b = ProductionLaunchPlanner.ComputeButtons(Planks, choice, 0, callInFlight: false);
                Assert.IsFalse(b.One);
                Assert.IsFalse(b.Ten);
                Assert.IsFalse(b.Max);
                Assert.IsFalse(b.Launch);
                Assert.IsTrue(b.Recipes, "1f : le choix de recette n'est jamais grisé");
                Assert.IsNull(ProductionLaunchPlanner.SelectedCycles(choice, 0), "aucune requête possible");
            }
        }

        [Test]
        public void Boutons_GrisageUnDix()
        {
            var five = ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.None, 5, false);
            Assert.IsTrue(five.One);
            Assert.IsFalse(five.Ten);
            Assert.IsTrue(five.Max);

            var nine = ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.None, 9, false);
            Assert.IsFalse(nine.Ten);

            var ten = ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.None, 10, false);
            Assert.IsTrue(ten.One);
            Assert.IsTrue(ten.Ten);
            Assert.IsTrue(ten.Max);
        }

        [Test]
        public void Boutons_LancerSeulementAvecUnN()
        {
            Assert.IsFalse(ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.None, 24, false).Launch, "1a");
            Assert.IsTrue(ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.One, 24, false).Launch);
            Assert.IsTrue(ProductionLaunchPlanner.ComputeButtons(Kits, CyclesChoice.Max, 3, false).Launch);
            Assert.IsFalse(ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.Ten, 9, false).Launch);
        }

        [Test]
        public void Boutons_Logs_LancerDesLaRecette_SansN()
        {
            var b = ProductionLaunchPlanner.ComputeButtons(Logs, CyclesChoice.None, 0, false);
            Assert.IsTrue(b.Launch, "1b");
            Assert.IsFalse(b.One);
            Assert.IsFalse(b.Ten);
            Assert.IsFalse(b.Max);
        }

        [Test]
        public void Boutons_SansRecette_LancerInactif()
        {
            var b = ProductionLaunchPlanner.ComputeButtons(null, CyclesChoice.None, 0, false);
            Assert.IsFalse(b.Launch);
            Assert.IsTrue(b.Recipes);
            Assert.IsTrue(b.Cancel);
        }

        [Test]
        public void Boutons_PendantUnAppel_TousInactifs_PuisEtatCalcule()
        {
            var during = ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.One, 5, callInFlight: true);
            Assert.IsFalse(during.Recipes || during.One || during.Ten || during.Max || during.Launch || during.Cancel);

            // Fin d'appel (refus serveur, panneau ouvert) : état calculé, « 10 » reste grisé au-delà de Max.
            var after = ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.One, 5, callInFlight: false);
            Assert.IsTrue(after.One);
            Assert.IsFalse(after.Ten);
            Assert.IsTrue(after.Max);
            Assert.IsTrue(after.Launch);
        }

        [Test]
        public void SelectedCycles_MaxEnvoieMax_ChoixGriseRetire()
        {
            Assert.AreEqual(7, ProductionLaunchPlanner.SelectedCycles(CyclesChoice.Max, 7));
            Assert.AreEqual(1, ProductionLaunchPlanner.SelectedCycles(CyclesChoice.One, 7));
            Assert.IsNull(ProductionLaunchPlanner.SelectedCycles(CyclesChoice.Ten, 7));
            Assert.AreEqual(10, ProductionLaunchPlanner.SelectedCycles(CyclesChoice.Ten, 24));
            Assert.AreEqual(CyclesChoice.None, ProductionLaunchPlanner.NormalizeChoice(CyclesChoice.Ten, 7));
            Assert.AreEqual(CyclesChoice.Max, ProductionLaunchPlanner.NormalizeChoice(CyclesChoice.Max, 7));
            Assert.AreEqual(CyclesChoice.None, ProductionLaunchPlanner.NormalizeChoice(CyclesChoice.One, 0));
        }

        // ── Aperçu et durée ───────────────────────────────────────────────────

        [Test]
        public void Apercu_FormeDuFounder()
        {
            Assert.AreEqual("10 planks : 20 logs, 4 h 10", ProductionLaunchPlanner.FormatPreview(Planks, 10));
            Assert.AreEqual("1 planks : 2 logs, 25 min", ProductionLaunchPlanner.FormatPreview(Planks, 1));
            Assert.AreEqual("3 kits : 9 planks, 3 h 00", ProductionLaunchPlanner.FormatPreview(Kits, 3));
        }

        [Test]
        public void Duree_Formatee()
        {
            Assert.AreEqual("25 min", ProductionLaunchPlanner.FormatDuration(25L * 60_000));
            Assert.AreEqual("59 min", ProductionLaunchPlanner.FormatDuration(59L * 60_000));
            Assert.AreEqual("1 h 00", ProductionLaunchPlanner.FormatDuration(60L * 60_000));
            Assert.AreEqual("1 h 05", ProductionLaunchPlanner.FormatDuration(65L * 60_000));
            Assert.AreEqual("10 h 00", ProductionLaunchPlanner.FormatDuration(600L * 60_000));
            Assert.AreEqual("0 min", ProductionLaunchPlanner.FormatDuration(0L));
        }

        [Test]
        public void NomsDeRessource_Invariables_JamaisLaCleTechnique()
        {
            Assert.AreEqual("kits", ProductionLaunchPlanner.ResourceName("reconstructionKits"));
            Assert.AreEqual("planks", ProductionLaunchPlanner.ResourceName("planks"));
            Assert.AreEqual("logs", ProductionLaunchPlanner.ResourceName("logs"));
        }

        [Test]
        public void SlotActif_RecetteReelle()
        {
            Assert.AreEqual("Logs en cours", ProductionLaunchPlanner.ActiveSlotLabel("logs"));
            Assert.AreEqual("Planks en cours", ProductionLaunchPlanner.ActiveSlotLabel("planks"));
            Assert.AreEqual("Kits en cours", ProductionLaunchPlanner.ActiveSlotLabel("reconstruction_kits"));
            Assert.AreEqual("Production en cours", ProductionLaunchPlanner.ActiveSlotLabel("charcoal"));
        }

        // ── Saturation ────────────────────────────────────────────────────────

        [Test]
        public void Saturation_OuiNon()
        {
            // Autre slot de planks : 10 prévus, 2 faits → 8 restants ; place libre 30 − 15 = 15.
            var slots = Building(Batch(0, "planks", 10, 2), Free(1), Free(2)).Slots;
            var inv   = Inv(50, 15, 0);
            Assert.AreEqual(8, ProductionLaunchPlanner.RemainingOutputOfOtherSlots(Planks, slots, 1));
            Assert.IsTrue(ProductionLaunchPlanner.IsSaturationRisk(Planks, 8, slots, 1, inv));   // 16 > 15
            Assert.IsFalse(ProductionLaunchPlanner.IsSaturationRisk(Planks, 7, slots, 1, inv));  // 15 = 15
        }

        [Test]
        public void Saturation_AutresRessourcesEtSlotDuPanneauIgnores()
        {
            var slots = Building(Batch(0, "reconstruction_kits", 10, 0), new SlotSnapshot(1, "logs", 1L, 0L), Free(2)).Slots;
            Assert.AreEqual(0, ProductionLaunchPlanner.RemainingOutputOfOtherSlots(Planks, slots, 2));
            Assert.AreEqual(0, ProductionLaunchPlanner.RemainingOutputOfOtherSlots(Kits, slots, 0), "slot du panneau exclu");
        }

        [Test]
        public void Saturation_RestantNegatifRameneAZero_CompteurAbsentAZero()
        {
            var slots = Building(Batch(0, "planks", 3, 5), Batch(1, "planks", null, null), Free(2)).Slots;
            Assert.AreEqual(0, ProductionLaunchPlanner.RemainingOutputOfOtherSlots(Planks, slots, 2));
            Assert.IsFalse(ProductionLaunchPlanner.IsSaturationRisk(Planks, 5, slots, 2, Inv(50, 25, 0)));  // 5 = 5
        }

        [Test]
        public void Saturation_PlaceLibreInconnue_AucunAvertissement()
        {
            var slots = Building(Batch(0, "planks", 24, 0), Free(1), Free(2)).Slots;
            Assert.IsFalse(ProductionLaunchPlanner.IsSaturationRisk(Planks, 24, slots, 1, null));
            var noPlanks = new InventoryState(new ResourceStack(50, 50), null, new ResourceStack(0, 10));
            Assert.IsFalse(ProductionLaunchPlanner.IsSaturationRisk(Planks, 24, slots, 1, noPlanks));
        }

        [Test]
        public void Saturation_Logs_Jamais()
        {
            var slots = Building(new SlotSnapshot(0, "logs", 1L, 0L), Free(1), Free(2)).Slots;
            Assert.IsFalse(ProductionLaunchPlanner.IsSaturationRisk(Logs, 1, slots, 1, Inv(50, 0, 0)));
        }

        // ── Intention et registre ─────────────────────────────────────────────

        [Test]
        public void Intention_ContenuCompletDeLaRequete()
        {
            Assert.AreEqual("start:sawmill_0:1:planks:10", ProductionLaunchPlanner.BuildStartIntent("sawmill_0", 1, "planks", 10));
            Assert.AreEqual("start:sawmill_0:0:logs:-", ProductionLaunchPlanner.BuildStartIntent("sawmill_0", 0, "logs", null));
        }

        [Test]
        public void Registre_ChangerN_AutreCle_RevenirAuNInitial_MemeCle()
        {
            var keys  = new PendingIntentKeys();
            var state = Building(Free(0), Free(1), Free(2));
            var ten   = ProductionLaunchPlanner.BuildStartIntent("sawmill_0", 1, "planks", 10);
            var one   = ProductionLaunchPlanner.BuildStartIntent("sawmill_0", 1, "planks", 1);

            var keyTen = keys.GetOrCreate(ten, state);
            var keyOne = keys.GetOrCreate(one, state);
            Assert.AreNotEqual(keyTen, keyOne);

            // Retour au N initial sans réponse : même clé, non résolue.
            keys.PurgeStale(state);
            Assert.AreEqual(keyTen, keys.GetOrCreate(ten, state));
            Assert.AreEqual(2, keys.Count);
        }

        [Test]
        public void Registre_Purge_RetireLesIntentionsPerimees()
        {
            var keys = new PendingIntentKeys();
            var old  = Building(Free(0), Free(1), Free(2));
            var cur  = Building(Free(0), Free(1), Free(2));
            keys.GetOrCreate("start:sawmill_0:0:logs:-", old);
            keys.GetOrCreate("start:sawmill_0:1:planks:10", old);
            var kept = keys.GetOrCreate("start:sawmill_0:2:planks:1", cur);

            keys.PurgeStale(cur);

            Assert.AreEqual(1, keys.Count);
            Assert.AreEqual(kept, keys.GetOrCreate("start:sawmill_0:2:planks:1", cur));
        }

        [Test]
        public void Registre_AncreSurLeStore_EcranRecree_MemeCle_EtatServeurDifferent_NouvelleCle()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 0, 0), Building(Free(0), Free(1), Free(2)));
            var keys   = new PendingIntentKeys();
            var intent = ProductionLaunchPlanner.BuildStartIntent("sawmill_0", 0, "planks", 10);

            keys.PurgeStale(store.Building);
            var first = keys.GetOrCreate(intent, store.Building);   // erreur réseau : non résolue

            // Écran recréé : il relit le même bâtiment du store, sans nouveau chargement.
            keys.PurgeStale(store.Building);
            Assert.AreEqual(first, keys.GetOrCreate(intent, store.Building));

            // Nouvelle réponse serveur : autre référence → intention purgée, nouvelle clé.
            store.ApplyServerProductionState(store.IssueRequestNumber(), Building(Free(0), Free(1), Free(2)), null);
            keys.PurgeStale(store.Building);
            Assert.AreNotEqual(first, keys.GetOrCreate(intent, store.Building));
            Assert.AreEqual(1, keys.Count);
        }

        // ── Réponse au store malgré l'annulation ──────────────────────────────

        [Test]
        public void Reponse_RecueApresAnnulation_EcriteDansLeStore_AucuneUI()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 100, Inv(50, 0, 0), Building(Free(0), Free(1), Free(2)));

            var request   = store.IssueRequestNumber();
            var building  = Building(Batch(0, "planks", 10, 0), Free(1), Free(2));
            var inventory = Inv(30, 0, 0);
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            var mayRenderUi = ProductionStoreWriter.ApplyProductionState(store, request, building, inventory, cts.Token);

            Assert.IsFalse(mayRenderUi, "après annulation : aucune écriture d'UI");
            Assert.AreSame(building, store.Building);
            Assert.AreSame(inventory, store.Inventory);
            Assert.AreEqual(100, store.Gold);
        }

        [Test]
        public void Reponse_JetonActif_EcriteDansLeStore_UIAutorisee()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerState(0, Inv(50, 0, 0));
            var building  = Building(Free(0), Free(1), Free(2));
            var inventory = Inv(10, 0, 0);

            Assert.IsTrue(ProductionStoreWriter.ApplyProductionState(
                store, store.IssueRequestNumber(), building, inventory, CancellationToken.None));
            Assert.AreSame(building, store.Building);
            Assert.AreSame(inventory, store.Inventory);
        }

        [Test]
        public void Chargement_RecuApresAnnulation_EcritDansLeStore()
        {
            var store     = new PlayerEconomyStateStore();
            var inventory = Inv(5, 0, 0);
            var building  = Building(Free(0), Free(1), Free(2));
            var snapshot  = new PlayerStateSnapshot(
                new PlayerData("p", 42, 0, inventory, "commoner", false, false),
                new List<BuildingSnapshot> { building }, 0);
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            Assert.IsFalse(ProductionStoreWriter.ApplyLoginState(store, store.IssueRequestNumber(), snapshot, cts.Token));
            Assert.IsTrue(store.HasState);
            Assert.AreEqual(42, store.Gold);
            Assert.AreSame(inventory, store.Inventory);
            Assert.AreSame(building, store.Building);
        }

        [Test]
        public void Store_UnSeulChangedParEcriture_JamaisDEtatMelange()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 0, 0), Building(Free(0), Free(1), Free(2)));

            var building  = Building(Batch(0, "planks", 10, 0), Free(1), Free(2));
            var inventory = Inv(30, 0, 0);
            var calls     = 0;
            var coherent  = true;
            store.Changed += () =>
            {
                calls++;
                coherent &= ReferenceEquals(store.Building, building) && ReferenceEquals(store.Inventory, inventory);
            };

            Assert.IsTrue(store.ApplyServerProductionState(store.IssueRequestNumber(), building, inventory));
            Assert.AreEqual(1, calls, "bâtiment et inventaire : une seule notification");
            Assert.IsTrue(coherent, "l'abonné ne voit jamais un état mélangé");
        }

        [Test]
        public void Ordre_ReponsesInversees_LEtatDeBReste()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 15, 0), Building(Free(0), Free(1), Free(2)));

            // Lancement A envoyé, aller-retour au marché, lancement B envoyé ; B répond avant A.
            var requestA   = store.IssueRequestNumber();
            var requestB   = store.IssueRequestNumber();
            var buildingA  = Building(Batch(0, "planks", 10, 0), Free(1), Free(2));
            var buildingB  = Building(Batch(0, "planks", 10, 0), Batch(1, "planks", 5, 0), Free(2));
            var inventoryA = Inv(30, 15, 0);
            var inventoryB = Inv(20, 15, 0);

            using var cts = new CancellationTokenSource();
            cts.Cancel();   // A vient d'une génération d'écran annulée
            Assert.IsTrue(ProductionStoreWriter.ApplyProductionState(store, requestB, buildingB, inventoryB, CancellationToken.None));
            Assert.IsFalse(ProductionStoreWriter.ApplyProductionState(store, requestA, buildingA, inventoryA, cts.Token));

            Assert.AreSame(buildingB, store.Building, "le slot lancé par B reste visible");
            Assert.AreSame(inventoryB, store.Inventory, "l'inventaire de B n'est pas rétabli à celui de A");
            Assert.AreEqual(requestB, store.LastAppliedRequest);
        }

        [Test]
        public void Ordre_Normal_APuisB_TousDeuxAppliques()
        {
            var store = new PlayerEconomyStateStore();
            Assert.IsTrue(store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 15, 0), Building(Free(0), Free(1), Free(2))));
            var requestA   = store.IssueRequestNumber();
            var requestB   = store.IssueRequestNumber();
            var buildingA  = Building(Batch(0, "planks", 10, 0), Free(1), Free(2));
            var buildingB  = Building(Batch(0, "planks", 10, 0), Batch(1, "planks", 5, 0), Free(2));
            var inventoryB = Inv(20, 15, 0);

            Assert.Less(requestA, requestB);
            Assert.IsTrue(store.ApplyServerProductionState(requestA, buildingA, Inv(30, 15, 0)));
            Assert.AreSame(buildingA, store.Building);
            Assert.IsTrue(store.ApplyServerProductionState(requestB, buildingB, inventoryB));
            Assert.AreSame(buildingB, store.Building);
            Assert.AreSame(inventoryB, store.Inventory);
        }

        [Test]
        public void Ordre_ReponseIgnoree_SansEffetSurLeStore()
        {
            var store     = new PlayerEconomyStateStore();
            var inventory = Inv(50, 15, 0);
            var building  = Building(Free(0), Free(1), Free(2));
            var stale     = store.IssueRequestNumber();
            var fresh     = store.IssueRequestNumber();
            Assert.IsTrue(store.ApplyServerLoginState(fresh, 7, inventory, building));

            var calls = 0;
            store.Changed += () => calls++;

            // Réponses de numéro inférieur ou égal au dernier appliqué (chargement comme production) : ignorées.
            Assert.IsFalse(store.ApplyServerLoginState(stale, 99, Inv(0, 0, 0), Building(Free(0))));
            Assert.IsFalse(store.ApplyServerProductionState(stale, Building(Free(0)), Inv(0, 0, 0)));
            Assert.IsFalse(store.ApplyServerProductionState(fresh, Building(Free(0)), Inv(0, 0, 0)));

            Assert.AreEqual(0, calls, "aucune notification");
            Assert.AreEqual(7, store.Gold);
            Assert.AreSame(inventory, store.Inventory);
            Assert.AreSame(building, store.Building);
            Assert.AreEqual(fresh, store.LastAppliedRequest);
        }

        // ── Sérialisation des appels entre écrans (bloquant de revue v3) ──────

        [Test]
        public void Serialisation_AppelAEnCours_EcranRecree_AucunEnvoiBAvantLaFinDeA()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 15, 0), Building(Free(0), Free(1), Free(2)));

            Assert.IsTrue(store.TryBeginServerCall(out var requestA), "envoi de A");
            Assert.IsTrue(store.CallInFlight);

            // Écran quitté puis recréé : l'état vit dans le store, il n'est pas remis à zéro ; B est refusé.
            Assert.IsFalse(store.TryBeginServerCall(out var requestB), "aucun envoi de B pendant A");
            Assert.AreEqual(0, requestB);
            Assert.IsTrue(store.CallInFlight);
            Assert.IsFalse(ProductionLaunchPlanner.ComputeButtons(Planks, CyclesChoice.One, 10, store.CallInFlight).Launch,
                "boutons d'action inactifs sur l'écran recréé");
            Assert.Greater(requestA, 0);
        }

        [Test]
        public void Serialisation_FinDeA_Succes_EtatLeve_ReponseDeAAppliquee()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 15, 0), Building(Free(0), Free(1), Free(2)));
            var events = 0;
            store.Changed += () => events++;

            Assert.IsTrue(store.TryBeginServerCall(out var requestA));
            var buildingA  = Building(Batch(0, "planks", 10, 0), Free(1), Free(2));
            var inventoryA = Inv(30, 15, 0);
            using var cts = new CancellationTokenSource();
            cts.Cancel();   // l'écran qui a lancé A a été fermé pendant l'appel

            ProductionStoreWriter.ApplyProductionState(store, requestA, buildingA, inventoryA, cts.Token);
            Assert.IsTrue(store.CallInFlight, "l'annulation de l'écran ne lève pas l'état");
            store.EndServerCall(requestA);

            Assert.IsFalse(store.CallInFlight);
            Assert.AreSame(buildingA, store.Building);
            Assert.AreSame(inventoryA, store.Inventory);
            Assert.AreEqual(3, events, "début, réponse, fin : l'écran recréé se met à jour");
        }

        [Test]
        public void Serialisation_FinDeA_Erreur_EtatLeve_StoreInchange()
        {
            var store    = new PlayerEconomyStateStore();
            var building = Building(Free(0), Free(1), Free(2));
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 15, 0), building);

            Assert.IsTrue(store.TryBeginServerCall(out var requestA));
            store.EndServerCall(requestA);   // erreur ou délai d'expiration du SDK : aucune réponse appliquée

            Assert.IsFalse(store.CallInFlight);
            Assert.AreSame(building, store.Building);
            Assert.IsTrue(store.TryBeginServerCall(out var requestB), "B peut partir après la fin de A");
            Assert.Greater(requestB, requestA);
        }

        [Test]
        public void Serialisation_FinDUnAutreNumero_SansEffet()
        {
            var store = new PlayerEconomyStateStore();
            Assert.IsTrue(store.TryBeginServerCall(out var requestA));
            store.EndServerCall(requestA + 1);
            store.EndServerCall(0);
            Assert.IsTrue(store.CallInFlight);
            store.EndServerCall(requestA);
            Assert.IsFalse(store.CallInFlight);
        }

        [Test]
        public void Serialisation_ScenarioDeCodex_BEnvoyeApresA_ContientLesDeuxLancements()
        {
            // Codex : A et B en vol ensemble, B traité et reçu avant A, puis A (état complet) rejeté. Avec la
            // sérialisation, B ne part qu'après la réponse de A : sa réponse contient les deux lancements.
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 0, Inv(50, 15, 0), Building(Free(0), Free(1), Free(2)));

            Assert.IsTrue(store.TryBeginServerCall(out var requestA));
            Assert.IsFalse(store.TryBeginServerCall(out _), "aller-retour au marché, écran recréé : B refusé");

            var buildingA = Building(Batch(0, "planks", 10, 0), Free(1), Free(2));
            Assert.IsTrue(store.ApplyServerProductionState(requestA, buildingA, Inv(30, 15, 0)));
            store.EndServerCall(requestA);

            Assert.IsTrue(store.TryBeginServerCall(out var requestB));
            var bothLaunches = Building(Batch(0, "planks", 10, 0), Batch(1, "planks", 5, 0), Free(2));
            var inventoryAB  = Inv(20, 15, 0);
            Assert.IsTrue(store.ApplyServerProductionState(requestB, bothLaunches, inventoryAB));
            store.EndServerCall(requestB);

            Assert.AreSame(bothLaunches, store.Building, "aucun slot libre périmé");
            Assert.AreSame(inventoryAB, store.Inventory, "aucun inventaire périmé");
            Assert.IsFalse(store.CallInFlight);
        }

        [Test]
        public void Store_NonAmorce_ReponseDeProductionRefusee_NumeroNonAvance()
        {
            var store = new PlayerEconomyStateStore();
            var calls = 0;
            store.Changed += () => calls++;

            Assert.IsFalse(store.ApplyServerProductionState(store.IssueRequestNumber(), Building(Free(0)), Inv(1, 0, 0)));
            Assert.AreEqual(0, store.LastAppliedRequest, "LastAppliedRequest n'avance pas");
            Assert.IsNull(store.Building);
            Assert.IsNull(store.Inventory);
            Assert.AreEqual(0, calls);

            // Le chargement suivant reste applicable.
            var login = store.IssueRequestNumber();
            Assert.IsTrue(store.ApplyServerLoginState(login, 0, Inv(5, 0, 0), Building(Free(0))));
            Assert.AreEqual(login, store.LastAppliedRequest);
        }

        // ── Immuabilité de la copie des recettes (report de 19.4b) ────────────

        [Test]
        public void RecipeInfo_InputsPerCycle_Immuable()
        {
            var source = new Dictionary<string, int> { ["logs"] = 2 };
            var recipe = new RecipeInfo("planks", "planks", 1, 1000L, 24, source);

            source["logs"] = 99;
            source["planks"] = 1;
            Assert.AreEqual(1, recipe.InputsPerCycle.Count);
            Assert.AreEqual(2, recipe.InputsPerCycle["logs"]);

            var asDictionary = (IDictionary<string, int>)recipe.InputsPerCycle;
            Assert.IsTrue(asDictionary.IsReadOnly);
            Assert.Throws<NotSupportedException>(() => asDictionary["logs"] = 5);
            Assert.Throws<NotSupportedException>(() => asDictionary.Add("kits", 1));
            Assert.Throws<NotSupportedException>(() => ((IDictionary<string, int>)Planks.InputsPerCycle).Clear());
        }

        [Test]
        public void ProductionRecipes_All_Immuable()
        {
            var asList = (IList<RecipeInfo>)ProductionRecipes.All;
            Assert.IsTrue(asList.IsReadOnly);
            Assert.Throws<NotSupportedException>(() => asList.Add(Logs));
            Assert.Throws<NotSupportedException>(() => asList[0] = Kits);
            Assert.Throws<NotSupportedException>(() => asList.RemoveAt(0));
            Assert.AreEqual(3, ProductionRecipes.All.Count);
            Assert.AreSame(Logs, ProductionRecipes.All[0]);
        }
    }
}
