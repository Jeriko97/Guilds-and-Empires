using System.Threading;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.State;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Application d'une réponse serveur de production au store (19.4c-1), sans Firebase ni objet de scène ; une
    /// réponse <c>data-loss</c> (compte en maintenance, 19.4d) suit le même patron.
    ///
    /// Ordre imposé : la réponse est proposée au store (valeurs serveur telles quelles, doctrine C7) AVANT tout
    /// contrôle d'annulation ; seules les écritures d'UI sont abandonnées après annulation (doctrine C9). Une
    /// réponse reçue malgré la fermeture de l'écran n'est donc jamais perdue : l'écran suivant l'affiche.
    /// L'ordre des réponses est assuré d'abord par la sérialisation des appels, tous écrans confondus (un seul appel
    /// en cours, PlayerEconomyStateStore) ; filet : le store n'applique une réponse que si son numéro d'envoi
    /// dépasse le dernier appliqué, ce qui écarte une réponse hors séquence.
    /// </summary>
    public static class ProductionStoreWriter
    {
        /// <summary>
        /// Chargement (resolveLoginState) : gold, inventaire et premier bâtiment proposés au store.
        /// Retourne true si l'appelant peut encore écrire dans l'UI (jeton non annulé), que la réponse ait été
        /// appliquée ou ignorée.
        /// </summary>
        public static bool ApplyLoginState(
            PlayerEconomyStateStore store, long requestNumber, PlayerStateSnapshot snapshot, CancellationToken ct)
        {
            if (store != null && snapshot != null)
            {
                var building = snapshot.Buildings.Count > 0 ? snapshot.Buildings[0] : null;
                store.ApplyServerLoginState(requestNumber, snapshot.Player.Gold, snapshot.Player.Inventory, building);
            }
            return !ct.IsCancellationRequested;
        }

        /// <summary>
        /// Lancement ou collecte : bâtiment et inventaire de la réponse proposés au store, en une seule écriture.
        /// Retourne true si l'appelant peut encore écrire dans l'UI (jeton non annulé), que la réponse ait été
        /// appliquée ou ignorée.
        /// </summary>
        public static bool ApplyProductionState(
            PlayerEconomyStateStore store, long requestNumber, BuildingSnapshot building, InventoryState inventory,
            CancellationToken ct)
        {
            store?.ApplyServerProductionState(requestNumber, building, inventory);
            return !ct.IsCancellationRequested;
        }

        /// <summary>
        /// Réponse <c>data-loss</c> (connexion, lancement, collecte ou arrêt ; 19.4d) : traitée comme une réponse,
        /// l'état de maintenance est proposé au store (même filtre de numéro d'envoi) AVANT le contrôle d'annulation.
        /// Retourne true si l'appelant peut encore écrire dans l'UI (jeton non annulé), que l'état ait été posé ou
        /// ignoré.
        /// </summary>
        public static bool ApplyMaintenance(PlayerEconomyStateStore store, long requestNumber, CancellationToken ct)
        {
            store?.ApplyServerMaintenance(requestNumber);
            return !ct.IsCancellationRequested;
        }
    }
}
