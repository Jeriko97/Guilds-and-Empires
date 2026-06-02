using System;
using System.Collections.Generic;
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
        public BuildingSnapshot Building { get; }
        public InventoryState   Inventory { get; }

        public ProductionResult(BuildingSnapshot building, InventoryState inventory)
        {
            Building  = building;
            Inventory = inventory;
        }

        // ── Parse from HttpsCallableResult.Data ───────────────────────────────
        // Réponse CF : { building: BuildingDocument, inventory: InventoryState }
        // BuildingDocument ne contient PAS l'id Firestore — buildingId injecté via le paramètre.

        public static ProductionResult Parse(object data, string buildingId)
        {
            var root = RequireDict(data, "response root");

            var buildingDict = RequireDict(GetValue(root, "building"),   "building");
            var building     = ParseBuilding(buildingDict, buildingId);

            var inventoryDict = RequireDict(GetValue(root, "inventory"), "inventory");
            var inventory     = ParseInventory(inventoryDict);

            return new ProductionResult(building, inventory);
        }

        // ── Building / Slot parsers ───────────────────────────────────────────

        private static BuildingSnapshot ParseBuilding(Dictionary<object, object> d, string buildingId)
        {
            var buildingType = GetString(d, "buildingType", string.Empty);
            var level        = (int)GetLong(d, "level", 1L);

            var slots = new List<SlotSnapshot>();
            if (d.TryGetValue("slots", out var rawSlots) && rawSlots is IList<object> sl)
                foreach (var s in sl)
                    if (s is Dictionary<object, object> sd)
                        slots.Add(ParseSlot(sd));

            return new BuildingSnapshot(buildingId, buildingType, level, slots.AsReadOnly());
        }

        private static SlotSnapshot ParseSlot(Dictionary<object, object> d)
        {
            var slotIndex         = (int)GetLong(d, "slotIndex", 0L);
            var recipeId          = GetValue(d, "recipeId") as string;
            // Appel au parser canonique — interdit de créer un second ParseTimestampMs.
            var startedAtMs       = PlayerStateSnapshot.ParseTimestampMs(GetValue(d, "startedAt"));
            var lastProcessedAtMs = PlayerStateSnapshot.ParseTimestampMs(GetValue(d, "lastProcessedAt"));
            return new SlotSnapshot(slotIndex, recipeId, startedAtMs, lastProcessedAtMs);
        }

        // ── Inventory parsers ─────────────────────────────────────────────────

        private static InventoryState ParseInventory(Dictionary<object, object> d)
        {
            return new InventoryState(
                ParseResourceStack(RequireDict(GetValue(d, "logs"),               "logs")),
                ParseResourceStack(RequireDict(GetValue(d, "planks"),             "planks")),
                ParseResourceStack(RequireDict(GetValue(d, "reconstructionKits"), "reconstructionKits"))
            );
        }

        private static ResourceStack ParseResourceStack(Dictionary<object, object> d)
        {
            return new ResourceStack(
                quantity:        (int)GetLong(d, "quantity",        0L),
                cap:             (int)GetLong(d, "cap",             0L),
                upgradesApplied: (int)GetLong(d, "upgradesApplied", 0L)
            );
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private static Dictionary<object, object> RequireDict(object value, string fieldName)
        {
            if (value is Dictionary<object, object> dict) return dict;
            if (value is Dictionary<string, object> strDict)
            {
                var converted = new Dictionary<object, object>(strDict.Count);
                foreach (var kv in strDict) converted[kv.Key] = kv.Value;
                return converted;
            }
            throw new FormatException(
                $"ProductionResult: expected dict for '{fieldName}', got {value?.GetType().Name ?? "null"}");
        }

        private static object GetValue(Dictionary<object, object> dict, string key)
        {
            dict.TryGetValue(key, out var val);
            return val;
        }

        private static string GetString(Dictionary<object, object> d, string key, string fallback)
        {
            var v = GetValue(d, key);
            return v is string s ? s : fallback;
        }

        private static long GetLong(Dictionary<object, object> d, string key, long fallback)
        {
            var v = GetValue(d, key);
            if (v == null) return fallback;
            try { return Convert.ToInt64(v); }
            catch { return fallback; }
        }
    }
}
