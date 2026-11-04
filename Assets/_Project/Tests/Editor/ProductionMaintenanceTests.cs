using System.Collections.Generic;
using System.Threading;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.State;
using GuildsAndEmpires.UI.Screens;
using NUnit.Framework;

namespace GuildsAndEmpires.Tests.EditMode
{
    /// <summary>
    /// Tests de 19.4d (D-ETAPE19-010 Q1 et Q5 ; arbitrage du 2026-11-04, (2c)) : état « compte en maintenance » du
    /// store (posé par data-loss, levé par une connexion réussie, filtre de numéro d'envoi, store non amorcé, jeton
    /// annulé) et décision de l'écran de production (appel serveur ou non, panneau ou non).
    /// </summary>
    public class ProductionMaintenanceTests
    {
        private static InventoryState Inv(int logs, int planks, int kits) =>
            new InventoryState(new ResourceStack(logs, 50), new ResourceStack(planks, 30), new ResourceStack(kits, 10));

        private static SlotSnapshot Free(int index) => new SlotSnapshot(index, null, 0L, 0L);

        private static BuildingSnapshot Building(params SlotSnapshot[] slots) =>
            new BuildingSnapshot("sawmill_0", "sawmill", 1, new List<SlotSnapshot>(slots));

        private static PlayerStateSnapshot Login(long gold, InventoryState inventory, params BuildingSnapshot[] buildings) =>
            new PlayerStateSnapshot(
                new PlayerData("p", gold, 0, inventory, "commoner", false, false),
                new List<BuildingSnapshot>(buildings), 0);

        /// <summary>Store amorcé par un chargement : gold 100, un bâtiment à trois slots libres.</summary>
        private static PlayerEconomyStateStore LoadedStore()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerLoginState(store.IssueRequestNumber(), 100, Inv(20, 5, 0), Building(Free(0), Free(1), Free(2)));
            return store;
        }

        // ── Store : pose ──────────────────────────────────────────────────────

        [Test]
        public void DataLoss_ALaCollecte_EtatPose_ValeursMetierInchangees_ChangedLeve()
        {
            var store     = LoadedStore();
            var building  = store.Building;
            var inventory = store.Inventory;
            var calls     = 0;
            store.Changed += () => calls++;

            var request = store.IssueRequestNumber();
            Assert.IsTrue(store.ApplyServerMaintenance(request));

            Assert.IsTrue(store.IsMaintenance);
            Assert.AreEqual(1, calls, "Changed levé quand l'état change");
            Assert.AreEqual(request, store.LastAppliedRequest, "LastAppliedRequest avancé");
            Assert.AreEqual(100, store.Gold);
            Assert.AreSame(inventory, store.Inventory);
            Assert.AreSame(building, store.Building);
        }

        [Test]
        public void DataLoss_StoreNonAmorce_PremiereConnexion_EtatPose_SansValeurMetier()
        {
            var store = new PlayerEconomyStateStore();
            var calls = 0;
            store.Changed += () => calls++;

            var request = store.IssueRequestNumber();
            Assert.IsTrue(store.ApplyServerMaintenance(request));

            Assert.IsTrue(store.IsMaintenance);
            Assert.AreEqual(1, calls);
            Assert.AreEqual(request, store.LastAppliedRequest);
            Assert.IsFalse(store.HasState, "store toujours non amorcé");
            Assert.AreEqual(0, store.Gold);
            Assert.IsNull(store.Inventory);
            Assert.IsNull(store.Building);
        }

        [Test]
        public void DataLoss_DejaEnMaintenance_ChangedNonLeve_NumeroAvance()
        {
            var store = LoadedStore();
            Assert.IsTrue(store.ApplyServerMaintenance(store.IssueRequestNumber()));
            var calls = 0;
            store.Changed += () => calls++;

            var request = store.IssueRequestNumber();
            Assert.IsTrue(store.ApplyServerMaintenance(request), "réessai revenu data-loss");

            Assert.IsTrue(store.IsMaintenance);
            Assert.AreEqual(0, calls, "l'état ne change pas : aucune notification");
            Assert.AreEqual(request, store.LastAppliedRequest);
        }

