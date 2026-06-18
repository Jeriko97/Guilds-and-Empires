using System;
using System.Collections.Generic;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Production
{
    internal static class ProductionParsingHelpers
    {
        internal static BuildingSnapshot ParseBuilding(Dictionary<object, object> d, string buildingId)
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

        internal static SlotSnapshot ParseSlot(Dictionary<object, object> d)
        {
            var slotIndex         = (int)GetLong(d, "slotIndex", 0L);
            var recipeId          = GetValue(d, "recipeId") as string;
            var startedAtMs       = PlayerStateSnapshot.ParseTimestampMs(GetValue(d, "startedAt"));
            var lastProcessedAtMs = PlayerStateSnapshot.ParseTimestampMs(GetValue(d, "lastProcessedAt"));
            return new SlotSnapshot(slotIndex, recipeId, startedAtMs, lastProcessedAtMs);
        }

        internal static InventoryState ParseInventory(Dictionary<object, object> d)
        {
            return new InventoryState(
                ParseResourceStack(RequireDict(GetValue(d, "logs"),               "logs")),
                ParseResourceStack(RequireDict(GetValue(d, "planks"),             "planks")),
                ParseResourceStack(RequireDict(GetValue(d, "reconstructionKits"), "reconstructionKits"))
            );
        }

        internal static ResourceStack ParseResourceStack(Dictionary<object, object> d)
        {
            return new ResourceStack(
                quantity:        (int)GetLong(d, "quantity",        0L),
                cap:             (int)GetLong(d, "cap",             0L),
                upgradesApplied: (int)GetLong(d, "upgradesApplied", 0L)
            );
        }

        internal static Dictionary<object, object> RequireDict(object value, string fieldName)
        {
            if (value is Dictionary<object, object> dict) return dict;
            if (value is Dictionary<string, object> strDict)
            {
                var converted = new Dictionary<object, object>(strDict.Count);
                foreach (var kv in strDict) converted[kv.Key] = kv.Value;
                return converted;
            }
            throw new FormatException(
                $"Production: expected dict for '{fieldName}', got {value?.GetType().Name ?? "null"}");
        }

        internal static object GetValue(Dictionary<object, object> dict, string key)
        {
            dict.TryGetValue(key, out var val);
            return val;
        }

        internal static string GetString(Dictionary<object, object> d, string key, string fallback)
        {
            var v = GetValue(d, key);
            return v is string s ? s : fallback;
        }

        internal static long GetLong(Dictionary<object, object> d, string key, long fallback)
        {
            var v = GetValue(d, key);
            if (v == null) return fallback;
            try { return Convert.ToInt64(v); }
            catch { return fallback; }
        }
    }
}
