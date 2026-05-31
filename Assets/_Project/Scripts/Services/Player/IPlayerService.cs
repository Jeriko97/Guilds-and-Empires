using System.Threading;
using System.Threading.Tasks;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Player
{
    /// <summary>
    /// Contrat pour les données du joueur Phase 1.
    ///
    /// L'implémentation concrète encapsule le SDK Firebase Functions.
    /// L'UI ne dépend jamais de Firebase directement — elle résout IPlayerService
    /// via ServiceLocator. Doctrine C3.
    /// </summary>
    public interface IPlayerService
    {
        /// <summary>
        /// Résout l'état complet du joueur via la Cloud Function resolveLoginState.
        ///
        /// Calcule la production différée, met à jour lastLoginAt, et retourne
        /// le snapshot complet en un seul aller-retour.
        /// Lance <see cref="PlayerServiceException"/> sur erreur métier ou réseau.
        /// </summary>
        Task<PlayerStateSnapshot> ResolveLoginStateAsync(CancellationToken ct = default);
    }
}
