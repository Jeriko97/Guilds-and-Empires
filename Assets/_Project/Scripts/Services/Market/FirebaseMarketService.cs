using System;
using System.Threading;
using System.Threading.Tasks;
using Firebase.Firestore;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Market
{
    /// <summary>
    /// Implémente <see cref="IMarketService"/> via lecture Firestore directe (one-shot).
    ///
    /// Seule classe à importer Firebase.Firestore dans cette couche — doctrine C3.
    /// Cache instance-level de 5 minutes : valide car enregistré en singleton via ServiceLocator.
    /// ZÉRO listener temps réel (coût réseau/batterie inacceptable en pré-alpha).
    /// </summary>
    public sealed class FirebaseMarketService : IMarketService
    {
        private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

        private readonly FirebaseFirestore _db;

        private MarketStateSnapshot _cache;
        private DateTime            _lastFetch = DateTime.MinValue;

        public FirebaseMarketService()
        {
            _db = FirebaseFirestore.DefaultInstance;
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
            catch (Exception ex) when (ct.IsCancellationRequested)
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
    }
}
