using System;
using System.Collections.Generic;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Production;
using NUnit.Framework;

namespace GuildsAndEmpires.Tests.EditMode
{
    /// <summary>
    /// Tests de caractérisation du parsing Firebase client (ÉTAPE 19.3, TD-015).
    /// Ils figent le comportement ACTUEL, cas permissifs compris (arrondi, repli sur la valeur par défaut,
    /// troncature (int)) : un test rouge signale un changement de comportement, pas un bug à corriger ici.
    /// Ils n'appellent que des points d'entrée qui survivent à la consolidation : primitives de
    /// Core.FirebaseParsingHelpers (sauf RequireDict, testé à travers chaque Parse) et les Parse publics.
    /// </summary>
    public class FirebaseParsingCharacterizationTests
    {
        private const long Fallback = -1L;

        // ── Constructeurs de payloads (format wire du SDK : Dictionary<object,object>, entiers en long) ──

        private static Dictionary<object, object> D(params object[] kv)
        {
            var d = new Dictionary<object, object>();
            for (var i = 0; i < kv.Length; i += 2) d[kv[i]] = kv[i + 1];
            return d;
        }

        private static Dictionary<string, object> S(params object[] kv)
        {
            var d = new Dictionary<string, object>();
            for (var i = 0; i < kv.Length; i += 2) d[(string)kv[i]] = kv[i + 1];
            return d;
        }

        private static Dictionary<object, object> Stack(object quantity, object cap, object upgradesApplied) =>
            D("quantity", quantity, "cap", cap, "upgradesApplied", upgradesApplied);

        private static Dictionary<object, object> Inventory() =>
            D("logs",               Stack(10L, 50L, 0L),
              "planks",             Stack(3L,  30L, 1L),
              "reconstructionKits", Stack(1L,  10L, 2L));

        private static Dictionary<object, object> Ts(object seconds, object nanoseconds) =>
            D("_seconds", seconds, "_nanoseconds", nanoseconds);

        private static Dictionary<object, object> ActiveSlot() =>
            D("slotIndex", 0L, "recipeId", "logs",
              "startedAt", Ts(1700000000L, 500000000L), "lastProcessedAt", Ts(1700000100L, 0L));

        private static Dictionary<object, object> IdleSlot() =>
            D("slotIndex", 1L, "recipeId", null, "startedAt", null, "lastProcessedAt", null);

        private static Dictionary<object, object> Building(params object[] extra)
        {
            var b = D("buildingType", "sawmill", "level", 2L,
                      "slots", new List<object> { ActiveSlot(), IdleSlot() });
            for (var i = 0; i < extra.Length; i += 2) b[extra[i]] = extra[i + 1];
            return b;
        }

        private static Dictionary<object, object> LoginRoot(Dictionary<object, object> player, object buildings = null) =>
            D("player", player, "buildings", buildings ?? new List<object>(), "activeContracts", new List<object>());

        private static Dictionary<object, object> Player(params object[] extra)
        {
            var p = D("inventory", Inventory());
            for (var i = 0; i < extra.Length; i += 2) p[extra[i]] = extra[i + 1];
            return p;
        }

        private static void AssertStack(ResourceStack s, int quantity, int cap, int upgradesApplied)
        {
            Assert.AreEqual(quantity, s.Quantity);
            Assert.AreEqual(cap, s.Cap);
            Assert.AreEqual(upgradesApplied, s.UpgradesApplied);
        }

        private static void AssertDefaultInventory(InventoryState inv)
        {
            AssertStack(inv.Logs, 10, 50, 0);
            AssertStack(inv.Planks, 3, 30, 1);
            AssertStack(inv.ReconstructionKits, 1, 10, 2);
        }

        private static void AssertDefaultBuilding(BuildingSnapshot b)
        {
            Assert.AreEqual("sawmill", b.BuildingType);
            Assert.AreEqual(2, b.Level);
            Assert.AreEqual(2, b.Slots.Count);
            Assert.AreEqual(0, b.Slots[0].SlotIndex);
            Assert.AreEqual("logs", b.Slots[0].RecipeId);
            Assert.AreEqual(1700000000500L, b.Slots[0].StartedAtMs);
            Assert.AreEqual(1700000100000L, b.Slots[0].LastProcessedAtMs);
            Assert.AreEqual(1, b.Slots[1].SlotIndex);
            Assert.IsNull(b.Slots[1].RecipeId);
            Assert.AreEqual(0L, b.Slots[1].StartedAtMs);
            Assert.AreEqual(0L, b.Slots[1].LastProcessedAtMs);
        }

