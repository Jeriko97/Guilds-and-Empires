using System.Collections.Generic;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Résultat de StopProductionSlotAsync : état mis à jour du bâtiment et de l'inventaire, et détail de
    /// l'arrêt (D-ETAPE19-007).
    ///
    /// Collected / Discarded couvrent TOUT le bâtiment (l'arrêt règle d'abord tous les slots, comme une
    /// collecte). Refunded = intrants des cycles non commencés rendus ; RefundDiscarded = intrants perdus
    /// faute de place. Au rejeu (AlreadyApplied), les quatre maps sont vides.
    /// Parsing : <see cref="Parse"/> ; buildingId injecté par le service (D-ETAPE16-004).
    /// </summary>
    public sealed class StopProductionResult
    {
        public BuildingSnapshot Building  { get; }
        public InventoryState   Inventory { get; }

        public IReadOnlyDictionary<string, int> Collected       { get; }
        public IReadOnlyDictionary<string, int> Discarded       { get; }
        public IReadOnlyDictionary<string, int> Refunded        { get; }
        public IReadOnlyDictionary<string, int> RefundDiscarded { get; }

        /// <summary>true si la clé d'idempotence avait déjà été appliquée (aucun nouvel effet).</summary>
        public bool AlreadyApplied { get; }

        public StopProductionResult(
            BuildingSnapshot building,
            InventoryState inventory,
            IReadOnlyDictionary<string, int> collected,
            IReadOnlyDictionary<string, int> discarded,
            IReadOnlyDictionary<string, int> refunded,
            IReadOnlyDictionary<string, int> refundDiscarded,
            bool alreadyApplied)
        {
            Building        = building;
            Inventory       = inventory;
            Collected       = collected;
            Discarded       = discarded;
            Refunded        = refunded;
            RefundDiscarded = refundDiscarded;
            AlreadyApplied  = alreadyApplied;
        }

        // ── Parse from HttpsCallableResult.Data ───────────────────────────────
        // Réponse CF : { collected, discarded, refunded, refundDiscarded, building, inventory, alreadyApplied }

        public static StopProductionResult Parse(object data, string buildingId)
        {
            var root = FirebaseParsingHelpers.RequireDict(data, "response root", ProductionParsingHelpers.ParseContext);

            var buildingDict  = FirebaseParsingHelpers.RequireDict(FirebaseParsingHelpers.GetValue(root, "building"),  "building",  ProductionParsingHelpers.ParseContext);
            var building      = ProductionParsingHelpers.ParseBuilding(buildingDict, buildingId);

            var inventoryDict = FirebaseParsingHelpers.RequireDict(FirebaseParsingHelpers.GetValue(root, "inventory"), "inventory", ProductionParsingHelpers.ParseContext);
            var inventory     = InventoryParsingHelpers.ParseInventory(inventoryDict, ProductionParsingHelpers.ParseContext);

            return new StopProductionResult(
                building,
                inventory,
                ProductionParsingHelpers.ParseResourceMap(FirebaseParsingHelpers.GetValue(root, "collected")),
                ProductionParsingHelpers.ParseResourceMap(FirebaseParsingHelpers.GetValue(root, "discarded")),
                ProductionParsingHelpers.ParseResourceMap(FirebaseParsingHelpers.GetValue(root, "refunded")),
                ProductionParsingHelpers.ParseResourceMap(FirebaseParsingHelpers.GetValue(root, "refundDiscarded")),
                FirebaseParsingHelpers.GetBool(root, "alreadyApplied", false));
        }
    }
}
