using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Market;
using GuildsAndEmpires.State;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Écran Marché — gold + inventaire (PlayerEconomyStateStore), prix courants (GetMarketPricesAsync)
    /// et vente par boutons fixes « Vendre 1 / Vendre 10 / Tout » pour chaque ressource.
    ///
    /// Règles absolues :
    /// - Aucun calcul économique local — après une vente, le store est remplacé par NewGold + Inventory
    ///   renvoyés par sellToMarket. Le prix affiché est indicatif (cache 5 min) ; le serveur fixe le prix.
    /// - Une idempotencyKey par intention (ressource, quantité), figée au clic, conservée tant que
    ///   l'intention n'est pas résolue par une réponse serveur — y compris si l'écran est détruit (Pop).
    /// - Cycle de vie symétrique : CTS créé en OnEnable, annulé+disposé en OnDisable. Doctrine C9.
    /// - IMarketService, PlayerEconomyStateStore et ScreenManager résolus via ServiceLocator. Doctrine C3.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class MarketScreen : BaseScreen
    {
        /// <summary>
        /// Plafond de quantité par vente. Miroir de MAX_MARKET_SELL_QUANTITY
        /// (firebase/functions/src/market/sellToMarket.ts) et du libellé « 1 à 100 » de
        /// FirebaseMarketService.MapErrorMessage — modifier les trois ensemble.
        /// </summary>
        private const int MaxSellQuantity = 100;

        /// <summary>Cadence de polling de marketState (doctrine C8 : cadence de updateMarketPrices, aucun listener).</summary>
        private static readonly TimeSpan PricePollInterval = TimeSpan.FromMinutes(5);

        private static readonly string[] ResourceKeys =
        {
            EconomyResourceKeys.LOGS,
            EconomyResourceKeys.PLANKS,
            EconomyResourceKeys.RECONSTRUCTION_KITS,
        };

        // Intentions de vente non résolues : "resource:quantity" → idempotencyKey.
        // Statique : survit à la destruction de l'écran pour qu'un retry réutilise la même clé.
        private static readonly Dictionary<string, string> PendingSaleKeys = new();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics() => PendingSaleKeys.Clear();

        private UIDocument _doc;
        private CancellationTokenSource _cts;

        // ── UI element refs ───────────────────────────────────────────────────
        private Label         _statusLabel;
        private Label         _goldLabel;
        private VisualElement _resourcesContainer;
        private Button        _backButton;

        // ── State ─────────────────────────────────────────────────────────────
        private MarketStateSnapshot   _prices;
        private bool                  _saleInFlight;
        private readonly List<Button> _sellButtons = new();

        private void Awake()
        {
            _doc = GetComponent<UIDocument>();
        }

        private void OnEnable()
        {
            _cts = new CancellationTokenSource();

            var root            = _doc.rootVisualElement;
            _statusLabel        = root.Q<Label>("status-label");
            _goldLabel          = root.Q<Label>("gold-label");
            _resourcesContainer = root.Q<VisualElement>("resources-container");
            _backButton         = root.Q<Button>("back-button");

            if (_backButton != null)
                _backButton.clicked += OnBackClicked;

            _saleInFlight = false;
            RenderEconomy();
            SetStatus("Chargement des prix…", "status--loading");
            _ = PollPricesAsync(_cts.Token);
        }

        private void OnDisable()
        {
            if (_backButton != null)
                _backButton.clicked -= OnBackClicked;
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }

        // ── Prices ────────────────────────────────────────────────────────────

        /// <summary>
        /// Charge les prix puis les relit toutes les 5 min tant que l'écran est actif (doctrine C8).
        /// Le cache du service (TTL 5 min) est expiré à chaque tour : un tour = au plus un read Firestore.
        /// Arrêt par le CTS annulé en OnDisable (doctrine C9).
        /// </summary>
        private async Task PollPricesAsync(CancellationToken ct)
        {
            if (!ServiceLocator.TryResolve<IMarketService>(out var marketService))
            {
                GELogger.Error("MarketScreen", "IMarketService non enregistré — bootstrap incomplet.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            var firstLoad = true;
            while (!ct.IsCancellationRequested)
            {
                await LoadPricesAsync(marketService, firstLoad, ct);
                firstLoad = false;

                try { await Task.Delay(PricePollInterval, ct); }
                catch (OperationCanceledException) { return; }
            }
        }

        private async Task LoadPricesAsync(IMarketService marketService, bool firstLoad, CancellationToken ct)
        {
            try
            {
                var prices = await marketService.GetMarketPricesAsync(ct);
                ct.ThrowIfCancellationRequested();

                _prices = prices;
                RenderEconomy();
                // Ne pas écraser le statut d'une vente en cours ni le résultat d'une vente.
                if (firstLoad && !_saleInFlight)
                    SetStatus("Prêt.", "status--success");
            }
            catch (OperationCanceledException) { }
            catch (MarketServiceException ex)
            {
                if (ct.IsCancellationRequested) return;
                // La vente reste possible : le prix appliqué est fixé par le serveur.
                GELogger.Warning("MarketScreen", $"Erreur prix: {ex.UserMessage}");
                if (!_saleInFlight)
                    SetStatus($"Prix indisponibles : {ex.UserMessage}", "status--error");
            }
            catch (Exception ex)
            {
                if (ct.IsCancellationRequested) return;
                GELogger.Error("MarketScreen", $"Erreur inattendue au chargement des prix: {ex.Message}");
                if (!_saleInFlight)
                    SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
        }

        // ── Rendering ─────────────────────────────────────────────────────────

        private void RenderEconomy()
        {
            _resourcesContainer?.Clear();
            _sellButtons.Clear();

            ServiceLocator.TryResolve<PlayerEconomyStateStore>(out var store);
            var hasState = store != null && store.HasState && store.Inventory != null;

            if (_goldLabel != null)
                _goldLabel.text = hasState ? $"Or : {store.Gold}" : "Or : —";

            if (_resourcesContainer == null) return;

            foreach (var key in ResourceKeys)
            {
                var stack = hasState ? GetStack(store.Inventory, key) : null;

                var card = new VisualElement();
                card.AddToClassList("resource-card");

                var header = new Label(DisplayName(key));
                header.AddToClassList("resource-header");
                card.Add(header);

                var stockLabel = new Label(stack != null ? $"Stock : {stack.Quantity} / {stack.Cap}" : "Stock : —");
                stockLabel.AddToClassList("resource-info");
                card.Add(stockLabel);

                var priceLabel = new Label(FormatPrice(key));
                priceLabel.AddToClassList("resource-info");
                card.Add(priceLabel);

                var actions = new VisualElement();
                actions.AddToClassList("resource-actions");
                var stock = stack?.Quantity ?? 0;
                actions.Add(CreateSellButton(key, "Vendre 1",  1,                                stock >= 1));
                actions.Add(CreateSellButton(key, "Vendre 10", 10,                               stock >= 10));
                actions.Add(CreateSellButton(key, "Tout",      Math.Min(stock, MaxSellQuantity), stock >= 1));
                card.Add(actions);

                _resourcesContainer.Add(card);
            }

            _backButton?.SetEnabled(!_saleInFlight);
        }

        private Button CreateSellButton(string resourceKey, string text, int quantity, bool available)
        {
            var btn = new Button(() => OnSellClicked(resourceKey, quantity)) { text = text };
            btn.name = $"sell-{resourceKey}-{text.Replace(' ', '-').ToLowerInvariant()}";
            btn.AddToClassList("sell-btn");
            btn.userData = available;
            btn.SetEnabled(available && !_saleInFlight);
            _sellButtons.Add(btn);
            return btn;
        }

        // ── Sale handler ──────────────────────────────────────────────────────

        private void OnSellClicked(string resourceKey, int quantity)
        {
            if (_saleInFlight || quantity <= 0) return;

            // Une clé par intention : réutilisée si cette même intention a échoué sans réponse serveur.
            var intent = $"{resourceKey}:{quantity}";
            if (!PendingSaleKeys.TryGetValue(intent, out var idempotencyKey))
            {
                idempotencyKey = Guid.NewGuid().ToString();
                PendingSaleKeys[intent] = idempotencyKey;
            }

            SetSaleInFlight(true);
            _ = SellAsync(resourceKey, quantity, intent, idempotencyKey, _cts.Token);
        }

        private async Task SellAsync(string resourceKey, int quantity, string intent, string idempotencyKey,
                                     CancellationToken ct)
        {
            if (!ServiceLocator.TryResolve<IMarketService>(out var marketService))
            {
                GELogger.Error("MarketScreen", "IMarketService non enregistré.");
                SetStatus("Erreur : service manquant.", "status--error");
                SetSaleInFlight(false);
                return;
            }

            SetStatus("Vente en cours…", "status--loading");

            try
            {
                var result = await marketService.SellToMarketAsync(resourceKey, quantity, idempotencyKey, ct);

                // Réponse serveur reçue : l'intention est résolue, même si l'écran a été quitté entre-temps.
                PendingSaleKeys.Remove(intent);

                if (ServiceLocator.TryResolve<PlayerEconomyStateStore>(out var economyStore))
                    economyStore.ApplyServerState(result.NewGold, result.Inventory);
                else
                    GELogger.Warning("MarketScreen", "PlayerEconomyStateStore non enregistré — gold/inventaire non mis à jour.");

                ct.ThrowIfCancellationRequested();

                _saleInFlight = false;
                RenderEconomy();
                SetStatus(result.AlreadySold
                              ? "Vente déjà enregistrée."
                              : $"Vendu {quantity} {DisplayName(resourceKey)} à {result.PriceApplied} or : +{result.GoldEarned} or.",
                          "status--success");
            }
            catch (OperationCanceledException) { }
            catch (MarketServiceException ex)
            {
                // Erreur tardive après OnDisable : l'intention reste en attente, aucune UI touchée (C9).
                if (ct.IsCancellationRequested) return;
                GELogger.Warning("MarketScreen", $"Erreur vente: {ex.UserMessage}");
                SetStatus($"Erreur : {ex.UserMessage}", "status--error");
                SetSaleInFlight(false);
            }
            catch (Exception ex)
            {
                if (ct.IsCancellationRequested) return;
                GELogger.Error("MarketScreen", $"Erreur inattendue à la vente: {ex.Message}");
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
                SetSaleInFlight(false);
            }
        }

        // ── Navigation ────────────────────────────────────────────────────────

        private void OnBackClicked()
        {
            if (_saleInFlight) return;

            if (ServiceLocator.TryResolve<ScreenManager>(out var screenManager))
                screenManager.Pop();
            else
                GELogger.Warning("MarketScreen", "ScreenManager non résolvable — Pop impossible.");
        }

        // ── Helpers UI ────────────────────────────────────────────────────────

        private void SetSaleInFlight(bool inFlight)
        {
            _saleInFlight = inFlight;
            foreach (var btn in _sellButtons)
                btn.SetEnabled(!inFlight && btn.userData is true);
            _backButton?.SetEnabled(!inFlight);
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

        private string FormatPrice(string resourceKey)
        {
            if (_prices == null || !_prices.Prices.TryGetValue(resourceKey, out var price))
                return "Prix : —";
            return $"Prix : {price.CurrentPrice} or ({TrendLabel(price.Trend)})";
        }

        private static ResourceStack GetStack(InventoryState inventory, string resourceKey) => resourceKey switch
        {
            EconomyResourceKeys.LOGS                => inventory.Logs,
            EconomyResourceKeys.PLANKS              => inventory.Planks,
            EconomyResourceKeys.RECONSTRUCTION_KITS => inventory.ReconstructionKits,
            _                                       => null,
        };

        private static string DisplayName(string resourceKey) => resourceKey switch
        {
            EconomyResourceKeys.LOGS                => "Logs",
            EconomyResourceKeys.PLANKS              => "Planks",
            EconomyResourceKeys.RECONSTRUCTION_KITS => "Reconstruction Kits",
            _                                       => resourceKey,
        };

        private static string TrendLabel(string trend) => trend switch
        {
            "rising"  => "en hausse",
            "falling" => "en baisse",
            _         => "stable",
        };
    }
}