        private static void AssertFormat(string expectedMessage, TestDelegate parse)
        {
            var ex = Assert.Throws<FormatException>(parse);
            Assert.AreEqual(expectedMessage, ex.Message);
        }

        // ── Primitives Core : dictionnaire nul ────────────────────────────────

        [Test]
        public void Primitives_NullDict_ThrowNullReferenceException()
        {
            Assert.Throws<NullReferenceException>(() => FirebaseParsingHelpers.GetValue(null, "k"));
            Assert.Throws<NullReferenceException>(() => FirebaseParsingHelpers.GetString(null, "k", "x"));
            Assert.Throws<NullReferenceException>(() => FirebaseParsingHelpers.GetLong(null, "k", Fallback));
            Assert.Throws<NullReferenceException>(() => FirebaseParsingHelpers.GetBool(null, "k", true));
        }

        // ── GetValue ──────────────────────────────────────────────────────────

        [Test]
        public void GetValue_ReturnsStoredInstance_OrNull()
        {
            var inner = D();
            var d = D("present", inner, "nullValue", null);
            Assert.AreSame(inner, FirebaseParsingHelpers.GetValue(d, "present"));
            Assert.IsNull(FirebaseParsingHelpers.GetValue(d, "nullValue"));
            Assert.IsNull(FirebaseParsingHelpers.GetValue(d, "absent"));
        }

        // ── GetString : seule une string est lue ──────────────────────────────

        [Test]
        public void GetString_ReadsOnlyStrings()
        {
            var d = D("s", "abc", "empty", "", "number", 42L, "boolean", true, "nullValue", null);
            Assert.AreEqual("abc", FirebaseParsingHelpers.GetString(d, "s", "fb"));
            Assert.AreEqual("", FirebaseParsingHelpers.GetString(d, "empty", "fb"));
            Assert.AreEqual("fb", FirebaseParsingHelpers.GetString(d, "number", "fb"));
            Assert.AreEqual("fb", FirebaseParsingHelpers.GetString(d, "boolean", "fb"));
            Assert.AreEqual("fb", FirebaseParsingHelpers.GetString(d, "nullValue", "fb"));
            Assert.AreEqual("fb", FirebaseParsingHelpers.GetString(d, "absent", "fb"));
        }

        // ── GetBool : seul un bool est lu ─────────────────────────────────────

        [Test]
        public void GetBool_ReadsOnlyBooleans()
        {
            var d = D("t", true, "f", false, "text", "true", "number", 1L, "nullValue", null);
            Assert.IsTrue(FirebaseParsingHelpers.GetBool(d, "t", false));
            Assert.IsFalse(FirebaseParsingHelpers.GetBool(d, "f", true));
            Assert.IsTrue(FirebaseParsingHelpers.GetBool(d, "text", true));
            Assert.IsFalse(FirebaseParsingHelpers.GetBool(d, "text", false));
            Assert.IsTrue(FirebaseParsingHelpers.GetBool(d, "number", true));
            Assert.IsTrue(FirebaseParsingHelpers.GetBool(d, "nullValue", true));
            Assert.IsTrue(FirebaseParsingHelpers.GetBool(d, "absent", true));
        }

        // ── GetLong : Convert.ToInt64, repli sur la valeur par défaut si exception ──

        [TestCase(42L, 42L)]
        [TestCase(42, 42L)]
        [TestCase(long.MaxValue, long.MaxValue)]
        [TestCase(-7L, -7L)]
        [TestCase(7.0d, 7L)]
        [TestCase(2.5d, 2L)]
        [TestCase(3.5d, 4L)]
        [TestCase(-2.5d, -2L)]
        [TestCase(2.6d, 3L)]
        [TestCase(2.4d, 2L)]
        [TestCase("42", 42L)]
        [TestCase("abc", Fallback)]
        [TestCase("2.5", Fallback)]
        [TestCase(true, 1L)]
        [TestCase(false, 0L)]
        [TestCase(1e20d, Fallback)]
        [TestCase(ulong.MaxValue, Fallback)]
        [TestCase(double.NaN, Fallback)]
        [TestCase(double.PositiveInfinity, Fallback)]
        public void GetLong_CurrentConversion(object raw, long expected)
        {
            Assert.AreEqual(expected, FirebaseParsingHelpers.GetLong(D("k", raw), "k", Fallback));
        }

