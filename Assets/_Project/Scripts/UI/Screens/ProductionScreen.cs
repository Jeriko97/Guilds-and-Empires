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

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Premier écran gameplay — liste les slots de la Sawmill et permet de démarrer "logs".
    ///
    /// Règles absolues :
    /// - Aucun calcul économique/temporel local — état brut depuis la CF. Doctrine server-auth.
    /// - Cycle de vie symétrique : CTS créé en OnEnable, annulé+disposé en OnDisable. Doctrine C9.
    /// - IPlayerService et IProductionService résolus via ServiceLocator. Doctrine C3.
    /// - INTERDIT de rappeler resolveLoginState après startProductionSlot (réponse contient building).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class ProductionScreen : BaseScreen
    {
        private UIDocument _doc;
        private CancellationTokenSource _cts;

        // ── UI element refs ───────────────────────────────────────────────────
        private Label         _titleLabel;
        private Label         _statusLabel;
        private VisualElement _slotsContainer;

        // ── State ─────────────────────────────────────────────────────────────
        private BuildingSnapshot   _currentBuilding;
        private readonly List<Button> _slotButtons = new();

        private void Awake()
        {
            _doc = GetComponent<UIDocument>();
        }

        private void OnEnable()
        {
            _cts = new CancellationTokenSource();

            var root     = _doc.rootVisualElement;
            _titleLabel  = root.Q<Label>("title-label");
            _statusLabel = root.Q<Label>("status-label");
            _slotsContainer = root.Q<VisualElement>("slots-container");

            SetStatus("Chargement…", "status--loading");
            _slotsContainer.Clear();
            _slotButtons.Clear();

            _ = LoadAsync(_cts.Token);
        }

        private void OnDisable()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }

        // ── Initial load ──────────────────────────────────────────────────────

        private async Task LoadAsync(CancellationToken ct)
        {
            if (!ServiceLocator.TryResolve<IPlayerService>(out var playerService))
            {
                GELogger.Error("ProductionScreen", "IPlayerService non enregistré — bootstrap incomplet.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            try
            {
                var snapshot = await playerService.ResolveLoginStateAsync(ct);
                ct.ThrowIfCancellationRequested();

                if (snapshot.Buildings.Count == 0)
                {
                    SetStatus("Aucun bâtiment disponible.", "status--error");
                    return;
                }

                _currentBuilding = snapshot.Buildings[0];
                RenderSlots();
                SetStatus("Prêt.", "status--success");
            }
            catch (OperationCanceledException) { }
            catch (PlayerServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur PlayerService: {ex.UserMessage}");
                SetStatus($"Erreur : {ex.UserMessage}", "status--error");
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue au chargement: {ex.Message}");
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
        }

        // ── Slot rendering ────────────────────────────────────────────────────

        private void RenderSlots()
        {
            _slotsContainer.Clear();
            _slotButtons.Clear();

            if (_titleLabel != null)
                _titleLabel.text = $"{_currentBuilding.BuildingType} lv{_currentBuilding.Level}";

            foreach (var slot in _currentBuilding.Slots)
            {
                var card = new VisualElement();
                card.AddToClassList("slot-card");

                var header = new Label($"Slot {slot.SlotIndex}");
                header.AddToClassList("slot-header");
                card.Add(header);

                if (slot.RecipeId == null)
                {
                    var capturedIndex = slot.SlotIndex;
                    var btn = new Button(() => OnProduceClicked(capturedIndex));
                    btn.text = "Produire Logs";
                    btn.AddToClassList("slot-produce-btn");
                    card.Add(btn);
                    _slotButtons.Add(btn);
                }
                else
                {
                    var activeLabel = new Label("Logs en cours");
                    activeLabel.AddToClassList("slot-active-label");
                    card.Add(activeLabel);
                }

                _slotsContainer.Add(card);
            }
        }

        // ── Production handler ────────────────────────────────────────────────

        private void OnProduceClicked(int slotIndex)
        {
            SetAllButtonsEnabled(false);
            _ = ProduceSlotAsync(slotIndex, _cts.Token);
        }

        private async Task ProduceSlotAsync(int slotIndex, CancellationToken ct)
        {
            if (!ServiceLocator.TryResolve<IProductionService>(out var productionService))
            {
                GELogger.Error("ProductionScreen", "IProductionService non enregistré.");
                SetStatus("Erreur : service manquant.", "status--error");
                SetAllButtonsEnabled(true);
                return;
            }

            try
            {
                var result = await productionService.StartProductionSlotAsync(
                    _currentBuilding.Id, slotIndex, "logs", ct);

                ct.ThrowIfCancellationRequested();

                _currentBuilding = result.Building;
                RenderSlots();
                SetStatus("Production démarrée.", "status--success");
            }
            catch (OperationCanceledException) { }
            catch (ProductionServiceException ex)
            {
                GELogger.Warning("ProductionScreen", $"Erreur production: {ex.UserMessage}");
                SetStatus($"Erreur : {ex.UserMessage}", "status--error");
                SetAllButtonsEnabled(true);
            }
            catch (Exception ex)
            {
                GELogger.Error("ProductionScreen", $"Erreur inattendue: {ex.Message}");
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
                SetAllButtonsEnabled(true);
            }
        }

        // ── Helpers UI ────────────────────────────────────────────────────────

        private void SetStatus(string text, string modifier)
        {
            if (_statusLabel == null) return;
            _statusLabel.text = text;
            _statusLabel.RemoveFromClassList("status--loading");
            _statusLabel.RemoveFromClassList("status--error");
            _statusLabel.RemoveFromClassList("status--success");
            _statusLabel.AddToClassList(modifier);
        }

        private void SetAllButtonsEnabled(bool enabled)
        {
            foreach (var btn in _slotButtons)
                btn.SetEnabled(enabled);
        }
    }
}
