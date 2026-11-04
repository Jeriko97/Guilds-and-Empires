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
    /// Sur un slot actif (19.4c-2) : recette réelle ; pour planks et kits, « lot k/N » et temps restant estimés,
    /// rafraîchis ~1 s, puis « Lot terminé — collecter » ; « Arrêter » ouvre une confirmation sans chiffres, puis le
    /// résumé tiré de la réponse du serveur (D-ETAPE19-010 Q4). Une seule confirmation ou un seul panneau ouvert.
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
    ///   Annotation (19.4c-2, D-ETAPE19-013) : l'estimation du slot actif (ProductionSlotProgress) est recalculée à
    ///   chaque tick depuis le SlotSnapshot du store, jamais un compteur local ; écoulé ancré sur l'heure de l'appareil
    ///   et Time.realtimeSinceStartup, ancre relevée à chaque notification du store (réponse reçue comprise) ; aucune
    ///   valeur estimée dans le store ni dans une requête ; « Arrêter » et « Collecter » ne dépendent pas de
    ///   l'estimation ; tick créé en OnEnable, arrêté en OnDisable, sans chaîne allouée quand la valeur affichée ne
    ///   change pas.
    /// - État métier : le PlayerEconomyStateStore seul (doctrine C7), bâtiment compris ; l'écran n'en garde aucune
    ///   copie. Chaque réponse serveur est proposée au store AVANT le contrôle d'annulation ; seules les écritures
    ///   d'UI sont abandonnées après annulation (C9). Un écran recréé affiche le bâtiment du store sans relancer
    ///   resolveLoginState.
    /// - Sérialisation (bloquants de revue 19.4c-1) : un seul appel qui écrit bâtiment et inventaire (chargement,
    ///   lancement, collecte, arrêt) à la fois, tous écrans confondus ; l'état « appel en cours » vit dans le store, posé à
    ///   l'envoi, levé quand l'appel revient (réponse ou erreur), jamais par l'annulation de l'écran. Un écran recréé
    ///   pendant un appel garde ses boutons d'action inactifs jusqu'à la fin de l'appel, puis se met à jour depuis le
    ///   store (Changed). Filet : le store écarte une réponse dont le numéro d'envoi n'est pas le plus grand.
    /// - Cycle de vie symétrique : CTS créé en OnEnable, annulé+disposé en OnDisable ; abonnements (boutons
    ///   persistants, store.Changed) en OnEnable, retirés en OnDisable. Doctrine C9.
    /// - IPlayerService et IProductionService résolus via ServiceLocator. Doctrine C3.
    /// - INTERDIT de rappeler resolveLoginState après startProductionSlot (réponse contient building).
    /// - Maintenance (19.4d, D-ETAPE19-010 Q1 et Q5) : une réponse data-loss (connexion, lancement, collecte, arrêt)
    ///   pose l'état de maintenance dans le store, avant le contrôle d'annulation, comme une réponse ; seule une
    ///   connexion réussie le lève. En maintenance, rendu depuis le store à chaque OnEnable et Changed : panneau (texte
    ///   Q5 et « Réessayer ») à la place de la liste des slots ; panneau de lancement et confirmation d'arrêt fermés ;
    ///   toutes les actions de l'écran bloquées, « Marché » compris (en maintenance seulement : pendant un appel hors
    ///   maintenance, « Marché » reste possible — arbitrage du 2026-11-04, (2a)) ; ligne d'état vidée ; aucun appel
    ///   sans action du joueur (ProductionLoadDecision) ; « Réessayer » relance la connexion, appel sérialisé, inactif
    ///   pendant tout appel en cours. Un data-loss reçu pendant que le marché est ouvert est lu au retour, sans nouvel
    ///   appel (TD-035 : le marché ne lit pas cet état).
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

        // Confirmation d'arrêt (persistante, UXML ; 19.4c-2).
        private VisualElement _stopConfirmPanel;
        private Label         _stopConfirmLabel;
        private Button        _stopConfirmButton;
        private Button        _stopCancelButton;

        // Panneau de maintenance (persistant, UXML ; 19.4d).
        private VisualElement _maintenancePanel;
        private Label         _maintenanceLabel;
        private Button        _retryButton;
        private bool          _maintenanceShown;   // panneau affiché au dernier rendu (UI seulement)

        // ── State (UI seulement : aucune valeur métier) ───────────────────────
        private PlayerEconomyStateStore _store;
        private readonly List<Button>   _slotButtons = new();   // « Produire » et « Arrêter » des slots
        private bool                    _awaitingLoad;     // « Chargement… » affiché : chargement attendu
        private int?                    _panelSlotIndex;   // null = panneau fermé
        private RecipeInfo              _panelRecipe;
        private CyclesChoice            _panelChoice;
        private int?                    _confirmSlotIndex; // null = confirmation d'arrêt fermée

        // Tick d'affichage du slot actif (~1 s, 19.4c-2) : créé en OnEnable, arrêté en OnDisable (C9).
        private const long TickIntervalMs = 1000;
        private IVisualElementScheduledItem    _tick;
        private readonly List<SlotProgressView> _progressViews = new();

        // Ancre de l'écoulé (affichage seulement, jamais écrite dans le store) : heure UTC de l'appareil et horloge
        // monotone, relevées en OnEnable, à chaque notification du store et au retour au premier plan.
        private long   _anchorWallClockMs;
        private double _anchorRealtime;

        /// <summary>
        /// Libellés « lot k/N » et temps restant d'un slot actif. Slot et recette : références du store et de la copie
        /// des recettes (aucune valeur recopiée) ; derniers k et minutes affichés : seulement pour ne réécrire un texte
        /// que si la valeur affichée change (pas de chaîne allouée par tick).
        /// </summary>
        private sealed class SlotProgressView
        {
            public SlotSnapshot Slot;
            public RecipeInfo   Recipe;
            public Label        Batch;
            public Label        Remaining;
            public int          ShownCycle   = int.MinValue;
            public long         ShownMinutes = long.MinValue;
        }

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
            BindStopConfirm(root);
            BindMaintenancePanel(root);

            // Panneau et confirmation fermés. L'état « appel en cours » n'est PAS remis à zéro : il vit dans le store et
            // n'est levé que par le retour de l'appel ; une tâche d'une génération précédente ne touche plus l'UI de cet
            // écran (C9).
            _panelSlotIndex   = null;
            _panelRecipe      = null;
            _panelChoice      = CyclesChoice.None;
            _confirmSlotIndex = null;

            AnchorElapsed();
            _tick = root.schedule.Execute(OnTick).Every(TickIntervalMs);

            ServiceLocator.TryResolve(out _store);
            if (_store != null)
                _store.Changed += OnStoreChanged;

            // Relu à chaque OnEnable : reflète les ventes faites sur MarketScreen au retour de Pop.
            RenderEconomy();

            // Décision lue du store seul (ProductionLoadDecision) : en maintenance, panneau et aucun appel serveur.
            var step = ProductionLoadDecision.OnEnable(_store);
            _awaitingLoad = step == ProductionLoadStep.Load || step == ProductionLoadStep.Wait;
            RenderSlots();
            SetAllButtonsEnabled(!ActionsBlocked);   // rafraîchit aussi le panneau de lancement et la confirmation

            switch (step)
            {
                case ProductionLoadStep.Load:
                    SetStatus("Chargement…", "status--loading");
                    _ = LoadAsync(_cts.Token);
                    break;
                case ProductionLoadStep.Wait:
                    // Un appel déjà en cours (lancé par un écran précédent) : on attend sa fin (OnStoreChanged).
                    SetStatus("Chargement…", "status--loading");
                    break;
                case ProductionLoadStep.Maintenance:
                    ClearStatus();
                    break;
                default:
                    SetStatus("Prêt.", "status--success");
                    break;
            }
        }

        private void OnDisable()
        {
            _tick?.Pause();
            _tick = null;
            _progressViews.Clear();

            if (_collectButton != null)
                _collectButton.clicked -= OnCollectClicked;
            if (_marketButton != null)
                _marketButton.clicked -= OnMarketClicked;
            UnbindLaunchPanel();
            UnbindStopConfirm();
            UnbindMaintenancePanel();
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
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            catch (PlayerServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur PlayerService: {ex.UserMessage}");
                if (ex.IsMaintenance)
                {
                    ApplyMaintenance(store, requestNumber, ct);
                    return;
                }
                if (ct.IsCancellationRequested) return;
                _awaitingLoad = false;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue au chargement: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                _awaitingLoad = false;
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
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
        /// Slot actif (19.4c-2) : nouvelle ancre de l'écoulé, puis rendu depuis le bâtiment du store (l'affichage repart
        /// de la dernière réponse) ; confirmation d'arrêt fermée si son slot n'est plus actif.
        /// Maintenance (19.4d) : panneau rendu depuis le store ; à la fin de l'appel attendu, ligne d'état vidée et aucun
        /// nouvel appel (ProductionLoadDecision).
        /// </summary>
        private void OnStoreChanged()
        {
            // Entrée en maintenance (lue avant le rendu, qui met à jour _maintenanceShown) : ligne d'état vidée, quel que
            // soit l'écran ou le jeton qui a lancé l'appel revenu data-loss (relecture du diff de 19.4d).
            var entersMaintenance = ProductionLoadDecision.EntersMaintenance(_maintenanceShown, _store);

            AnchorElapsed();
            RenderEconomy();
            RenderSlots();
            SetAllButtonsEnabled(!ActionsBlocked);
            if (entersMaintenance) ClearStatus();

            if (_store == null || _cts == null) return;
            switch (ProductionLoadDecision.AfterStoreChanged(_store, _awaitingLoad))
            {
                case ProductionLoadStep.Ready:
                    _awaitingLoad = false;
                    SetStatus("Prêt.", "status--success");
                    break;
                case ProductionLoadStep.Maintenance:
                    _awaitingLoad = false;
                    ClearStatus();
                    break;
                case ProductionLoadStep.Load:
                    _ = LoadAsync(_cts.Token);
                    break;
            }
        }

        // ── Slot rendering ────────────────────────────────────────────────────

        private void RenderSlots()
        {
            _slotsContainer.Clear();
            _slotButtons.Clear();
            _progressViews.Clear();

            // Maintenance (19.4d) : panneau à la place de la liste des slots ; aucun slot, aucune vue de progression.
            var maintenance = IsMaintenance;
            RenderMaintenancePanel(maintenance);

            var building = _store?.Building;
            if (building == null || maintenance)
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
                if (_panelSlotIndex == slot.SlotIndex || _confirmSlotIndex == slot.SlotIndex)
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

                    // Planks et kits aux compteurs cohérents : « lot k/N » et temps restant estimés (affichage
                    // seulement). Sinon (logs, compteurs incohérents, recette inconnue) : libellé de recette seul.
                    var recipe = ProductionRecipes.Find(slot.RecipeId);
                    if (ProductionSlotProgress.TryEstimate(slot, recipe, 0L, out _))
                    {
                        var view = new SlotProgressView
                        {
                            Slot      = slot,
                            Recipe    = recipe,
                            Batch     = new Label { name = $"slot-batch-{slot.SlotIndex}" },
                            Remaining = new Label { name = $"slot-remaining-{slot.SlotIndex}" },
                        };
                        view.Batch.AddToClassList("slot-batch-label");
                        view.Remaining.AddToClassList("slot-remaining-label");
                        card.Add(view.Batch);
                        card.Add(view.Remaining);
                        _progressViews.Add(view);
                        UpdateProgressView(view);
                    }

                    // « Arrêter » sur tout slot actif, logs compris (le serveur ne refuse que le slot libre).
                    var capturedIndex = slot.SlotIndex;
                    var stopBtn = new Button(() => OnStopClicked(capturedIndex));
                    stopBtn.name = $"stop-slot-{slot.SlotIndex}";
                    stopBtn.text = PlayerMessages.StopButton;
                    stopBtn.AddToClassList("slot-stop-btn");
                    stopBtn.SetEnabled(!CallInFlight);
                    card.Add(stopBtn);
                    _slotButtons.Add(stopBtn);
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

        /// <summary>
        /// « Produire » sur un slot libre : panneau ouvert sur ce slot, recette et N remis à zéro (aucune requête) ;
        /// confirmation d'arrêt fermée (un seul panneau ou une seule confirmation à la fois).
        /// </summary>
        private void OnProduceClicked(int slotIndex)
        {
            if (ActionsBlocked) return;
            _confirmSlotIndex = null;
            _panelSlotIndex   = slotIndex;
            _panelRecipe      = null;
            _panelChoice      = CyclesChoice.None;
            RenderSlots();
            RefreshLaunchPanel();
            RefreshStopConfirm();
        }

        private void OnRecipeLogsClicked()   => SelectRecipe(ProductionRecipes.LogsId);
        private void OnRecipePlanksClicked() => SelectRecipe(ProductionRecipes.PlanksId);
        private void OnRecipeKitsClicked()   => SelectRecipe(ProductionRecipes.ReconstructionKitsId);

        private void SelectRecipe(string recipeId)
        {
            if (ActionsBlocked || _panelSlotIndex == null) return;
            _panelRecipe = ProductionRecipes.Find(recipeId);
            _panelChoice = CyclesChoice.None;   // 1a : aucun N présélectionné
            RefreshLaunchPanel();
        }

        private void OnCyclesOneClicked() => SelectCycles(CyclesChoice.One);
        private void OnCyclesTenClicked() => SelectCycles(CyclesChoice.Ten);
        private void OnCyclesMaxClicked() => SelectCycles(CyclesChoice.Max);

        private void SelectCycles(CyclesChoice choice)
        {
            if (ActionsBlocked || _panelSlotIndex == null || _panelRecipe?.MaxBatchCycles == null) return;
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
            if (_panelSlotIndex == null || building == null || IsMaintenance ||
                !IsSlotFree(building, _panelSlotIndex.Value))
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
            if (ActionsBlocked || _panelSlotIndex == null || _panelRecipe == null) return;

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
            catch (OperationCanceledException)
            {
                // Annulation par l'écran : rien à afficher (C9). Annulation venue du SDK, jeton intact : traitée en
                // erreur, comme LoadAsync.
                if (ct.IsCancellationRequested) return;
                GELogger.Warning("ProductionScreen", "Lancement annulé hors annulation de l'écran.");
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            catch (ProductionServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur production: {ex.UserMessage}");
                if (ex.IsMaintenance)
                {
                    ApplyMaintenance(store, requestNumber, ct);
                    return;
                }
                if (ct.IsCancellationRequested) return;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            finally
            {
                // L'appel est revenu (réponse ou erreur) : état levé, quel que soit l'écran (jamais sur la seule
                // annulation de l'écran) ; Changed remet les boutons dans leur état calculé (1a-1c).
                store.EndServerCall(requestNumber);
            }
        }

        // ── Market navigation ─────────────────────────────────────────────────

        /// <summary>
        /// Navigation vers le marché : refusée en maintenance seulement (arbitrage du 2026-11-04, (2a)) ; pendant un
        /// appel hors maintenance, inchangée (D-ETAPE19-014).
        /// </summary>
        private void OnMarketClicked()
        {
            if (IsMaintenance) return;

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
            if (ActionsBlocked) return;

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

                // Résumé tiré de la réponse : lignes à zéro masquées, « stock plein » (texte 8, 19.4c-2).
                SetStatus(ProductionSlotProgress.BuildCollectSummary(result), "status--success");
            }
            catch (OperationCanceledException)
            {
                // Annulation par l'écran : rien à afficher (C9). Annulation venue du SDK, jeton intact : traitée en
                // erreur, comme LoadAsync.
                if (ct.IsCancellationRequested) return;
                GELogger.Warning("ProductionScreen", "Collecte annulée hors annulation de l'écran.");
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            catch (ProductionServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur collecte: {ex.UserMessage}");
                if (ex.IsMaintenance)
                {
                    ApplyMaintenance(store, requestNumber, ct);
                    return;
                }
                if (ct.IsCancellationRequested) return;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            finally
            {
                // L'appel est revenu (réponse ou erreur) : état levé, quel que soit l'écran (jamais sur la seule
                // annulation de l'écran).
                store.EndServerCall(requestNumber);
            }
        }

        // ── Stop handler (19.4c-2) ────────────────────────────────────────────

        private void BindStopConfirm(VisualElement root)
        {
            _stopConfirmPanel  = root.Q<VisualElement>("stop-confirm-panel");
            _stopConfirmLabel  = root.Q<Label>("stop-confirm-label");
            _stopConfirmButton = root.Q<Button>("stop-confirm-button");
            _stopCancelButton  = root.Q<Button>("stop-cancel-button");

            if (_stopConfirmLabel != null) _stopConfirmLabel.text = PlayerMessages.StopConfirmation;
            SetText(_stopConfirmButton, PlayerMessages.StopButton);
            SetText(_stopCancelButton,  PlayerMessages.CancelButton);

            if (_stopConfirmButton != null) _stopConfirmButton.clicked += OnStopConfirmClicked;
            if (_stopCancelButton  != null) _stopCancelButton.clicked  += OnStopCancelClicked;
        }

        private void UnbindStopConfirm()
        {
            if (_stopConfirmButton != null) _stopConfirmButton.clicked -= OnStopConfirmClicked;
            if (_stopCancelButton  != null) _stopCancelButton.clicked  -= OnStopCancelClicked;
        }

        /// <summary>
        /// « Arrêter » sur un slot actif : confirmation ouverte sur ce slot (aucune requête) ; panneau de lancement fermé
        /// (un seul à la fois). Indépendant de l'estimation : seuls le store et l'appel en cours comptent.
        /// </summary>
        private void OnStopClicked(int slotIndex)
        {
            if (ActionsBlocked) return;
            var building = _store?.Building;
            if (building == null || !IsSlotActive(building, slotIndex)) return;

            _panelSlotIndex   = null;
            _panelRecipe      = null;
            _panelChoice      = CyclesChoice.None;
            _confirmSlotIndex = slotIndex;
            RenderSlots();
            RefreshLaunchPanel();
            RefreshStopConfirm();
        }

        /// <summary>« Annuler » : confirmation fermée, aucune requête.</summary>
        private void OnStopCancelClicked()
        {
            if (CallInFlight) return;
            _confirmSlotIndex = null;
            RenderSlots();
            RefreshStopConfirm();
        }

        /// <summary>
        /// Recalcule la confirmation depuis le store : fermée si son slot n'est plus actif (collecte, autre réponse) ;
        /// boutons inactifs pendant un appel (règle existante).
        /// </summary>
        private void RefreshStopConfirm()
        {
            if (_stopConfirmPanel == null) return;

            var building = _store?.Building;
            if (_confirmSlotIndex == null || building == null || IsMaintenance ||
                !IsSlotActive(building, _confirmSlotIndex.Value))
            {
                var wasOpen = _confirmSlotIndex != null;
                _confirmSlotIndex = null;
                _stopConfirmPanel.style.display = DisplayStyle.None;
                if (wasOpen) RenderSlots();   // retire la mise en évidence du slot
                return;
            }

            _stopConfirmPanel.style.display = DisplayStyle.Flex;
            _stopConfirmButton?.SetEnabled(!CallInFlight);
            _stopCancelButton?.SetEnabled(!CallInFlight);
        }

        /// <summary>
        /// Confirmation de l'arrêt : requête avec une clé d'idempotence ancrée sur le bâtiment du store (même patron que
        /// le lancement, D-ETAPE19-003) ; appel sérialisé (règle d'appel en cours existante).
        /// </summary>
        private void OnStopConfirmClicked()
        {
            if (ActionsBlocked || _confirmSlotIndex == null) return;

            var slotIndex = _confirmSlotIndex.Value;
            var building  = _store?.Building;
            if (building == null || !IsSlotActive(building, slotIndex))
            {
                RefreshStopConfirm();
                return;
            }

            if (!ServiceLocator.TryResolve<IProductionService>(out var productionService))
            {
                GELogger.Error("ProductionScreen", "IProductionService non enregistré.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            // Clé ancrée sur le bâtiment du store ; libellé = contenu complet de la requête. Intentions formées sur un
            // autre état : purgées.
            var intent = ProductionSlotProgress.BuildStopIntent(building.Id, slotIndex);
            PendingIntents.PurgeStale(building);
            var key = PendingIntents.GetOrCreate(intent, building);

            // Confirmation fermée à l'envoi ; appel sérialisé : état « appel en cours » posé dans le store (boutons
            // inactifs, rendu via Changed).
            _confirmSlotIndex = null;
            var store = _store;
            if (!store.TryBeginServerCall(out var requestNumber))
            {
                RenderSlots();
                RefreshStopConfirm();
                return;
            }
            _ = StopSlotAsync(productionService, store, requestNumber, building.Id, slotIndex, intent, key, _cts.Token);
        }

        private async Task StopSlotAsync(
            IProductionService productionService, PlayerEconomyStateStore store, long requestNumber,
            string buildingId, int slotIndex, string intent, string key, CancellationToken ct)
        {
            try
            {
                var result = await productionService.StopProductionSlotAsync(buildingId, slotIndex, key, ct);

                // Réponse parsée avec succès (rejeu compris) : l'intention est close, même si le store l'écarte.
                PendingIntents.Resolve(intent, key);

                // Bâtiment et inventaire de la réponse proposés au store avant le contrôle d'annulation (C9).
                if (!ProductionStoreWriter.ApplyProductionState(
                        store, requestNumber, result.Building, result.Inventory, ct)) return;

                // Résumé tiré de la réponse (Q4) : rejeu → « Arrêt déjà enregistré » ; lignes à zéro masquées ; tout
                // vide → texte d'état vidé (le slot libéré est le retour visible).
                SetStatus(ProductionSlotProgress.BuildStopSummary(result), "status--success");
            }
            catch (OperationCanceledException)
            {
                // Annulation par l'écran : rien à afficher (C9). Annulation venue du SDK, jeton intact : traitée en
                // erreur, comme LoadAsync.
                if (ct.IsCancellationRequested) return;
                GELogger.Warning("ProductionScreen", "Arrêt annulé hors annulation de l'écran.");
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            catch (ProductionServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur arrêt: {ex.UserMessage}");
                if (ex.IsMaintenance)
                {
                    ApplyMaintenance(store, requestNumber, ct);
                    return;
                }
                if (ct.IsCancellationRequested) return;
                SetStatus(FormatError(ex.UserMessage, ex.IsMaintenance), "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue: {ex.Message}");
                if (ct.IsCancellationRequested) return;
                SetStatus(PlayerMessages.UnexpectedError, "status--error");
            }
            finally
            {
                // L'appel est revenu (réponse ou erreur) : état levé, quel que soit l'écran (jamais sur la seule
                // annulation de l'écran).
                store.EndServerCall(requestNumber);
            }
        }

        private static bool IsSlotActive(BuildingSnapshot building, int slotIndex)
        {
            foreach (var slot in building.Slots)
                if (slot.SlotIndex == slotIndex) return slot.RecipeId != null;
            return false;
        }

        // ── Slot actif : tick d'affichage (19.4c-2, affichage seulement) ─────

        /// <summary>
        /// Relève l'ancre de l'écoulé (heure UTC de l'appareil, horloge monotone). Sans nouvelle réponse, ne change pas
        /// l'écoulé (sauf changement d'heure de l'appareil entre-temps) : reprend seulement l'horloge murale.
        /// </summary>
        private void AnchorElapsed()
        {
            _anchorWallClockMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _anchorRealtime    = Time.realtimeSinceStartupAsDouble;
        }

        /// <summary>
        /// Tick (~1 s) : estimation recalculée depuis le SlotSnapshot du store pour chaque slot affiché ; seuls des
        /// entiers sont calculés, un texte n'est réécrit que si la valeur affichée change.
        /// </summary>
        private void OnTick()
        {
            for (var i = 0; i < _progressViews.Count; i++)
                UpdateProgressView(_progressViews[i]);
        }

        private void UpdateProgressView(SlotProgressView view)
        {
            var monotonicMs = (long)((Time.realtimeSinceStartupAsDouble - _anchorRealtime) * 1000.0);
            var elapsedMs   = ProductionSlotProgress.ElapsedMs(
                ProductionSlotProgress.ReferenceMs(view.Slot), _anchorWallClockMs, monotonicMs);
            if (!ProductionSlotProgress.TryEstimate(view.Slot, view.Recipe, elapsedMs, out var estimate)) return;

            // « lot k/N », ou « Lot terminé — collecter » quand k = N (restant = 0).
            if (estimate.Cycle != view.ShownCycle)
            {
                view.ShownCycle = estimate.Cycle;
                view.Batch.text = estimate.IsFinished
                    ? PlayerMessages.BatchFinished
                    : ProductionSlotProgress.FormatBatch(estimate.Cycle, estimate.Planned);
            }

            // Temps restant, seulement s'il est strictement positif (minutes tronquées ; −1 = lot estimé fini).
            var minutes = ProductionSlotProgress.DisplayedMinutes(estimate.RemainingMs);
            if (minutes != view.ShownMinutes)
            {
                view.ShownMinutes = minutes;
                if (minutes < 0)
                {
                    view.Remaining.style.display = DisplayStyle.None;
                }
                else
                {
                    view.Remaining.text          = ProductionSlotProgress.FormatRemaining(estimate.RemainingMs);
                    view.Remaining.style.display = DisplayStyle.Flex;
                }
            }
        }

        /// <summary>
        /// Retour au premier plan : nouvelle ancre et rendu immédiat, seulement si l'écran est actif (tick et jeton
        /// d'annulation en cours, symétrie C9).
        /// </summary>
        private void OnApplicationPause(bool paused)
        {
            if (!paused) ReanchorIfActive();
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (hasFocus) ReanchorIfActive();
        }

        private void ReanchorIfActive()
        {
            if (_tick == null || _cts == null) return;
            AnchorElapsed();
            OnTick();
        }

        // ── Maintenance (19.4d, D-ETAPE19-010 Q5) ─────────────────────────────

        private void BindMaintenancePanel(VisualElement root)
        {
            _maintenancePanel = root.Q<VisualElement>("maintenance-panel");
            _maintenanceLabel = root.Q<Label>("maintenance-label");
            _retryButton      = root.Q<Button>("retry-button");

            if (_maintenanceLabel != null) _maintenanceLabel.text = PlayerMessages.Maintenance;
            SetText(_retryButton, PlayerMessages.RetryButton);

            if (_retryButton != null) _retryButton.clicked += OnRetryClicked;
        }

        private void UnbindMaintenancePanel()
        {
            if (_retryButton != null) _retryButton.clicked -= OnRetryClicked;
        }

        /// <summary>
        /// Panneau de maintenance à la place de la liste des slots (rendu depuis le store) ; « Réessayer » inactif
        /// pendant tout appel en cours.
        /// </summary>
        private void RenderMaintenancePanel(bool maintenance)
        {
            _maintenanceShown = maintenance;
            if (_maintenancePanel != null)
                _maintenancePanel.style.display = maintenance ? DisplayStyle.Flex : DisplayStyle.None;
            if (_slotsContainer != null)
                _slotsContainer.style.display = maintenance ? DisplayStyle.None : DisplayStyle.Flex;
            _retryButton?.SetEnabled(!CallInFlight);
        }

        /// <summary>
        /// Réponse data-loss d'un appel sérialisé : état de maintenance proposé au store AVANT le contrôle d'annulation
        /// (le panneau suit via Changed, sur cet écran ou le suivant, et l'entrée en maintenance vide la ligne d'état) ;
        /// puis, si l'écran est encore actif et le store effectivement en maintenance, ligne d'état vidée — cas du
        /// « Réessayer » revenu data-loss, compte déjà en maintenance : « Chargement… » n'y reste pas. Data-loss écarté
        /// par le store (hors séquence) et store hors maintenance : rien ici, la fin de l'appel rend l'écran depuis le
        /// store.
        /// </summary>
        private void ApplyMaintenance(PlayerEconomyStateStore store, long requestNumber, CancellationToken ct)
        {
            if (!ProductionStoreWriter.ApplyMaintenance(store, requestNumber, ct)) return;
            if (!ProductionLoadDecision.ShowMaintenancePanel(store)) return;
            _awaitingLoad = false;
            ClearStatus();
        }

        /// <summary>
        /// « Réessayer » (Q5) : relance la connexion (resolveLoginState), appel sérialisé ; refusé pendant tout appel en
        /// cours (plusieurs appuis rapides → un seul appel). Succès → maintenance levée par le store, slots rendus,
        /// « Prêt. » ; data-loss → panneau maintenu, ligne d'état vidée ; autre erreur → panneau maintenu, message
        /// existant.
        /// </summary>
        private void OnRetryClicked()
        {
            if (CallInFlight || !IsMaintenance || _cts == null) return;
            SetStatus("Chargement…", "status--loading");
            _ = LoadAsync(_cts.Token);
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

        /// <summary>Ligne d'état vidée (maintenance : le texte Q5 est dans le panneau, 19.4d).</summary>
        private void ClearStatus() => SetStatus(string.Empty, "status--error");

        // Maintenance (data-loss, D-ETAPE19-010) : texte du founder (Q5) affiché tel quel, sans préfixe. Depuis 19.4d,
        // un data-loss va au store (ApplyMaintenance) et le texte Q5 s'affiche dans le panneau, jamais dans la ligne
        // d'état : cette branche n'est plus atteinte par l'écran de production, gardée par sécurité.
        private static string FormatError(string userMessage, bool isMaintenance) =>
            isMaintenance ? userMessage : $"Erreur : {userMessage}";

        /// <summary>
        /// Un appel qui écrit bâtiment et inventaire est en cours, lancé par cet écran ou un précédent (store).
        /// </summary>
        private bool CallInFlight => _store != null && _store.CallInFlight;

        /// <summary>Compte en maintenance (store, 19.4d).</summary>
        private bool IsMaintenance => ProductionLoadDecision.ShowMaintenancePanel(_store);

        /// <summary>Actions de production refusées : appel en cours (tous écrans) ou compte en maintenance (19.4d).</summary>
        private bool ActionsBlocked => CallInFlight || IsMaintenance;

        /// <summary>
        /// Règle existante, étendue au panneau et à l'appel en cours de tout écran : slots (« Produire », « Arrêter ») et
        /// « Collecter » suivent <paramref name="enabled"/> (appelée avec !ActionsBlocked à chaque Changed et à
        /// l'OnEnable) ; les boutons du panneau sont inactifs pendant un appel, puis reprennent leur état calculé
        /// (1a-1c), jamais une réactivation en bloc ; ceux de la confirmation d'arrêt aussi (19.4c-2). « Marché » n'est
        /// touché qu'en maintenance (19.4d, arbitrage du 2026-11-04, (2a)) : inactif en maintenance, actif sinon, même
        /// pendant un appel. « Réessayer » : inactif pendant tout appel en cours.
        /// </summary>
        private void SetAllButtonsEnabled(bool enabled)
        {
            foreach (var btn in _slotButtons)
                btn.SetEnabled(enabled);
            _collectButton?.SetEnabled(enabled);
            _marketButton?.SetEnabled(!IsMaintenance);
            _retryButton?.SetEnabled(!CallInFlight);
            RefreshLaunchPanel();
            RefreshStopConfirm();
        }

        private static void SetText(Button button, string text)
        {
            if (button != null) button.text = text;
        }

        private static void SetSelected(VisualElement element, bool selected) =>
            element?.EnableInClassList("launch-choice-btn--selected", selected);
    }
}