        [Test]
        public void GetLong_AbsentNullOrInconvertible_ReturnsFallback()
        {
            var d = D("nullValue", null, "dict", D(), "list", new List<object> { 1L });
            Assert.AreEqual(Fallback, FirebaseParsingHelpers.GetLong(d, "absent", Fallback));
            Assert.AreEqual(Fallback, FirebaseParsingHelpers.GetLong(d, "nullValue", Fallback));
            Assert.AreEqual(Fallback, FirebaseParsingHelpers.GetLong(d, "dict", Fallback));
            Assert.AreEqual(Fallback, FirebaseParsingHelpers.GetLong(d, "list", Fallback));
        }

        // ── RequireDict, foyer « PlayerStateSnapshot » (resolveLoginState) ────

        [Test]
        public void Login_RequireDict_ExactMessages()
        {
            AssertFormat("PlayerStateSnapshot: expected dict for 'response root', got null",
                () => PlayerStateSnapshot.Parse(null));
            AssertFormat("PlayerStateSnapshot: expected dict for 'response root', got Int64",
                () => PlayerStateSnapshot.Parse(42L));
            AssertFormat("PlayerStateSnapshot: expected dict for 'player', got null",
                () => PlayerStateSnapshot.Parse(D()));
            AssertFormat("PlayerStateSnapshot: expected dict for 'inventory', got String",
                () => PlayerStateSnapshot.Parse(LoginRoot(D("inventory", "x"))));

            var noLogs = Inventory();
            noLogs.Remove("logs");
            AssertFormat("PlayerStateSnapshot: expected dict for 'logs', got null",
                () => PlayerStateSnapshot.Parse(LoginRoot(D("inventory", noLogs))));

            var badKits = Inventory();
            badKits["reconstructionKits"] = new List<object>();
            AssertFormat("PlayerStateSnapshot: expected dict for 'reconstructionKits', got List`1",
                () => PlayerStateSnapshot.Parse(LoginRoot(D("inventory", badKits))));
        }

        [Test]
        public void Login_StringKeyedDictionaries_AreAccepted()
        {
            var inventory = S("logs",               S("quantity", 10L, "cap", 50L, "upgradesApplied", 0L),
                              "planks",             S("quantity", 3L,  "cap", 30L, "upgradesApplied", 1L),
                              "reconstructionKits", S("quantity", 1L,  "cap", 10L, "upgradesApplied", 2L));
            var root = S("player", S("gold", 7L, "inventory", inventory));

            var snapshot = PlayerStateSnapshot.Parse(root);

            Assert.AreEqual(7L, snapshot.Player.Gold);
            AssertDefaultInventory(snapshot.Player.Inventory);
        }

        // ── RequireDict, foyer « Production » (startProductionSlot, collectProduction) ──

        [Test]
        public void Production_RequireDict_ExactMessages()
        {
            AssertFormat("Production: expected dict for 'response root', got null",
                () => ProductionResult.Parse(null, "sawmill_0"));
            AssertFormat("Production: expected dict for 'response root', got String",
                () => ProductionResult.Parse("x", "sawmill_0"));
            AssertFormat("Production: expected dict for 'building', got null",
                () => ProductionResult.Parse(D("inventory", Inventory()), "sawmill_0"));
            AssertFormat("Production: expected dict for 'inventory', got null",
                () => ProductionResult.Parse(D("building", Building()), "sawmill_0"));

            var noPlanks = Inventory();
            noPlanks.Remove("planks");
            AssertFormat("Production: expected dict for 'planks', got null",
                () => ProductionResult.Parse(D("building", Building(), "inventory", noPlanks), "sawmill_0"));
        }

        [Test]
        public void Collect_RequireDict_ExactMessages()
        {
            AssertFormat("Production: expected dict for 'response root', got null",
                () => CollectProductionResult.Parse(null, "sawmill_0"));
            AssertFormat("Production: expected dict for 'building', got Int64",
                () => CollectProductionResult.Parse(D("building", 5L, "inventory", Inventory()), "sawmill_0"));

            var badKits = Inventory();
            badKits["reconstructionKits"] = 5L;
            AssertFormat("Production: expected dict for 'reconstructionKits', got Int64",
                () => CollectProductionResult.Parse(D("building", Building(), "inventory", badKits), "sawmill_0"));
        }

