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
        /// <paramref name="cycles"/> : taille du lot pour planks et kits (D-ETAPE19-001) ; null pour les logs
        /// (production continue, le serveur refuse le champ). <paramref name="idempotencyKey"/> : UUID d'une
        /// intention, réutilisé tel quel en cas de réessai (D-ETAPE19-003, doctrine C5).
        /// Le serveur débite les intrants du lot, pose startedAt et retourne l'état mis à jour du bâtiment et
        /// de l'inventaire en un seul aller-retour (AlreadyApplied au rejeu d'une clé déjà appliquée).
        /// Lance <see cref="ProductionServiceException"/> sur erreur métier ou réseau.
        /// </summary>
        Task<ProductionResult> StartProductionSlotAsync(
            string buildingId,
            int slotIndex,
            string recipeId,
            int? cycles,
            string idempotencyKey,
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

        /// <summary>
        /// Arrête un slot occupé via la CF stopProductionSlot (D-ETAPE19-002, -007) : le serveur règle d'abord
        /// tous les slots du bâtiment comme une collecte, rend les intrants des cycles non commencés dans la
        /// limite de la place libre, puis libère le slot.
        /// <paramref name="idempotencyKey"/> : UUID d'une intention, réutilisé en cas de réessai.
        /// Lance <see cref="ProductionServiceException"/> sur erreur métier ou réseau.
        /// </summary>
        Task<StopProductionResult> StopProductionSlotAsync(
            string buildingId,
            int slotIndex,
            string idempotencyKey,
            CancellationToken ct = default);
    }
}
