using System.Collections.Generic;
using System.Collections.ObjectModel;
using GuildsAndEmpires.Core;

namespace GuildsAndEmpires.Models
{
    public sealed class ResourcePriceView
    {
        public int    CurrentPrice { get; }
        public string Trend        { get; }

        public ResourcePriceView(int currentPrice, string trend)
        {
            CurrentPrice = currentPrice;
            Trend        = trend;
        }
    }

    public sealed class MarketStateSnapshot
    {
        /// <summary>
        /// Prix par resourceType. Clés : "logs", "planks", "reconstructionKits".
        /// Source : EconomyResourceKeys.
        /// </summary>
        public IReadOnlyDictionary<string, ResourcePriceView> Prices { get; }

        public MarketStateSnapshot(IReadOnlyDictionary<string, ResourcePriceView> prices)
        {
            Prices = prices;
        }

        /// <summary>
        /// Parse depuis DocumentSnapshot.ToDictionary() — clés string, valeurs boxées.
        /// Appelé uniquement par FirebaseMarketService après vérification snapshot.Exists.
        /// </summary>
        public static MarketStateSnapshot Parse(Dictionary<string, object> data)
        {
            var root       = FirebaseParsingHelpers.RequireDict(data, "marketState root");
            var pricesRaw  = FirebaseParsingHelpers.RequireDict(
                                 FirebaseParsingHelpers.GetValue(root, "prices"), "prices");

            var prices = new Dictionary<string, ResourcePriceView>();
            foreach (var key in new[] { EconomyResourceKeys.LOGS, EconomyResourceKeys.PLANKS, EconomyResourceKeys.RECONSTRUCTION_KITS })
            {
                var priceDict = FirebaseParsingHelpers.RequireDict(
                                    FirebaseParsingHelpers.GetValue(pricesRaw, key), key);
                var currentPrice = (int)FirebaseParsingHelpers.GetLong(priceDict, "currentPrice", 0L);
                var trend        = FirebaseParsingHelpers.GetString(priceDict, "trend", "stable");
                prices[key]      = new ResourcePriceView(currentPrice, trend);
            }

            return new MarketStateSnapshot(new ReadOnlyDictionary<string, ResourcePriceView>(prices));
        }
    }
}
