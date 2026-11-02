using System.Collections.Generic;
using System.Collections.ObjectModel;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Services.Production;

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
        // Primitives : Core.FirebaseParsingHelpers ; inventaire : InventoryParsingHelpers ;
        // bâtiments et slots : ProductionParsingHelpers (id lu dans le champ "id") — foyers uniques (TD-015).

        private const string ParseContext = "PlayerStateSnapshot";

        public static PlayerStateSnapshot Parse(object data, string uid = null)
        {
            var root = FirebaseParsingHelpers.RequireDict(data, "response root", ParseContext);

            var playerDict = FirebaseParsingHelpers.RequireDict(FirebaseParsingHelpers.GetValue(root, "player"), "player", ParseContext);
            var player     = ParsePlayer(playerDict);

            var buildings = new List<BuildingSnapshot>();
            if (root.TryGetValue("buildings", out var rawBuildings) && rawBuildings is IList<object> bl)
                foreach (var b in bl)
                    if (b is Dictionary<object, object> bd)
                        buildings.Add(ProductionParsingHelpers.ParseBuilding(
                            bd, FirebaseParsingHelpers.GetString(bd, "id", string.Empty)));

            int contractCount = 0;
            if (root.TryGetValue("activeContracts", out var rawContracts) && rawContracts is IList<object> cl)
                contractCount = cl.Count;

            return new PlayerStateSnapshot(player, buildings.AsReadOnly(), contractCount, uid);
        }

        private static PlayerData ParsePlayer(Dictionary<object, object> d)
        {
            var inventoryDict = FirebaseParsingHelpers.RequireDict(FirebaseParsingHelpers.GetValue(d, "inventory"), "inventory", ParseContext);
            var inventory     = InventoryParsingHelpers.ParseInventory(inventoryDict, ParseContext);

            return new PlayerData(
                displayName:           FirebaseParsingHelpers.GetString(d, "displayName",           "Marchand"),
                gold:                  FirebaseParsingHelpers.GetLong(d,   "gold",                  0L),
                imperialFavor:         FirebaseParsingHelpers.GetLong(d,   "imperialFavor",         0L),
                inventory:             inventory,
                favorRank:             FirebaseParsingHelpers.GetString(d, "favorRank",             "local_supplier"),
                guildCharterUnlocked:  FirebaseParsingHelpers.GetBool(d,   "guildCharterUnlocked",  false),
                firstContractCompleted:FirebaseParsingHelpers.GetBool(d,   "firstContractCompleted",false)
            );
        }

        /// <summary>
        /// Convertit un Timestamp Firebase en millisecondes epoch UTC.
        /// SOURCE DE VÉRITÉ unique pour le parsing Timestamp côté client.
        /// Clés du wire : "_seconds" / "_nanoseconds" (underscore — confirmé par audit 17.A-2).
        /// Ne jamais créer un second parser ; toutes les CFs futures réutilisent ce helper.
        /// </summary>
        /// <returns>Epoch ms, ou 0L si le timestamp est null (slot inactif).</returns>
        internal static long ParseTimestampMs(object raw)
        {
            if (raw == null) return 0L;
            if (raw is Dictionary<object, object> ts)
            {
                var sec  = FirebaseParsingHelpers.GetLong(ts, "_seconds",     0L);
                var nano = FirebaseParsingHelpers.GetLong(ts, "_nanoseconds", 0L);
                return sec * 1000L + nano / 1_000_000L;
            }
            return 0L;
        }
    }
}
