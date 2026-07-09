using GuildsAndEmpires.Core;

namespace GuildsAndEmpires.Models
{
    internal static class InventoryParsingHelpers
    {
        internal static InventoryState ParseInventory(System.Collections.Generic.Dictionary<object, object> d)
        {
            return new InventoryState(
                ParseResourceStack(FirebaseParsingHelpers.RequireDict(
                    FirebaseParsingHelpers.GetValue(d, EconomyResourceKeys.LOGS),               EconomyResourceKeys.LOGS)),
                ParseResourceStack(FirebaseParsingHelpers.RequireDict(
                    FirebaseParsingHelpers.GetValue(d, EconomyResourceKeys.PLANKS),             EconomyResourceKeys.PLANKS)),
                ParseResourceStack(FirebaseParsingHelpers.RequireDict(
                    FirebaseParsingHelpers.GetValue(d, EconomyResourceKeys.RECONSTRUCTION_KITS), EconomyResourceKeys.RECONSTRUCTION_KITS))
            );
        }

        internal static ResourceStack ParseResourceStack(System.Collections.Generic.Dictionary<object, object> d)
        {
            return new ResourceStack(
                quantity:        (int)FirebaseParsingHelpers.GetLong(d, "quantity",        0L),
                cap:             (int)FirebaseParsingHelpers.GetLong(d, "cap",             0L),
                upgradesApplied: (int)FirebaseParsingHelpers.GetLong(d, "upgradesApplied", 0L)
            );
        }
    }
}
