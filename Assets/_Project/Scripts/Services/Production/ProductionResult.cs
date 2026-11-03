using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Résultat de StartProductionSlotAsync : état mis à jour du bâtiment et de l'inventaire.
    ///
    /// Parsing depuis la réponse Firebase : <see cref="Parse"/>.
    /// Le buildingId est injecté par le service (absent de BuildingDocument côté CF — D-ETAPE16-004).
    /// Le ParseTimestampMs canonique de PlayerStateSnapshot est réutilisé — pas de second parser.
    /// </summary>
    public sealed class ProductionResult
    {
        public BuildingSnapshot Building  { get; }
        public InventoryState   Inventory { get; }

        /// <summary>true si la clé d'idempotence avait déjà été appliquée (aucun nouvel effet, D-ETAPE19-003).</summary>
        public bool AlreadyApplied { get; }

        public ProductionResult(BuildingSnapshot building, InventoryState inventory, bool alreadyApplied = false)
        {
            Building       = building;
            Inventory      = inventory;
            AlreadyApplied = alreadyApplied;
        }

        // ── Parse from HttpsCallableResult.Data ───────────────────────────────
        // Réponse CF : { building: BuildingDocument, inventory: InventoryState, alreadyApplied: boolean }
        // BuildingDocument ne contient PAS l'id Firestore — buildingId injecté via le paramètre.

        public static ProductionResult Parse(object data, string buildingId)
        {
            var root = FirebaseParsingHelpers.RequireDict(data, "response root", ProductionParsingHelpers.ParseContext);

            var buildingDict  = FirebaseParsingHelpers.RequireDict(FirebaseParsingHelpers.GetValue(root, "building"),  "building",  ProductionParsingHelpers.ParseContext);
            var building      = ProductionParsingHelpers.ParseBuilding(buildingDict, buildingId);

            var inventoryDict = FirebaseParsingHelpers.RequireDict(FirebaseParsingHelpers.GetValue(root, "inventory"), "inventory", ProductionParsingHelpers.ParseContext);
            var inventory     = InventoryParsingHelpers.ParseInventory(inventoryDict, ProductionParsingHelpers.ParseContext);

            var alreadyApplied = FirebaseParsingHelpers.GetBool(root, "alreadyApplied", false);

            return new ProductionResult(building, inventory, alreadyApplied);
        }
    }
}
