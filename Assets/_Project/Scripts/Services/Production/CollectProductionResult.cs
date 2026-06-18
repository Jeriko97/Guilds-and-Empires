using System.Collections.Generic;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Résultat de CollectProductionAsync : état mis à jour du bâtiment, inventaire, et détail récolté/rejeté.
    ///
    /// Parsing depuis la réponse Firebase : <see cref="Parse"/>.
    /// Le buildingId est injecté par le service (absent de BuildingDocument côté CF — D-ETAPE16-004).
    /// Réutilise ProductionParsingHelpers pour building + inventory — pas de parsing dupliqué.
    /// </summary>
    public sealed class CollectProductionResult
    {
        public BuildingSnapshot Building  { get; }
        public InventoryState   Inventory { get; }

        /// <summary>Ressources récoltées ce cycle. Clé = ResourceKey (ex. "logs"). Vide si aucun slot actif.</summary>
        public IReadOnlyDictionary<string, int> Collected { get; }

        /// <summary>Ressources rejetées par cap plein. Vide si cap non atteint.</summary>
        public IReadOnlyDictionary<string, int> Discarded { get; }

        public CollectProductionResult(
            BuildingSnapshot building,
            InventoryState inventory,
            IReadOnlyDictionary<string, int> collected,
            IReadOnlyDictionary<string, int> discarded)
        {
            Building  = building;
            Inventory = inventory;
            Collected = collected;
            Discarded = discarded;
        }

        // ── Parse from HttpsCallableResult.Data ───────────────────────────────
        // Réponse CF : { collected, discarded, building: BuildingDocument, inventory: InventoryState }
        // BuildingDocument ne contient PAS l'id Firestore — buildingId injecté via le paramètre.

        public static CollectProductionResult Parse(object data, string buildingId)
        {
            var root = ProductionParsingHelpers.RequireDict(data, "response root");

            var buildingDict  = ProductionParsingHelpers.RequireDict(ProductionParsingHelpers.GetValue(root, "building"),  "building");
            var building      = ProductionParsingHelpers.ParseBuilding(buildingDict, buildingId);

            var inventoryDict = ProductionParsingHelpers.RequireDict(ProductionParsingHelpers.GetValue(root, "inventory"), "inventory");
            var inventory     = ProductionParsingHelpers.ParseInventory(inventoryDict);

            var collected = ParseResourceMap(ProductionParsingHelpers.GetValue(root, "collected"));
            var discarded = ParseResourceMap(ProductionParsingHelpers.GetValue(root, "discarded"));

            return new CollectProductionResult(building, inventory, collected, discarded);
        }

        // collected/discarded wire : Dictionary<object,object> clé ResourceKey → long boxé (D-ETAPE17.A-2).
        private static IReadOnlyDictionary<string, int> ParseResourceMap(object raw)
        {
            var result = new Dictionary<string, int>();
            if (raw is Dictionary<object, object> d)
                foreach (var kv in d)
                    if (kv.Key is string key)
                        result[key] = (int)ProductionParsingHelpers.GetLong(d, key, 0L);
            return result;
        }
    }
}