        [Test]
        public void DataLoss_HorsSequence_SansEffet()
        {
            var store = new PlayerEconomyStateStore();
            var stale = store.IssueRequestNumber();
            var fresh = store.IssueRequestNumber();
            Assert.IsTrue(store.ApplyServerLoginState(fresh, 7, Inv(1, 0, 0), Building(Free(0))));
            var calls = 0;
            store.Changed += () => calls++;

            Assert.IsFalse(store.ApplyServerMaintenance(stale));
            Assert.IsFalse(store.ApplyServerMaintenance(fresh));

            Assert.IsFalse(store.IsMaintenance);
            Assert.AreEqual(0, calls);
            Assert.AreEqual(fresh, store.LastAppliedRequest);
        }

        [Test]
        public void DataLoss_AuLancement_MemeFiltreDeNumero()
        {
            // Lancement A envoyé puis B (aller-retour au marché) ; B revient d'abord avec un état sain, puis le
            // data-loss de A, hors séquence : ignoré. Un data-loss de lancement de numéro supérieur : posé.
            var store    = LoadedStore();
            var requestA = store.IssueRequestNumber();
            var requestB = store.IssueRequestNumber();
            Assert.IsTrue(ProductionStoreWriter.ApplyProductionState(
                store, requestB, Building(Free(0), Free(1), Free(2)), Inv(18, 5, 0), CancellationToken.None));

            Assert.IsTrue(ProductionStoreWriter.ApplyMaintenance(store, requestA, CancellationToken.None));
            Assert.IsFalse(store.IsMaintenance, "data-loss hors séquence : sans effet");
            Assert.AreEqual(requestB, store.LastAppliedRequest);

            var requestC = store.IssueRequestNumber();
            Assert.IsTrue(ProductionStoreWriter.ApplyMaintenance(store, requestC, CancellationToken.None));
            Assert.IsTrue(store.IsMaintenance);
            Assert.AreEqual(requestC, store.LastAppliedRequest);
        }

        [Test]
        public void DataLoss_JetonDejaAnnule_EtatPose_AucuneUI()
        {
            var store = LoadedStore();
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            var mayRenderUi = ProductionStoreWriter.ApplyMaintenance(store, store.IssueRequestNumber(), cts.Token);

            Assert.IsFalse(mayRenderUi, "après annulation : aucune écriture d'UI");
            Assert.IsTrue(store.IsMaintenance, "état posé dans le store malgré l'annulation");
        }

        [Test]
        public void ErreurNonDataLoss_NePosePasLaMaintenance()
        {
            var store = LoadedStore();
            var calls = 0;
            store.Changed += () => calls++;

            // Erreur réseau, refus, délai : aucune réponse appliquée, seul l'état « appel en cours » bouge.
            Assert.IsTrue(store.TryBeginServerCall(out var request));
            store.EndServerCall(request);

            Assert.IsFalse(store.IsMaintenance);
            Assert.AreEqual(2, calls, "début et fin d'appel seulement");
        }

        // ── Store : levée ─────────────────────────────────────────────────────

        [Test]
        public void ConnexionReussie_LeveLaMaintenance_UnSeulChanged()
        {
            var store = LoadedStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());
            var calls = 0;
            store.Changed += () => calls++;

            var building = Building(Free(0), Free(1), Free(2));
            Assert.IsTrue(ProductionStoreWriter.ApplyLoginState(
                store, store.IssueRequestNumber(), Login(120, Inv(20, 5, 0), building), CancellationToken.None));

