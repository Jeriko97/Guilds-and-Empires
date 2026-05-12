using System.Threading;
using System.Threading.Tasks;

namespace GuildsAndEmpires.Services.Economy
{
    /// <summary>
    /// Contrat pour toutes les actions économiques du joueur.
    ///
    /// RÈGLE ABSOLUE : aucune mutation de gold n'est calculée côté client.
    /// Chaque méthode ici appelle une Cloud Function qui valide, calcule, et écrit.
    /// Le client reçoit uniquement le résultat confirmé par le serveur.
    ///
    /// Les méthodes lancent <see cref="EconomyException"/> pour les erreurs métier
    /// (cooldown actif, quota dépassé) afin que l'UI puisse afficher un message précis.
    /// </summary>
    public interface IEconomyService
    {
        /// <summary>
        /// Réclame le bonus journalier. Appelle la Cloud Function <c>claimDailyBonus</c>.
        /// Lance <see cref="EconomyException"/> avec code <c>already_claimed</c> si le cooldown est actif.
        /// </summary>
        Task<ClaimDailyBonusResult> ClaimDailyBonusAsync(CancellationToken ct = default);
    }
}
