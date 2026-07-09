using System.Threading;
using System.Threading.Tasks;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Market
{
    /// <summary>
    /// Contrat pour les données du marché Phase 1.
    ///
    /// L'implémentation concrète encapsule le SDK Firebase Firestore.
    /// L'UI ne dépend jamais de Firebase directement — elle résout IMarketService
    /// via ServiceLocator. Doctrine C3.
    /// </summary>
    public interface IMarketService
    {
        /// <summary>
        /// Retourne les prix courants du marché depuis /marketState/state.
        /// Résultat mis en cache 5 minutes côté client (one-shot, pas de listener).
        /// Lance <see cref="MarketServiceException"/> sur erreur réseau ou doc absent.
        /// </summary>
        Task<MarketStateSnapshot> GetMarketPricesAsync(CancellationToken ct = default);
    }
}