        [Test]
        public void Production_StringKeyedDictionaries_AreAccepted()
        {
            var root = S("building", S("buildingType", "sawmill", "level", 2L),
                         "inventory", S("logs",               S("quantity", 10L, "cap", 50L, "upgradesApplied", 0L),
                                        "planks",             S("quantity", 3L,  "cap", 30L, "upgradesApplied", 1L),
                                        "reconstructionKits", S("quantity", 1L,  "cap", 10L, "upgradesApplied", 2L)));

            var result = ProductionResult.Parse(root, "sawmill_0");

            Assert.AreEqual("sawmill", result.Building.BuildingType);
            Assert.AreEqual(2, result.Building.Level);
            AssertDefaultInventory(result.Inventory);
        }

        // ── RequireDict, foyer « Firebase » (marché, vente) ───────────────────

        [Test]
        public void Sell_RequireDict_ExactMessages()
        {
            AssertFormat("Firebase: expected dict for 'response root', got null",
                () => SellToMarketResult.Parse(null));
            AssertFormat("Firebase: expected dict for 'response root', got Boolean",
                () => SellToMarketResult.Parse(true));
            AssertFormat("Firebase: expected dict for 'inventory', got null",
                () => SellToMarketResult.Parse(D("goldEarned", 5L)));

            var noLogs = Inventory();
            noLogs.Remove("logs");
            AssertFormat("Firebase: expected dict for 'logs', got null",
                () => SellToMarketResult.Parse(D("inventory", noLogs)));
        }

        [Test]
        public void Market_RequireDict_ExactMessages()
        {
            AssertFormat("Firebase: expected dict for 'marketState root', got null",
                () => MarketStateSnapshot.Parse(null));
            AssertFormat("Firebase: expected dict for 'prices', got null",
                () => MarketStateSnapshot.Parse(S()));
            AssertFormat("Firebase: expected dict for 'planks', got Int64",
                () => MarketStateSnapshot.Parse(S("prices", S("logs", S(), "planks", 5L, "reconstructionKits", S()))));
        }

        [Test]
        public void Sell_StringKeyedDictionaries_AreAccepted()
        {
            var root = S("goldEarned", 5L,
                         "inventory", S("logs",               S("quantity", 10L, "cap", 50L, "upgradesApplied", 0L),
                                        "planks",             S("quantity", 3L,  "cap", 30L, "upgradesApplied", 1L),
                                        "reconstructionKits", S("quantity", 1L,  "cap", 10L, "upgradesApplied", 2L)));

            var result = SellToMarketResult.Parse(root);

            Assert.AreEqual(5, result.GoldEarned);
            AssertDefaultInventory(result.Inventory);
        }

        // ── Connexion : valeurs valides, valeurs par défaut, cas permissifs ───

        [Test]
        public void Login_FullPayload_ParsesEveryField()
        {
            var player = Player("displayName", "Marchande", "gold", 1234L, "imperialFavor", 56L,
                                "favorRank", "imperial_supplier",
                                "guildCharterUnlocked", true, "firstContractCompleted", true);
            var root = LoginRoot(player, new List<object> { Building("id", "sawmill_0") });
            root["activeContracts"] = new List<object> { D(), D() };

            var snapshot = PlayerStateSnapshot.Parse(root, "uid-1");

            Assert.AreEqual("Marchande", snapshot.Player.DisplayName);
            Assert.AreEqual(1234L, snapshot.Player.Gold);
            Assert.AreEqual(56L, snapshot.Player.ImperialFavor);
            Assert.AreEqual("imperial_supplier", snapshot.Player.FavorRank);
            Assert.IsTrue(snapshot.Player.GuildCharterUnlocked);
            Assert.IsTrue(snapshot.Player.FirstContractCompleted);
            AssertDefaultInventory(snapshot.Player.Inventory);
            Assert.AreEqual(1, snapshot.BuildingCount);
            Assert.AreEqual("sawmill_0", snapshot.Buildings[0].Id);
            AssertDefaultBuilding(snapshot.Buildings[0]);
            Assert.AreEqual(2, snapshot.ActiveContractCount);
            Assert.AreEqual("uid-1", snapshot.Uid);
        }

