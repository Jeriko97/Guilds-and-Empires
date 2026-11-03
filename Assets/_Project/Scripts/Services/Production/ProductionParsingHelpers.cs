using System.Collections.Generic;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Production
{
    internal static class ProductionParsingHelpers
    {
        // Préfixe des messages de RequireDict pour les réponses de startProductionSlot, collectProduction et stopProductionSlot.
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
            // Compteurs de lot (D-ETAPE19-001) : absents ou null pour les logs → null ; 0 est une valeur réelle.
            var cyclesPlanned     = ParseOptionalInt(d, "cyclesPlanned");
            var cyclesProcessed   = ParseOptionalInt(d, "cyclesProcessed");
            return new SlotSnapshot(slotIndex, recipeId, startedAtMs, lastProcessedAtMs, cyclesPlanned, cyclesProcessed);
        }

        // GetLong ne distingue pas un champ absent de 0 : test explicite de null avant la conversion.
        private static int? ParseOptionalInt(Dictionary<object, object> d, string key) =>
            FirebaseParsingHelpers.GetValue(d, key) == null ? null : (int)FirebaseParsingHelpers.GetLong(d, key, 0L);

        // collected/discarded/refunded/refundDiscarded wire : Dictionary<object,object> clé ResourceKey → long boxé
        // (D-ETAPE17.A-2). Entrées à 0 conservées : le filtrage est un choix d'affichage (19.4c).
        internal static IReadOnlyDictionary<string, int> ParseResourceMap(object raw)
        {
            var result = new Dictionary<string, int>();
            if (raw is Dictionary<object, object> d)
                foreach (var kv in d)
                    if (kv.Key is string key)
                        result[key] = (int)FirebaseParsingHelpers.GetLong(d, key, 0L);
            return result;
        }
    }
}
