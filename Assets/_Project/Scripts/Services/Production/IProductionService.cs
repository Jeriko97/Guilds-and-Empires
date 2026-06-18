using System.Threading;
using System.Threading.Tasks;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Contrat pour les actions de production Phase 1.
    ///
    /// L'implémentation concrète encapsule le SDK Firebase Functions.
    /// L'UI ne dépend jamais de Firebase directement — elle résout IProductionService
    /// via ServiceLocator. Doctrine C3.
    /// </summary>
    public interface IProductionService
    {
        /// <summary>
        /// Démarre un slot de production sur un bâtiment via la CF startProductionSlot.
        ///
        /// Consomme les inputs d'inventaire, pose startedAt côté serveur, retourne
        /// l'état mis à jour du bâtiment et de l'inventaire en un seul aller-retour.
        /// Lance <see cref="ProductionServiceException"/> sur erreur métier ou réseau.
        /// </summary>
        Task<ProductionResult> StartProductionSlotAsync(
            string buildingId,
            int slotIndex,
            string recipeId,
            CancellationToken ct = default);

        /// <summary>
        /// Récolte la production accumulée sur tous les slots actifs d'un bâtiment via la CF collectProduction.
        ///
        /// Retourne l'état mis à jour du bâtiment, l'inventaire, et le détail récolté/rejeté.
        /// Aucun slot actif = no-op valide (collected et discarded vides).
        /// Lance <see cref="ProductionServiceException"/> sur erreur métier ou réseau.
        /// </summary>
        Task<CollectProductionResult> CollectProductionAsync(
            string buildingId,
            CancellationToken ct = default);
    }
}