        [Test]
        public void Login_MinimalPayload_UsesDefaults()
        {
            var snapshot = PlayerStateSnapshot.Parse(D("player", Player()));

            Assert.AreEqual("Marchand", snapshot.Player.DisplayName);
            Assert.AreEqual(0L, snapshot.Player.Gold);
            Assert.AreEqual(0L, snapshot.Player.ImperialFavor);
            Assert.AreEqual("local_supplier", snapshot.Player.FavorRank);
            Assert.IsFalse(snapshot.Player.GuildCharterUnlocked);
            Assert.IsFalse(snapshot.Player.FirstContractCompleted);
            Assert.AreEqual(0, snapshot.BuildingCount);
            Assert.AreEqual(0, snapshot.ActiveContractCount);
            Assert.AreEqual(string.Empty, snapshot.Uid);
        }

        [Test]
        public void Login_PermissiveNumbers_AreRoundedTruncatedOrDefaulted()
        {
            var inventory = Inventory();
            inventory["logs"] = Stack(3.5d, 4294967297L, "abc");
            var player = Player("gold", 2.5d, "imperialFavor", "abc", "displayName", 5L);
            player["inventory"] = inventory;

            var snapshot = PlayerStateSnapshot.Parse(LoginRoot(player));

            Assert.AreEqual(2L, snapshot.Player.Gold);
            Assert.AreEqual(0L, snapshot.Player.ImperialFavor);
            Assert.AreEqual("Marchand", snapshot.Player.DisplayName);
            AssertStack(snapshot.Player.Inventory.Logs, 4, 1, 0);
        }

        // ── ParseBuilding : origine de l'identifiant ──────────────────────────

        [Test]
        public void ParseBuilding_Login_IdComesFromIdField()
        {
            var buildings = new List<object>
            {
                Building("id", "sawmill_0"),
                Building(),
                Building("id", 5L),
            };

            var snapshot = PlayerStateSnapshot.Parse(LoginRoot(Player(), buildings), "uid-1");

            Assert.AreEqual(3, snapshot.BuildingCount);
            Assert.AreEqual("sawmill_0", snapshot.Buildings[0].Id);
            Assert.AreEqual(string.Empty, snapshot.Buildings[1].Id);
            Assert.AreEqual(string.Empty, snapshot.Buildings[2].Id);
            AssertDefaultBuilding(snapshot.Buildings[1]);
        }

        [Test]
        public void ParseBuilding_Production_IdComesFromParameter()
        {
            var root = D("building", Building("id", "ignored_id"), "inventory", Inventory());

            var started = ProductionResult.Parse(root, "sawmill_0");
            var collected = CollectProductionResult.Parse(root, "sawmill_1");
            var withoutId = ProductionResult.Parse(root, null);

            Assert.AreEqual("sawmill_0", started.Building.Id);
            Assert.AreEqual("sawmill_1", collected.Building.Id);
            Assert.IsNull(withoutId.Building.Id);
            AssertDefaultBuilding(started.Building);
            AssertDefaultInventory(started.Inventory);
        }

        // ── Bâtiments et slots : entrées ignorées, valeurs par défaut ─────────

        [Test]
        public void Login_NonObjectDictBuildingsAndSlots_AreSkipped()
        {
            var building = Building("id", "sawmill_0");
            building["slots"] = new List<object> { 5L, S("slotIndex", 2L), ActiveSlot() };
            var buildings = new List<object> { S("id", "string_keyed"), "x", building };

            var snapshot = PlayerStateSnapshot.Parse(LoginRoot(Player(), buildings));

            Assert.AreEqual(1, snapshot.BuildingCount);
            Assert.AreEqual("sawmill_0", snapshot.Buildings[0].Id);
            Assert.AreEqual(1, snapshot.Buildings[0].Slots.Count);
            Assert.AreEqual("logs", snapshot.Buildings[0].Slots[0].RecipeId);
        }

        [Test]
        public void Login_BuildingsAndContractsNotLists_AreIgnored()
        {
            var root = LoginRoot(Player(), D("0", Building()));
            root["activeContracts"] = D("a", D());

            var snapshot = PlayerStateSnapshot.Parse(root);

            Assert.AreEqual(0, snapshot.BuildingCount);
            Assert.AreEqual(0, snapshot.ActiveContractCount);
        }

