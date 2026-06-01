using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace GuildsAndEmpires.Models
{
    // ── Resource stack ────────────────────────────────────────────────────────

    public sealed class ResourceStack
    {
        public int Quantity { get; }
        public int Cap { get; }
        public int UpgradesApplied { get; }

        public ResourceStack(int quantity, int cap, int upgradesApplied = 0)
        {
            Quantity = quantity;
            Cap = cap;
            UpgradesApplied = upgradesApplied;
        }
    }

    // ── Inventory ─────────────────────────────────────────────────────────────

    public sealed class InventoryState
    {
        public ResourceStack Logs { get; }
        public ResourceStack Planks { get; }
        public ResourceStack ReconstructionKits { get; }

        public InventoryState(ResourceStack logs, ResourceStack planks, ResourceStack reconstructionKits)
        {
            Logs = logs;
            Planks = planks;
            ReconstructionKits = reconstructionKits;
        }
    }

    // ── Player data ───────────────────────────────────────────────────────────

    public sealed class PlayerData
    {
        public string DisplayName { get; }
        public long Gold { get; }
        public long ImperialFavor { get; }
        public InventoryState Inventory { get; }
        public string FavorRank { get; }
        public bool GuildCharterUnlocked { get; }
        public bool FirstContractCompleted { get; }

        public PlayerData(
            string displayName,
            long gold,
            long imperialFavor,
            InventoryState inventory,
            string favorRank,
            bool guildCharterUnlocked,
            bool firstContractCompleted)
        {
            DisplayName = displayName;
            Gold = gold;
            ImperialFavor = imperialFavor;
            Inventory = inventory;
            FavorRank = favorRank;
            GuildCharterUnlocked = guildCharterUnlocked;
            FirstContractCompleted = firstContractCompleted;
        }
    }

    // ── Full snapshot returned by resolveLoginState ───────────────────────────

    public sealed class PlayerStateSnapshot
    {
        public PlayerData Player { get; }

        /// <summary>
        /// Bâtiments du joueur avec leur id Firestore et l'état complet de leurs slots.
        /// Source de vérité pour startProductionSlot et collectProduction.
        /// </summary>
        public IReadOnlyList<BuildingSnapshot> Buildings { get; }

        /// <summary>Nombre de bâtiments — propriété calculée, zéro régression.</summary>
        public int BuildingCount => Buildings.Count;

        public int ActiveContractCount { get; }

        /// <summary>Firebase UID — injecté par FirebasePlayerService après auth, jamais calculé UI-side.</summary>
        public string Uid { get; }

        public PlayerStateSnapshot(PlayerData player, IReadOnlyList<BuildingSnapshot> buildings,
                                   int activeContractCount, string uid = null)
        {
            Player              = player;
            Buildings           = buildings ?? new ReadOnlyCollection<BuildingSnapshot>(new List<BuildingSnapshot>());
            ActiveContractCount = activeContractCount;
            Uid                 = uid ?? string.Empty;
        }

        // ── Parse from HttpsCallableResult.Data ───────────────────────────────
        // The Firebase Functions Unity SDK 13.x deserialises nested JSON objects as
        // Dictionary<object,object> — NOT Dictionary<string,object>.
        // All conversions use Convert.ToXxx to tolerate long/int/double boxing differences.

        public static PlayerStateSnapshot Parse(object data, string uid = null)
        {
            var root = RequireDict(data, "response root");

            var playerDict = RequireDict(GetValue(root, "player"), "player");
            var player     = ParsePlayer(playerDict);

            var buildings = new List<BuildingSnapshot>();
            if (root.TryGetValue("buildings", out var rawBuildings) && rawBuildings is IList<object> bl)
                foreach (var b in bl)
                    if (b is Dictionary<object, object> bd)
                        buildings.Add(ParseBuilding(bd));

            int contractCount = 0;
            if (root.TryGetValue("activeContracts", out var rawContracts) && rawContracts is IList<object> cl)
                contractCount = cl.Count;

            return new PlayerStateSnapshot(player, buildings.AsReadOnly(), contractCount, uid);
        }

        private static PlayerData ParsePlayer(Dictionary<object, object> d)
        {
            var inventoryDict = RequireDict(GetValue(d, "inventory"), "inventory");
            var inventory     = ParseInventory(inventoryDict);

            return new PlayerData(
                displayName:           GetString(d, "displayName",           "Marchand"),
                gold:                  GetLong(d,   "gold",                  0L),
                imperialFavor:         GetLong(d,   "imperialFavor",         0L),
                inventory:             inventory,
                favorRank:             GetString(d, "favorRank",             "local_supplier"),
                guildCharterUnlocked:  GetBool(d,   "guildCharterUnlocked",  false),
                firstContractCompleted:GetBool(d,   "firstContractCompleted",false)
            );
        }

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
                quantity:         (int)GetLong(d, "quantity",         0L),
                cap:              (int)GetLong(d, "cap",              0L),
                upgradesApplied:  (int)GetLong(d, "upgradesApplied",  0L)
            );
        }

        // ── Building / Slot parsers ───────────────────────────────────────────

        private static BuildingSnapshot ParseBuilding(Dictionary<object, object> d)
        {
            var id           = GetString(d, "id",           string.Empty);
            var buildingType = GetString(d, "buildingType", string.Empty);
            var level        = (int)GetLong(d, "level",     1L);

            var slots = new List<SlotSnapshot>();
            if (d.TryGetValue("slots", out var rawSlots) && rawSlots is IList<object> sl)
                foreach (var s in sl)
                    if (s is Dictionary<object, object> sd)
                        slots.Add(ParseSlot(sd));

            return new BuildingSnapshot(id, buildingType, level, slots.AsReadOnly());
        }

        private static SlotSnapshot ParseSlot(Dictionary<object, object> d)
        {
            var slotIndex        = (int)GetLong(d,  "slotIndex",        0L);
            var recipeId         = GetValue(d, "recipeId") as string;    // null si inactif
            var startedAtMs      = ParseTimestampMs(GetValue(d, "startedAt"));
            var lastProcessedAtMs= ParseTimestampMs(GetValue(d, "lastProcessedAt"));

            return new SlotSnapshot(slotIndex, recipeId, startedAtMs, lastProcessedAtMs);
        }

        /// <summary>
        /// Convertit un Timestamp Firebase en millisecondes epoch UTC.
        /// SOURCE DE VÉRITÉ unique pour le parsing Timestamp côté client.
        /// Clés du wire : "_seconds" / "_nanoseconds" (underscore — confirmé par audit 17.A-2).
        /// Ne jamais créer un second parser ; toutes les CFs futures réutilisent ce helper.
        /// </summary>
        /// <returns>Epoch ms, ou 0L si le timestamp est null (slot inactif).</returns>
        private static long ParseTimestampMs(object raw)
        {
            if (raw == null) return 0L;
            if (raw is Dictionary<object, object> ts)
            {
                var sec  = GetLong(ts, "_seconds",     0L);
                var nano = GetLong(ts, "_nanoseconds", 0L);
                return sec * 1000L + nano / 1_000_000L;
            }
            return 0L;
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
            throw new FormatException($"PlayerStateSnapshot: expected dict for '{fieldName}', got {value?.GetType().Name ?? "null"}");
        }

        private static object GetValue(Dictionary<object, object> dict, string key)
        {
            if (dict.TryGetValue(key, out var val)) return val;
            return null;
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

        private static bool GetBool(Dictionary<object, object> d, string key, bool fallback)
        {
            var v = GetValue(d, key);
            if (v is bool b) return b;
            return fallback;
        }
    }
}
