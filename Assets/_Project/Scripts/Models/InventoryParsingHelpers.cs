using GuildsAndEmpires.Core;

namespace GuildsAndEmpires.Models
{
    internal static class InventoryParsingHelpers
    {
        // context : préfixe des messages de RequireDict, celui de l'appelant (voir FirebaseParsingHelpers.RequireDict).
        internal static InventoryState ParseInventory(System.Collections.Generic.Dictionary<object, object> d, string context)
        {
            return new InventoryState(
                ParseResourceStack(FirebaseParsingHelpers.RequireDict(
                    FirebaseParsingHelpers.GetValue(d, EconomyResourceKeys.LOGS),               EconomyResourceKeys.LOGS,               context)),
                ParseResourceStack(FirebaseParsingHelpers.RequireDict(
                    FirebaseParsingHelpers.GetValue(d, EconomyResourceKeys.PLANKS),             EconomyResourceKeys.PLANKS,             context)),
                ParseResourceStack(FirebaseParsingHelpers.RequireDict(
                    FirebaseParsingHelpers.GetValue(d, EconomyResourceKeys.RECONSTRUCTION_KITS), EconomyResourceKeys.RECONSTRUCTION_KITS, context))
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