            Assert.IsFalse(store.IsMaintenance);
            Assert.AreEqual(1, calls);
            Assert.AreSame(building, store.Building);
            Assert.AreEqual(120, store.Gold);
        }

        [Test]
        public void ConnexionReussieSansBatiment_LeveLaMaintenance()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());

            ProductionStoreWriter.ApplyLoginState(store, store.IssueRequestNumber(), Login(0, Inv(0, 0, 0)), CancellationToken.None);

            Assert.IsFalse(store.IsMaintenance);
            Assert.IsNull(store.Building);
            Assert.IsTrue(store.HasState);
        }

        [Test]
        public void ConnexionHorsSequence_NeLevePas()
        {
            var store = LoadedStore();
            var stale = store.IssueRequestNumber();
            store.ApplyServerMaintenance(store.IssueRequestNumber());

            Assert.IsFalse(store.ApplyServerLoginState(stale, 1, Inv(0, 0, 0), Building(Free(0))));
            Assert.IsTrue(store.IsMaintenance);
        }

        [Test]
        public void AutresReponses_NeLevent_PasLaMaintenance()
        {
            var store = LoadedStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());

            store.ApplyServerProductionState(store.IssueRequestNumber(), Building(Free(0), Free(1), Free(2)), Inv(1, 0, 0));
            store.ApplyServerState(50, Inv(1, 0, 0));          // vente au marché (non numérotée)
            store.ApplyServerInventory(Inv(2, 0, 0));
            Assert.IsTrue(store.TryBeginServerCall(out var request));
            store.EndServerCall(request);                        // erreur non data-loss

            Assert.IsTrue(store.IsMaintenance);
        }

        // ── Décision de l'écran (2c) ──────────────────────────────────────────

        [Test]
        public void Ecran_DataLossPendantLeMarche_EcranRecree_PanneauSansAppel()
        {
            // « Collecter », puis « Marché » pendant l'appel : l'écran de production est désactivé (jeton annulé). Le
            // data-loss revient sans aucun écran de production actif ; l'écran recréé lit le store.
            var store = LoadedStore();
            Assert.IsTrue(store.TryBeginServerCall(out var collect));
            using var cts = new CancellationTokenSource();
            cts.Cancel();
            Assert.IsFalse(ProductionStoreWriter.ApplyMaintenance(store, collect, cts.Token));
            store.EndServerCall(collect);

            Assert.AreEqual(ProductionLoadStep.Maintenance, ProductionLoadDecision.OnEnable(store), "aucun appel");
            Assert.IsTrue(ProductionLoadDecision.ShowMaintenancePanel(store));
        }

        [Test]
        public void Ecran_MaintenanceSansBatiment_AucunAppel_Panneau()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());   // data-loss au premier chargement

            Assert.AreEqual(ProductionLoadStep.Maintenance, ProductionLoadDecision.OnEnable(store));
            Assert.IsTrue(ProductionLoadDecision.ShowMaintenancePanel(store));
        }

        [Test]
        public void Ecran_MaintenanceAvecBatiment_AucunAppel_Panneau()
        {
            var store = LoadedStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());

            Assert.AreEqual(ProductionLoadStep.Maintenance, ProductionLoadDecision.OnEnable(store));
            Assert.IsTrue(ProductionLoadDecision.ShowMaintenancePanel(store));
        }

        [Test]
        public void Ecran_HorsMaintenance_SansBatiment_AucunAppelEnCours_Appel()
        {
            var store = new PlayerEconomyStateStore();

            Assert.AreEqual(ProductionLoadStep.Load, ProductionLoadDecision.OnEnable(store));
            Assert.IsFalse(ProductionLoadDecision.ShowMaintenancePanel(store));
        }

        [Test]
        public void Ecran_HorsMaintenance_SansBatiment_AppelEnCours_AucunAppel()
        {
            var store = new PlayerEconomyStateStore();
            Assert.IsTrue(store.TryBeginServerCall(out _));

            Assert.AreEqual(ProductionLoadStep.Wait, ProductionLoadDecision.OnEnable(store));
            Assert.AreEqual(ProductionLoadStep.None, ProductionLoadDecision.AfterStoreChanged(store, awaitingLoad: true),
                "rien tant que l'appel est en cours");
        }

        [Test]
        public void Ecran_HorsMaintenance_AvecBatiment_Pret()
        {
            Assert.AreEqual(ProductionLoadStep.Ready, ProductionLoadDecision.OnEnable(LoadedStore()));
        }

        [Test]
        public void Ecran_FinDAppel_BatimentArrive_AucunAppel_Pret()
        {
            var store = new PlayerEconomyStateStore();
            Assert.IsTrue(store.TryBeginServerCall(out var load));
            store.ApplyServerLoginState(load, 0, Inv(0, 0, 0), Building(Free(0)));
            store.EndServerCall(load);

            Assert.AreEqual(ProductionLoadStep.Ready, ProductionLoadDecision.AfterStoreChanged(store, awaitingLoad: true));
        }

        [Test]
        public void Ecran_FinDAppel_DataLossAuPremierChargement_AucunAppel_Panneau()
        {
            var store = new PlayerEconomyStateStore();
            Assert.IsTrue(store.TryBeginServerCall(out var load));
            store.ApplyServerMaintenance(load);
            store.EndServerCall(load);

            Assert.AreEqual(ProductionLoadStep.Maintenance, ProductionLoadDecision.AfterStoreChanged(store, awaitingLoad: true));
            Assert.AreEqual(ProductionLoadStep.Maintenance, ProductionLoadDecision.OnEnable(store), "écran recréé : idem");
        }

        [Test]
        public void Ecran_FinDAppel_SansBatiment_HorsMaintenance_ChargementRelance()
        {
            // Comportement existant : l'appel d'un écran précédent est revenu sans bâtiment (erreur) → chargement.
            var store = new PlayerEconomyStateStore();
            Assert.IsTrue(store.TryBeginServerCall(out var other));
            store.EndServerCall(other);

            Assert.AreEqual(ProductionLoadStep.Load, ProductionLoadDecision.AfterStoreChanged(store, awaitingLoad: true));
        }

        [Test]
        public void Ecran_NAttendAucunChargement_Rien()
        {
            var store = new PlayerEconomyStateStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());

            Assert.AreEqual(ProductionLoadStep.None, ProductionLoadDecision.AfterStoreChanged(store, awaitingLoad: false));
            Assert.AreEqual(ProductionLoadStep.None, ProductionLoadDecision.AfterStoreChanged(LoadedStore(), awaitingLoad: false));
        }

        [Test]
        public void Ecran_RetourDuMarcheAvantLaReponse_DataLoss_EntreeEnMaintenance_LigneVidee()
        {
            // Relecture du diff (Codex) : « Collecter », « Marché », retour AVANT la réponse. L'écran recréé affiche
            // « Prêt. » (bâtiment présent) ; le data-loss revient avec le jeton annulé de l'écran précédent : c'est
            // l'entrée en maintenance, lue depuis le store, qui vide la ligne d'état.
            var store = LoadedStore();
            Assert.IsTrue(store.TryBeginServerCall(out var collect));
            Assert.AreEqual(ProductionLoadStep.Ready, ProductionLoadDecision.OnEnable(store), "retour : « Prêt. »");
            var panelShown = ProductionLoadDecision.ShowMaintenancePanel(store);
            Assert.IsFalse(panelShown);

            using var cts = new CancellationTokenSource();
            cts.Cancel();
            Assert.IsFalse(ProductionStoreWriter.ApplyMaintenance(store, collect, cts.Token), "ancien jeton : aucune UI");

            Assert.IsTrue(ProductionLoadDecision.EntersMaintenance(panelShown, store), "ligne d'état vidée au rendu");
            store.EndServerCall(collect);
            Assert.IsFalse(ProductionLoadDecision.EntersMaintenance(true, store), "panneau déjà affiché : pas de nouvelle entrée");
        }

        [Test]
        public void Ecran_EntreeEnMaintenance_SeulementQuandLeStoreYEst()
        {
            var store = LoadedStore();
            Assert.IsFalse(ProductionLoadDecision.EntersMaintenance(false, store), "hors maintenance");
            Assert.IsFalse(ProductionLoadDecision.EntersMaintenance(false, null), "store absent");

            // Data-loss hors séquence écarté par le store : pas d'entrée en maintenance, ligne d'état intacte.
            var stale = store.IssueRequestNumber();
            store.ApplyServerProductionState(store.IssueRequestNumber(), Building(Free(0), Free(1), Free(2)), Inv(1, 0, 0));
            Assert.IsFalse(store.ApplyServerMaintenance(stale));
            Assert.IsFalse(ProductionLoadDecision.EntersMaintenance(false, store));
            Assert.IsFalse(ProductionLoadDecision.ShowMaintenancePanel(store));

            store.ApplyServerMaintenance(store.IssueRequestNumber());
            Assert.IsTrue(ProductionLoadDecision.EntersMaintenance(false, store));
            Assert.IsFalse(ProductionLoadDecision.EntersMaintenance(true, store));
        }

        [Test]
        public void Ecran_MaintenanceEtReessaiEnCours_Attente_PuisPanneauOuPret()
        {
            // Écran recréé pendant un « Réessayer » : on attend la fin de l'appel, sans nouvel appel.
            var store = LoadedStore();
            store.ApplyServerMaintenance(store.IssueRequestNumber());
            Assert.IsTrue(store.TryBeginServerCall(out var retry));
            Assert.AreEqual(ProductionLoadStep.Wait, ProductionLoadDecision.OnEnable(store));

            store.ApplyServerLoginState(retry, 100, Inv(20, 5, 0), Building(Free(0), Free(1), Free(2)));
            store.EndServerCall(retry);
            Assert.AreEqual(ProductionLoadStep.Ready, ProductionLoadDecision.AfterStoreChanged(store, awaitingLoad: true));
            Assert.IsFalse(ProductionLoadDecision.ShowMaintenancePanel(store));
        }
    }
}
