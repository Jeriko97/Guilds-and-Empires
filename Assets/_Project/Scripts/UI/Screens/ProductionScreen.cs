using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Player;
using GuildsAndEmpires.Services.Production;
using GuildsAndEmpires.State;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Premier écran gameplay — liste les slots de la Sawmill ; sur un slot libre, « Produire » ouvre le panneau de
    /// lancement (recette, N par 1 / 10 / Max, aperçu, avertissement de saturation — 19.4c-1, D-ETAPE19-014).
    ///
    /// Règles absolues :
    /// - Aucun calcul économique/temporel local — état brut depuis la CF. Doctrine server-auth.
    ///   Annotation (19.4b, arbitrage du 2026-11-03) : l'interdit « économique » reste entier. « Temporel » :
    ///   seule une estimation d'AFFICHAGE est admise (avancement du lot, temps restant — D-ETAPE19-010,
    ///   options A) ; horloge locale falsifiable ; aucune action n'est bloquée ni débloquée par cette
    ///   estimation, aucune valeur estimée n'est envoyée au serveur ni écrite dans un état métier ; le
    ///   serveur tranche. Doctrine C1, règle 3 (confort UX, doublé côté serveur).
    ///   Annotation (19.4c-1, arbitrage 1a-1f) : Max, aperçu et saturation sont calculés pour l'affichage seulement
    ///   (ProductionLaunchPlanner, copie des recettes TD-027) ; seuls blocages client : boutons N grisés au-delà de
    ///   Max, « Lancer » inactif sans N choisi. Seul N (Max compris) part au serveur, qui le revalide.
    /// - État métier : le PlayerEconomyStateStore seul (doctrine C7), bâtiment compris ; l'écran n'en garde aucune
    ///   copie. Chaque réponse serveur est proposée au store AVANT le contrôle d'annulation ; seules les écritures
    ///   d'UI sont abandonnées après annulation (C9). Un écran recréé affiche le bâtiment du store sans relancer
    ///   resolveLoginState.
    /// - Sérialisation (bloquants de revue 19.4c-1) : un seul appel qui écrit bâtiment et inventaire (chargement,
    ///   lancement, collecte) à la fois, tous écrans confondus ; l'état « appel en cours » vit dans le store, posé à
    ///   l'envoi, levé quand l'appel revient (réponse ou erreur), jamais par l'annulation de l'écran. Un écran recréé
    ///   pendant un appel garde ses boutons d'action inactifs jusqu'à la fin de l'appel, puis se met à jour depuis le
    ///   store (Changed). Filet : le store écarte une réponse dont le numéro d'envoi n'est pas le plus grand.
    /// - Cycle de vie symétrique : CTS créé en OnEnable, annulé+disposé en OnDisable ; abonnements (boutons
    ///   persistants, store.Changed) en OnEnable, retirés en OnDisable. Doctrine C9.
    /// - IPlayerService et IProductionService résolus via ServiceLocator. Doctrine C3.
    /// - INTERDIT de rappeler resolveLoginState après startProductionSlot (réponse contient building).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class ProductionScreen : BaseScreen
    {
        private UIDocument _doc;
        private CancellationTokenSource _cts;

        [SerializeField] private MarketScreen _marketScreenPrefab;

        // Clés d'idempotence des intentions en attente (D-ETAPE19-003, patron PendingSales de MarketScreen).
        // Statique ; la référence comparée est le bâtiment du PlayerEconomyStateStore (il survit à l'écran) : un
        // écran recréé réutilise la clé d'un réessai sur le même état serveur.
        private static readonly PendingIntentKeys PendingIntents = new();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics() => PendingIntents.Clear();

        // ── UI element refs ───────────────────────────────────────────────────
        private Label         _titleLabel;
        private Label         _statusLabel;
        private Label         _economyLabel;
        private VisualElement _slotsContainer;
        private Button        _collectButton;
        private Button        _marketButton;

        // Panneau de lancement (persistant, UXML).
        private VisualElement _launchPanel;
        private VisualElement _cyclesRow;
        private Button        _recipeLogsButton;
        private Button        _recipePlanksButton;
        private Button        _recipeKitsButton;
        private Button        _cyclesOneButton;
        private Button        _cyclesTenButton;
        private Button        _cyclesMaxButton;
        private Label         _previewLabel;
        private Label         _saturationLabel;
        private Button        _launchButton;
        private Button        _cancelButton;

        // ── State (UI seulement : aucune valeur métier) ───────────────────────
        private PlayerEconomyStateStore _store;
        private readonly List<Button>   _slotButtons = new();
        private bool                    _awaitingLoad;     // aucun bâtiment dans le store à l'OnEnable
        private int?                    _panelSlotIndex;   // null = panneau fermé
        private RecipeInfo              _panelRecipe;
        private CyclesChoice            _panelChoice;

        private void Awake()
        {
            _doc = GetComponent<UIDocument>();
        }

        private void OnEnable()
        {
            _cts = new CancellationTokenSource();

            var root        = _doc.rootVisualElement;
            _titleLabel     = root.Q<Label>("title-label");
            _statusLabel    = root.Q<Label>("status-label");
            _economyLabel   = root.Q<Label>("economy-label");
            _slotsContainer = root.Q<VisualElement>("slots-container");
            _collectButton  = root.Q<Button>("collect-button");
            if (_collectButton != null)
            {
                _collectButton.style.display = DisplayStyle.None;
                _collectButton.clicked += OnCollectClicked;
            }

            _marketButton = root.Q<Button>("market-button");
            if (_marketButton != null)
                _marketButton.clicked += OnMarketClicked;

            BindLaunchPanel(root);

            // Panneau fermé. L'état « appel en cours » n'est PAS remis à zéro : il vit dans le store et n'est levé que
            // par le retour de l'appel ; une tâche d'une génération précédente ne touche plus l'UI de cet écran (C9).
            _panelSlotIndex = null;
            _panelRecipe    = null;
            _panelChoice    = CyclesChoice.None;

            ServiceLocator.TryResolve(out _store);
            if (_store != null)
                _store.Changed += OnStoreChanged;

            // Relu à chaque OnEnable : reflète les ventes faites sur MarketScreen au retour de Pop.
            RenderEconomy();

            _awaitingLoad = _store?.Building == null;
            if (_awaitingLoad)
            {
                SetStatus("Chargement…", "status--loading");
                _slotsContainer.Clear();
                _slotButtons.Clear();
                RefreshLaunchPanel();

                // Un appel déjà en cours (lancé par un écran précédent) : on attend sa fin (OnStoreChanged).
                if (!CallInFlight)
                    _ = LoadAsync(_cts.Token);
            }
            else
            {
                RenderSlots();
                RefreshLaunchPanel();
                SetStatus("Prêt.", "status--success");
            }
        }

        private void OnDisable()
        {
            if (_collectButton != null)
                _collectButton.clicked -= OnCollectClicked;
            if (_marketButton != null)
                _marketButton.clicked -= OnMarketClicked;
            UnbindLaunchPanel();
            if (_store != null)
                _store.Changed -= OnStoreChanged;
            _store = null;
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }

        // ── Initial load ──────────────────────────────────────────────────────

        private async Task LoadAsync(CancellationToken ct)
        {
            if (!ServiceLocator.TryResolve<IPlayerService>(out var playerService) || _store == null)
            {
                GELogger.Error("ProductionScreen",
                "IPlayerService ou PlayerEconomyStateStore non enregistré — bootstrap incomplet.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            var store = _store;
            // Appel sérialisé : refusé si un autre est en cours (sa fin relancera l'attente, OnStoreChanged).
            if (!store.TryBeginServerCall(out var requestNumber)) return;
            try
            {
                var snapshot = await playerService.ResolveLoginStateAsync(ct);

                // Réponse proposée au store avant le contrôle d'annulation (C9 : seule l'UI est abandonnée).
                if (!ProductionStoreWriter.ApplyLoginState(store, requestNumber, snapshot, ct)) return;

                _awaitingLoad = false;
                if (snapshot.Buildings.Count == 0)
                {
                    SetStatus("Aucun bâtiment disponible.", "status--error");
                    return;
                }

                SetStatus("Prêt.", "status--success");
            }
            catch (OperationCanceledException)
            {
                // Annulation par l'écran : rien à afficher (C9). Annulation venue du SDK, jeton intact : traitée en
                // erreur, sinon _awaitingLoad resterait levé et la fin de l'appel relancerait le chargement en
                // boucle, sans action du joueur (C8).
                if (ct.IsCancellationRequested) return;
                GELogger.Warning("ProductionScreen", "Chargement annulé hors annulation de l'écran.");
                _awaitingLoad = false;
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
            catch (PlayerServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur PlayerService: {ex.UserMessage}");
                if (ct.IsCancellationRequested) return;
                _awaitingLoad = false;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue au chargement: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                _awaitingLoad = false;
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
            finally
            {
                // L'appel est revenu (réponse ou erreur) : état levé, quel que soit l'écran (jamais sur la seule
                // annulation de l'écran).
                store.EndServerCall(requestNumber);
            }
        }

        // ── Store ─────────────────────────────────────────────────────────────

        /// <summary>
        /// Toute écriture du store (réponse serveur) et tout début ou fin d'appel : économie, slots et panneau
        /// recalculés depuis le store (Max, boutons N, aperçu, saturation ; panneau fermé si son slot est devenu
        /// occupé ; boutons inactifs pendant un appel). Écran ouvert sans bâtiment pendant l'appel d'un écran
        /// précédent : à la fin de cet appel, « Prêt. » si le bâtiment est arrivé, sinon chargement relancé.
        /// </summary>
        private void OnStoreChanged()
        {
            RenderEconomy();
            RenderSlots();
            SetAllButtonsEnabled(!CallInFlight);

            if (!_awaitingLoad || CallInFlight || _store == null || _cts == null) return;
            if (_store.Building != null)
            {
                _awaitingLoad = false;
                SetStatus("Prêt.", "status--success");
            }
            else
            {
                _ = LoadAsync(_cts.Token);
            }
        }

        // ── Slot rendering ────────────────────────────────────────────────────

        private void RenderSlots()
        {
            _slotsContainer.Clear();
            _slotButtons.Clear();

            var building = _store?.Building;
            if (building == null)
            {
                if (_collectButton != null) _collectButton.style.display = DisplayStyle.None;
                return;
            }

            if (_titleLabel != null)
                _titleLabel.text = $"{building.BuildingType} lv{building.Level}";

            foreach (var slot in building.Slots)
            {
                var card = new VisualElement();
                card.AddToClassList("slot-card");
                if (_panelSlotIndex == slot.SlotIndex)
                    card.AddToClassList("slot-card--selected");

                var header = new Label($"Slot {slot.SlotIndex}");
                header.AddToClassList("slot-header");
                card.Add(header);

                if (slot.RecipeId == null)
                {
                    var capturedIndex = slot.SlotIndex;
                    var btn = new Button(() => OnProduceClicked(capturedIndex));
                    btn.name = $"produce-slot-{slot.SlotIndex}";
                    btn.text = PlayerMessages.ProduceButton;
                    btn.AddToClassList("slot-produce-btn");
                    btn.SetEnabled(!CallInFlight);
                    card.Add(btn);
                    _slotButtons.Add(btn);
                }
                else
                {
                    var activeLabel = new Label(ProductionLaunchPlanner.ActiveSlotLabel(slot.RecipeId));
                    activeLabel.AddToClassList("slot-active-label");
                    card.Add(activeLabel);
                }

                _slotsContainer.Add(card);
            }

            // Afficher le bouton Collecter seulement si ≥1 slot actif.
            // Prédicat identique à ci-dessus : slot actif = RecipeId != null.
            var anyActive = false;
            foreach (var s in building.Slots)
                if (s.RecipeId != null) { anyActive = true; break; }
            if (_collectButton != null)
            {
                _collectButton.style.display = anyActive ? DisplayStyle.Flex : DisplayStyle.None;
                _collectButton.SetEnabled(!CallInFlight);
            }
        }

        // ── Launch panel ──────────────────────────────────────────────────────

        private void BindLaunchPanel(VisualElement root)
        {
            _launchPanel        = root.Q<VisualElement>("launch-panel");
            _cyclesRow          = root.Q<VisualElement>("cycles-row");
            _recipeLogsButton   = root.Q<Button>("recipe-logs-button");
            _recipePlanksButton = root.Q<Button>("recipe-planks-button");
            _recipeKitsButton   = root.Q<Button>("recipe-kits-button");
            _cyclesOneButton    = root.Q<Button>("cycles-one-button");
            _cyclesTenButton    = root.Q<Button>("cycles-ten-button");
            _cyclesMaxButton    = root.Q<Button>("cycles-max-button");
            _previewLabel       = root.Q<Label>("preview-label");
            _saturationLabel    = root.Q<Label>("saturation-label");
            _launchButton       = root.Q<Button>("launch-button");
            _cancelButton       = root.Q<Button>("cancel-button");

            SetText(_recipeLogsButton,   PlayerMessages.RecipeLogs);
            SetText(_recipePlanksButton, PlayerMessages.RecipePlanks);
            SetText(_recipeKitsButton,   PlayerMessages.RecipeKits);
            SetText(_cyclesOneButton,    PlayerMessages.CyclesOne);
            SetText(_cyclesTenButton,    PlayerMessages.CyclesTen);
            SetText(_cyclesMaxButton,    PlayerMessages.CyclesMax);
            SetText(_launchButton,       PlayerMessages.LaunchButton);
            SetText(_cancelButton,       PlayerMessages.CancelButton);
            if (_saturationLabel != null) _saturationLabel.text = PlayerMessages.SaturationWarning;

            if (_recipeLogsButton   != null) _recipeLogsButton.clicked   += OnRecipeLogsClicked;
            if (_recipePlanksButton != null) _recipePlanksButton.clicked += OnRecipePlanksClicked;
            if (_recipeKitsButton   != null) _recipeKitsButton.clicked   += OnRecipeKitsClicked;
            if (_cyclesOneButton    != null) _cyclesOneButton.clicked    += OnCyclesOneClicked;
            if (_cyclesTenButton    != null) _cyclesTenButton.clicked    += OnCyclesTenClicked;
            if (_cyclesMaxButton    != null) _cyclesMaxButton.clicked    += OnCyclesMaxClicked;
            if (_launchButton       != null) _launchButton.clicked       += OnLaunchClicked;
            if (_cancelButton       != null) _cancelButton.clicked       += OnCancelClicked;
        }

        private void UnbindLaunchPanel()
        {
            if (_recipeLogsButton   != null) _recipeLogsButton.clicked   -= OnRecipeLogsClicked;
            if (_recipePlanksButton != null) _recipePlanksButton.clicked -= OnRecipePlanksClicked;
            if (_recipeKitsButton   != null) _recipeKitsButton.clicked   -= OnRecipeKitsClicked;
            if (_cyclesOneButton    != null) _cyclesOneButton.clicked    -= OnCyclesOneClicked;
            if (_cyclesTenButton    != null) _cyclesTenButton.clicked    -= OnCyclesTenClicked;
            if (_cyclesMaxButton    != null) _cyclesMaxButton.clicked    -= OnCyclesMaxClicked;
            if (_launchButton       != null) _launchButton.clicked       -= OnLaunchClicked;
            if (_cancelButton       != null) _cancelButton.clicked       -= OnCancelClicked;
        }

        /// <summary>« Produire » sur un slot libre : panneau ouvert sur ce slot, recette et N remis à zéro (aucune requête).</summary>
        private void OnProduceClicked(int slotIndex)
        {
            if (CallInFlight) return;
            _panelSlotIndex = slotIndex;
            _panelRecipe    = null;
            _panelChoice    = CyclesChoice.None;
            RenderSlots();
            RefreshLaunchPanel();
        }

        private void OnRecipeLogsClicked()   => SelectRecipe(ProductionRecipes.LogsId);
        private void OnRecipePlanksClicked() => SelectRecipe(ProductionRecipes.PlanksId);
        private void OnRecipeKitsClicked()   => SelectRecipe(ProductionRecipes.ReconstructionKitsId);

        private void SelectRecipe(string recipeId)
        {
            if (CallInFlight || _panelSlotIndex == null) return;
            _panelRecipe = ProductionRecipes.Find(recipeId);
            _panelChoice = CyclesChoice.None;   // 1a : aucun N présélectionné
            RefreshLaunchPanel();
        }

        private void OnCyclesOneClicked() => SelectCycles(CyclesChoice.One);
        private void OnCyclesTenClicked() => SelectCycles(CyclesChoice.Ten);
        private void OnCyclesMaxClicked() => SelectCycles(CyclesChoice.Max);

        private void SelectCycles(CyclesChoice choice)
        {
            if (CallInFlight || _panelSlotIndex == null || _panelRecipe?.MaxBatchCycles == null) return;
            _panelChoice = choice;
            RefreshLaunchPanel();
        }

        private void OnCancelClicked()
        {
            if (CallInFlight) return;
            ClosePanel();
        }

        private void ClosePanel()
        {
            _panelSlotIndex = null;
            _panelRecipe    = null;
            _panelChoice    = CyclesChoice.None;
            RenderSlots();
            RefreshLaunchPanel();
        }

        /// <summary>
        /// Recalcule le panneau depuis le store : visibilité (fermé si son slot n'est plus libre), Max, état des
        /// boutons (1a-1c ; tous inactifs pendant un appel), aperçu et saturation (affichage seulement).
        /// </summary>
        private void RefreshLaunchPanel()
        {
            if (_launchPanel == null) return;

            var building = _store?.Building;
            if (_panelSlotIndex == null || building == null || !IsSlotFree(building, _panelSlotIndex.Value))
            {
                var wasOpen = _panelSlotIndex != null;
                _panelSlotIndex = null;
                _panelRecipe    = null;
                _panelChoice    = CyclesChoice.None;
                _launchPanel.style.display = DisplayStyle.None;
                if (wasOpen) RenderSlots();   // retire la mise en évidence du slot
                return;
            }

            _launchPanel.style.display = DisplayStyle.Flex;

            var inventory = _store.HasState ? _store.Inventory : null;
            var isBatch   = _panelRecipe?.MaxBatchCycles != null;
            var max       = isBatch ? ProductionLaunchPlanner.ComputeMaxCycles(_panelRecipe, inventory) : 0;
            _panelChoice  = isBatch ? ProductionLaunchPlanner.NormalizeChoice(_panelChoice, max) : CyclesChoice.None;

            var buttons = ProductionLaunchPlanner.ComputeButtons(_panelRecipe, _panelChoice, max, CallInFlight);
            _recipeLogsButton?.SetEnabled(buttons.Recipes);
            _recipePlanksButton?.SetEnabled(buttons.Recipes);
            _recipeKitsButton?.SetEnabled(buttons.Recipes);
            _cyclesOneButton?.SetEnabled(buttons.One);
            _cyclesTenButton?.SetEnabled(buttons.Ten);
            _cyclesMaxButton?.SetEnabled(buttons.Max);
            _launchButton?.SetEnabled(buttons.Launch);
            _cancelButton?.SetEnabled(buttons.Cancel);

            SetSelected(_recipeLogsButton,   _panelRecipe?.RecipeId == ProductionRecipes.LogsId);
            SetSelected(_recipePlanksButton, _panelRecipe?.RecipeId == ProductionRecipes.PlanksId);
            SetSelected(_recipeKitsButton,   _panelRecipe?.RecipeId == ProductionRecipes.ReconstructionKitsId);
            SetSelected(_cyclesOneButton,    _panelChoice == CyclesChoice.One);
            SetSelected(_cyclesTenButton,    _panelChoice == CyclesChoice.Ten);
            SetSelected(_cyclesMaxButton,    _panelChoice == CyclesChoice.Max);

            if (_cyclesRow != null)
                _cyclesRow.style.display = isBatch ? DisplayStyle.Flex : DisplayStyle.None;

            // 1a : aperçu (et avertissement) seulement une fois N choisi ; logs : ni aperçu ni avertissement.
            var cycles = isBatch ? ProductionLaunchPlanner.SelectedCycles(_panelChoice, max) : null;
            if (_previewLabel != null)
            {
                _previewLabel.style.display = cycles.HasValue ? DisplayStyle.Flex : DisplayStyle.None;
                _previewLabel.text = cycles.HasValue ? ProductionLaunchPlanner.FormatPreview(_panelRecipe, cycles.Value) : string.Empty;
            }
            if (_saturationLabel != null)
            {
                var risk = cycles.HasValue && ProductionLaunchPlanner.IsSaturationRisk(
                    _panelRecipe, cycles.Value, building.Slots, _panelSlotIndex.Value, inventory);
                _saturationLabel.style.display = risk ? DisplayStyle.Flex : DisplayStyle.None;
            }
        }

        private static bool IsSlotFree(BuildingSnapshot building, int slotIndex)
        {
            foreach (var slot in building.Slots)
                if (slot.SlotIndex == slotIndex) return slot.RecipeId == null;
            return false;
        }

        // ── Production handler ────────────────────────────────────────────────

        private void OnLaunchClicked()
        {
            if (CallInFlight || _panelSlotIndex == null || _panelRecipe == null) return;

            var building = _store?.Building;
            if (building == null) return;

            // Intention du joueur : N choisi (Max compris), rien d'autre (1e). Logs : pas de N (1b).
            int? cycles = null;
            if (_panelRecipe.MaxBatchCycles != null)
            {
                var inventory = _store.HasState ? _store.Inventory : null;
                var max = ProductionLaunchPlanner.ComputeMaxCycles(_panelRecipe, inventory);
                cycles = ProductionLaunchPlanner.SelectedCycles(_panelChoice, max);
                if (cycles == null) return;   // aucun N choisi → « Lancer » inactif (1a)
            }

            if (!ServiceLocator.TryResolve<IProductionService>(out var productionService))
            {
                GELogger.Error("ProductionScreen", "IProductionService non enregistré.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            var slotIndex = _panelSlotIndex.Value;
            var recipeId  = _panelRecipe.RecipeId;

            // Clé ancrée sur le bâtiment du store (référence remplacée à chaque réponse serveur) ; libellé = contenu
            // complet de la requête. Intentions formées sur un autre état : purgées.
            var intent = ProductionLaunchPlanner.BuildStartIntent(building.Id, slotIndex, recipeId, cycles);
            PendingIntents.PurgeStale(building);
            var key = PendingIntents.GetOrCreate(intent, building);

            // Appel sérialisé : état « appel en cours » posé dans le store (boutons inactifs via Changed).
            var store = _store;
            if (!store.TryBeginServerCall(out var requestNumber)) return;
            _ = ProduceSlotAsync(productionService, store, requestNumber, building.Id, slotIndex, recipeId, cycles,
                                 intent, key, _cts.Token);
        }

        private async Task ProduceSlotAsync(
            IProductionService productionService, PlayerEconomyStateStore store, long requestNumber,
            string buildingId, int slotIndex, string recipeId, int? cycles, string intent, string key,
            CancellationToken ct)
        {
            try
            {
                var result = await productionService.StartProductionSlotAsync(
                    buildingId, slotIndex, recipeId, cycles, key, ct);

                // Réponse parsée avec succès (rejeu compris) : l'intention est close, même si le store l'écarte.
                PendingIntents.Resolve(intent, key);

                // Bâtiment et inventaire de la réponse proposés au store avant le contrôle d'annulation (C9).
                if (!ProductionStoreWriter.ApplyProductionState(
                        store, requestNumber, result.Building, result.Inventory, ct)) return;

                SetStatus("Production démarrée.", "status--success");
            }
            catch (OperationCanceledException) { }
            catch (ProductionServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur production: {ex.UserMessage}");
                if (ct.IsCancellationRequested) return;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
            finally
            {
                // L'appel est revenu (réponse ou erreur) : état levé, quel que soit l'écran (jamais sur la seule
                // annulation de l'écran) ; Changed remet les boutons dans leur état calculé (1a-1c).
                store.EndServerCall(requestNumber);
            }
        }

        // ── Market navigation ─────────────────────────────────────────────────

        private void OnMarketClicked()
        {
            if (_marketScreenPrefab == null)
            {
                GELogger.Warning("ProductionScreen", "Prefab MarketScreen non assigné.");
                return;
            }

            if (!ServiceLocator.TryResolve<ScreenManager>(out var screenManager))
            {
                GELogger.Warning("ProductionScreen", "ScreenManager non résolvable.");
                return;
            }

            var instance = Instantiate(_marketScreenPrefab);
            screenManager.Push(instance);
        }

        // ── Collect handler ───────────────────────────────────────────────────

        private void OnCollectClicked()
        {
            if (CallInFlight) return;

            var building = _store?.Building;
            if (!ServiceLocator.TryResolve<IProductionService>(out var productionService) || building == null)
            {
                GELogger.Error("ProductionScreen", "IProductionService non enregistré ou bâtiment absent du store.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            // Appel sérialisé : état « appel en cours » posé dans le store (boutons inactifs via Changed).
            var store = _store;
            if (!store.TryBeginServerCall(out var requestNumber)) return;
            _ = CollectAsync(productionService, store, requestNumber, building.Id, _cts.Token);
        }

        private async Task CollectAsync(
            IProductionService productionService, PlayerEconomyStateStore store, long requestNumber, string buildingId,
            CancellationToken ct)
        {
            try
            {
                var result = await productionService.CollectProductionAsync(buildingId, ct);

                // Bâtiment et inventaire de la réponse proposés au store avant le contrôle d'annulation (C9).
                if (!ProductionStoreWriter.ApplyProductionState(
                        store, requestNumber, result.Building, result.Inventory, ct)) return;

                SetStatus(FormatCollectMessage(result), "status--success");
            }
            catch (OperationCanceledException) { }
            catch (ProductionServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur collecte: {ex.UserMessage}");
                if (ct.IsCancellationRequested) return;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
            finally
            {
                // L'appel est revenu (réponse ou erreur) : état levé, quel que soit l'écran (jamais sur la seule
                // annulation de l'écran).
                store.EndServerCall(requestNumber);
            }
        }

        // ── Helpers UI ────────────────────────────────────────────────────────

        /// <summary>Affiche gold + inventaire depuis le store (valeurs serveur, aucun calcul local).</summary>
        private void RenderEconomy()
        {
            if (_economyLabel == null) return;

            if (_store == null || !_store.HasState || _store.Inventory == null)
            {
                _economyLabel.text = "Or : —";
                return;
            }

            var inv = _store.Inventory;
            _economyLabel.text =
                $"Or : {_store.Gold}  ·  Logs {inv.Logs.Quantity}/{inv.Logs.Cap}  ·  " +
                $"Planks {inv.Planks.Quantity}/{inv.Planks.Cap}  ·  " +
                $"Kits {inv.ReconstructionKits.Quantity}/{inv.ReconstructionKits.Cap}";
        }

        private void SetStatus(string text, string modifier)
        {
            if (_statusLabel == null) return;
            _statusLabel.text = text;
            _statusLabel.RemoveFromClassList("status--loading");
            _statusLabel.RemoveFromClassList("status--error");
            _statusLabel.RemoveFromClassList("status--success");
            _statusLabel.AddToClassList(modifier);
        }

        // Maintenance (data-loss, D-ETAPE19-010) : texte du founder (Q5) affiché tel quel, sans préfixe.
        private static string FormatError(string userMessage, bool isMaintenance) =>
            isMaintenance ? userMessage : $"Erreur : {userMessage}";

        /// <summary>
        /// Un appel qui écrit bâtiment et inventaire est en cours, lancé par cet écran ou un précédent (store).
        /// </summary>
        private bool CallInFlight => _store != null && _store.CallInFlight;

        /// <summary>
        /// Règle existante, étendue au panneau et à l'appel en cours de tout écran : slots et « Collecter » suivent
        /// <paramref name="enabled"/> (appelée avec !CallInFlight à chaque Changed) ; les boutons du panneau sont
        /// inactifs pendant un appel, puis reprennent leur état calculé (1a-1c), jamais une réactivation en bloc.
        /// « Marché » n'est pas touché.
        /// </summary>
        private void SetAllButtonsEnabled(bool enabled)
        {
            foreach (var btn in _slotButtons)
                btn.SetEnabled(enabled);
            _collectButton?.SetEnabled(enabled);
            RefreshLaunchPanel();
        }

        private static void SetText(Button button, string text)
        {
            if (button != null) button.text = text;
        }

        private static void SetSelected(VisualElement element, bool selected) =>
            element?.EnableInClassList("launch-choice-btn--selected", selected);

        private static string FormatCollectMessage(CollectProductionResult result)
        {
            if (result.Collected.Count == 0 && result.Discarded.Count == 0)
                return "Rien à récolter pour l'instant.";

            var parts = new List<string>();
            foreach (var kv in result.Collected)
                parts.Add($"{kv.Value} {kv.Key}");
            var msg = "Récolté : " + string.Join(", ", parts);

            if (result.Discarded.Count > 0)
            {
                var lostParts = new List<string>();
                foreach (var kv in result.Discarded)
                    lostParts.Add($"{kv.Value} {kv.Key}");
                msg += " — perdu (cap plein) : " + string.Join(", ", lostParts);
            }
            return msg;
        }
    }
}
