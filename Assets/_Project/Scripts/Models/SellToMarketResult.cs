using GuildsAndEmpires.Core;

namespace GuildsAndEmpires.Models
{
    /// <summary>
    /// Résultat de SellToMarketAsync : gold gagné, prix appliqué, nouvel or total,
    /// flag idempotence et inventaire mis à jour (POST-mutation, côté serveur).
    /// </summary>
    public sealed class SellToMarketResult
    {
        public int           GoldEarned   { get; }
        public int           PriceApplied { get; }
        public int           NewGold      { get; }
        public bool          AlreadySold  { get; }
        public InventoryState Inventory   { get; }

        public SellToMarketResult(
            int goldEarned, int priceApplied, int newGold, bool alreadySold, InventoryState inventory)
        {
            GoldEarned   = goldEarned;
            PriceApplied = priceApplied;
            NewGold      = newGold;
            AlreadySold  = alreadySold;
            Inventory    = inventory;
        }

        // ── Parse from HttpsCallableResult.Data ───────────────────────────────
        // Réponse CF : { goldEarned, priceApplied, newGold, alreadySold, inventory: InventoryState }
        // Wire : Dictionary<object,object>, entiers boxés en long.

        public static SellToMarketResult Parse(object data)
        {
            var root = FirebaseParsingHelpers.RequireDict(data, "response root");

            var goldEarned   = (int)FirebaseParsingHelpers.GetLong(root, "goldEarned",   0L);
            var priceApplied = (int)FirebaseParsingHelpers.GetLong(root, "priceApplied", 0L);
            var newGold      = (int)FirebaseParsingHelpers.GetLong(root, "newGold",      0L);
            var alreadySold  = FirebaseParsingHelpers.GetBool(root, "alreadySold", false);

            var inventoryDict = FirebaseParsingHelpers.RequireDict(
                                    FirebaseParsingHelpers.GetValue(root, "inventory"), "inventory");
            var inventory = InventoryParsingHelpers.ParseInventory(inventoryDict);

            return new SellToMarketResult(goldEarned, priceApplied, newGold, alreadySold, inventory);
        }
    }
}
