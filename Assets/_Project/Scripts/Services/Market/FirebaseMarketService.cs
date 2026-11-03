using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Firebase;
using Firebase.Firestore;
using Firebase.Functions;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Market
{
    /// <summary>
    /// Implémente <see cref="IMarketService"/> via lecture Firestore directe (one-shot) et
    /// appel Callable (sellToMarket).
    ///
    /// Seule classe à importer Firebase.Firestore et Firebase.Functions dans cette couche — doctrine C3.
    /// Cache instance-level de 5 minutes : valide car enregistré en singleton via ServiceLocator.
    /// ZÉRO listener temps réel (coût réseau/batterie inacceptable en pré-alpha).
    /// </summary>
    public sealed class FirebaseMarketService : IMarketService
    {
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

        private readonly FirebaseFirestore _db;
        private readonly FirebaseFunctions _functions;

        private MarketStateSnapshot _cache;
        private DateTime            _lastFetch = DateTime.MinValue;

        /// <param name="app">Instance choisie par FirebaseBootstrap (par défaut, ou instance de l'émulateur dans l'Éditeur).</param>
        public FirebaseMarketService(FirebaseApp app)
        {
            _db        = FirebaseFirestore.GetInstance(app);
            _functions = FirebaseFunctions.GetInstance(app);
        }

        public async Task<MarketStateSnapshot> GetMarketPricesAsync(CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();

            if (_cache != null && DateTime.UtcNow - _lastFetch < CacheTtl)
                return _cache;

            DocumentSnapshot snapshot;
            try
            {
                snapshot = await _db.Collection("marketState").Document("state")
                               .GetSnapshotAsync(Source.Default);
            }
            catch (Exception) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("MarketService", "GetMarketPrices — annulé.");
                throw new OperationCanceledException(ct);
            }
            catch (Exception ex)
            {
                GELogger.Error("MarketService", $"Lecture marketState échouée: {ex.Message}");
                throw new MarketServiceException("Impossible de charger les prix du marché.", ex);
            }

            ct.ThrowIfCancellationRequested();

            if (!snapshot.Exists)
            {
                GELogger.Warning("MarketService", "marketState/state introuvable.");
                throw new MarketServiceException("Les prix du marché sont indisponibles.");
            }

            MarketStateSnapshot result;
            try
            {
                var dict = snapshot.ToDictionary();
                result   = MarketStateSnapshot.Parse(dict);
            }
            catch (Exception ex)
            {
                GELogger.Error("MarketService", $"Parsing marketState échoué: {ex.Message}");
                throw new MarketServiceException("Réponse marché invalide.", ex);
            }

            _cache      = result;
            _lastFetch  = DateTime.UtcNow;

            GELogger.Info("MarketService", $"Prix chargés — logs:{result.Prices["logs"].CurrentPrice} planks:{result.Prices["planks"].CurrentPrice}");
            return result;
        }

        public async Task<SellToMarketResult> SellToMarketAsync(
            string resourceType,
            int quantity,
            string idempotencyKey,
            CancellationToken ct = default)
        {
            GELogger.Debug("MarketService", $"sellToMarket — resource:{resourceType} qty:{quantity}");

            var callable = _functions.GetHttpsCallable("sellToMarket");
            var payload  = new Dictionary<string, object>
            {
                { "resourceType",   resourceType   },
                { "quantity",       quantity        },
                { "idempotencyKey", idempotencyKey },
            };

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync(payload);
            }
            catch (FunctionsException ex)
            {
                GELogger.Warning("MarketService", $"sellToMarket [{ex.ErrorCode}]: {ex.Message}");
                throw new MarketServiceException(MapErrorMessage(ex.ErrorCode), ex);
            }
            catch (Exception) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("MarketService", "sellToMarket — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                var result = SellToMarketResult.Parse(rawResult.Data);
                GELogger.Info("MarketService", $"sellToMarket OK — goldEarned:{result.GoldEarned} newGold:{result.NewGold} alreadySold:{result.AlreadySold}");
                return result;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                GELogger.Error("MarketService", $"Parsing réponse échoué: {ex.Message}");
                throw new MarketServiceException("Réponse serveur invalide.", ex);
            }
        }

        // ── FunctionsErrorCode → message joueur (doctrine C6) ─────────────────

        private static string MapErrorMessage(FunctionsErrorCode code) => code switch
        {
            FunctionsErrorCode.ResourceExhausted  => "Limite de ventes atteinte (20/heure). Réessaie plus tard.",
            FunctionsErrorCode.FailedPrecondition => "Vente impossible pour le moment : stock insuffisant ou marché indisponible.",
            FunctionsErrorCode.InvalidArgument    => "Quantité invalide (1 à 100).",
            FunctionsErrorCode.NotFound           => "Profil joueur introuvable.",
            FunctionsErrorCode.Unauthenticated    => "Session expirée, reconnecte-toi.",
            FunctionsErrorCode.Internal           => "Une erreur est survenue, réessaie.",
            _                                     => "Une erreur est survenue, réessaie.",
        };
    }
}
