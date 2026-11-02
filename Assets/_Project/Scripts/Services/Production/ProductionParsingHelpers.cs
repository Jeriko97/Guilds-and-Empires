using System.Collections.Generic;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Production
{
    internal static class ProductionParsingHelpers
    {
        // Préfixe des messages de RequireDict pour les réponses de startProductionSlot et collectProduction.
        internal const string ParseContext = "Production";

        // buildingId : fourni par l'appelant (paramètre de la CF en production, champ "id" à la connexion).
        internal static BuildingSnapshot ParseBuilding(Dictionary<object, object> d, string buildingId)
        {
            var buildingType = FirebaseParsingHelpers.GetString(d, "buildingType", string.Empty);
            var level        = (int)FirebaseParsingHelpers.GetLong(d, "level", 1L);

            var slots = new List<SlotSnapshot>();
            if (d.TryGetValue("slots", out var rawSlots) && rawSlots is IList<object> sl)
                foreach (var s in sl)
                    if (s is Dictionary<object, object> sd)
                        slots.Add(ParseSlot(sd));

            return new BuildingSnapshot(buildingId, buildingType, level, slots.AsReadOnly());
        }

        internal static SlotSnapshot ParseSlot(Dictionary<object, object> d)
        {
            var slotIndex         = (int)FirebaseParsingHelpers.GetLong(d, "slotIndex", 0L);
            var recipeId          = FirebaseParsingHelpers.GetValue(d, "recipeId") as string;
            var startedAtMs       = PlayerStateSnapshot.ParseTimestampMs(FirebaseParsingHelpers.GetValue(d, "startedAt"));
            var lastProcessedAtMs = PlayerStateSnapshot.ParseTimestampMs(FirebaseParsingHelpers.GetValue(d, "lastProcessedAt"));
            return new SlotSnapshot(slotIndex, recipeId, startedAtMs, lastProcessedAtMs);
        }
    }
}
