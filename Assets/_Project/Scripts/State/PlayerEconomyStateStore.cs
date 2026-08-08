using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.State
{
    /// <summary>
    /// Projection runtime d'affichage du gold/inventaire du joueur.
    ///
    /// Doctrine : ce store n'autorise, ne calcule et ne valide JAMAIS une opération économique.
    /// Ses données ne sont remplacées QUE depuis des valeurs SERVEUR (resolveLoginState,
    /// collectProduction, sellToMarket, ...). Le serveur reste l'unique source de vérité.
    /// Aucun setter, aucun incrément/décrément local.
    /// </summary>
    public sealed class PlayerEconomyStateStore
    {
        public long Gold { get; private set; }
        public InventoryState Inventory { get; private set; }
        public bool HasState { get; private set; }

        public void ApplyServerState(long gold, InventoryState inventory)
        {
            Gold = gold;
            Inventory = inventory;
            HasState = true;
            GELogger.Debug("PlayerEconomyStateStore", $"ApplyServerState — gold={gold}, hasState=true");
        }

        public void ApplyServerInventory(InventoryState inventory)
        {
            if (!HasState)
            {
                GELogger.Warning("PlayerEconomyStateStore", "ApplyServerInventory appelé avant tout ApplyServerState — ignoré (store non amorcé).");
                return;
            }

            Inventory = inventory;
            GELogger.Debug("PlayerEconomyStateStore", "ApplyServerInventory — inventory mis à jour.");
        }
    }
}