        [Test]
        public void Production_BuildingAndSlotDefaults()
        {
            var building = D("slots", new List<object>
            {
                D("slotIndex", "x", "recipeId", 5L, "startedAt", S("_seconds", 1L), "lastProcessedAt", "123"),
                D("slotIndex", 2.5d, "startedAt", Ts(2.5d, 1500000L), "lastProcessedAt", Ts(1L, null)),
            });

            var result = ProductionResult.Parse(D("building", building, "inventory", Inventory()), "sawmill_0");

            Assert.AreEqual(string.Empty, result.Building.BuildingType);
            Assert.AreEqual(1, result.Building.Level);
            Assert.AreEqual(2, result.Building.Slots.Count);
            Assert.AreEqual(0, result.Building.Slots[0].SlotIndex);
            Assert.IsNull(result.Building.Slots[0].RecipeId);
            Assert.AreEqual(0L, result.Building.Slots[0].StartedAtMs);
            Assert.AreEqual(0L, result.Building.Slots[0].LastProcessedAtMs);
            Assert.AreEqual(2, result.Building.Slots[1].SlotIndex);
            Assert.IsNull(result.Building.Slots[1].RecipeId);
            Assert.AreEqual(2001L, result.Building.Slots[1].StartedAtMs);
            Assert.AreEqual(1000L, result.Building.Slots[1].LastProcessedAtMs);
        }

        [Test]
        public void Production_LevelOverflow_FallsBackToOne()
        {
            var result = ProductionResult.Parse(
                D("building", Building("level", 1e20d), "inventory", Inventory()), "sawmill_0");

            Assert.AreEqual(1, result.Building.Level);
        }

        // ── Collecte : collected / discarded ──────────────────────────────────

        [Test]
        public void Collect_ResourceMaps()
        {
            var root = D("building", Building(), "inventory", Inventory(),
                         "collected", D("logs", 3L, "planks", 2.5d, 7, 9L, "reconstructionKits", "abc"),
                         "discarded", S("logs", 4L));

            var result = CollectProductionResult.Parse(root, "sawmill_0");

            Assert.AreEqual(3, result.Collected.Count);
            Assert.AreEqual(3, result.Collected["logs"]);
            Assert.AreEqual(2, result.Collected["planks"]);
            Assert.AreEqual(0, result.Collected["reconstructionKits"]);
            Assert.AreEqual(0, result.Discarded.Count);
            AssertDefaultBuilding(result.Building);
            AssertDefaultInventory(result.Inventory);
        }

        [Test]
        public void Collect_AbsentMaps_AreEmpty()
        {
            var result = CollectProductionResult.Parse(D("building", Building(), "inventory", Inventory()), "sawmill_0");

            Assert.AreEqual(0, result.Collected.Count);
            Assert.AreEqual(0, result.Discarded.Count);
        }

        // ── Vente ─────────────────────────────────────────────────────────────

        [Test]
        public void Sell_FullPayload_ParsesEveryField()
        {
            var result = SellToMarketResult.Parse(D("goldEarned", 5L, "priceApplied", 5L, "newGold", 105L,
                                                    "alreadySold", true, "inventory", Inventory()));

            Assert.AreEqual(5, result.GoldEarned);
            Assert.AreEqual(5, result.PriceApplied);
            Assert.AreEqual(105, result.NewGold);
            Assert.IsTrue(result.AlreadySold);
            AssertDefaultInventory(result.Inventory);
        }

        [Test]
        public void Sell_DefaultsAndPermissiveValues()
        {
            var result = SellToMarketResult.Parse(D("priceApplied", 3.5d, "newGold", "abc",
                                                    "alreadySold", "true", "inventory", Inventory()));

            Assert.AreEqual(0, result.GoldEarned);
            Assert.AreEqual(4, result.PriceApplied);
            Assert.AreEqual(0, result.NewGold);
            Assert.IsFalse(result.AlreadySold);
        }

        // ── Marché ────────────────────────────────────────────────────────────

        [Test]
        public void Market_Prices()
        {
            var data = S("prices", S("logs",               S("currentPrice", 5L, "trend", "up"),
                                     "planks",             D("currentPrice", 3.5d, "trend", 5L),
                                     "reconstructionKits", S()));

            var snapshot = MarketStateSnapshot.Parse(data);

            Assert.AreEqual(3, snapshot.Prices.Count);
            Assert.AreEqual(5, snapshot.Prices["logs"].CurrentPrice);
            Assert.AreEqual("up", snapshot.Prices["logs"].Trend);
            Assert.AreEqual(4, snapshot.Prices["planks"].CurrentPrice);
            Assert.AreEqual("stable", snapshot.Prices["planks"].Trend);
            Assert.AreEqual(0, snapshot.Prices["reconstructionKits"].CurrentPrice);
            Assert.AreEqual("stable", snapshot.Prices["reconstructionKits"].Trend);
        }
    }
}
