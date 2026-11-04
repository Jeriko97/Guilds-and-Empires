using System;
using System.Collections.Generic;
using System.Globalization;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Production;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>Avancement estimé d'un lot actif (affichage seulement).</summary>
    public readonly struct SlotEstimate
    {
        /// <summary>k : cycles du lot estimés finis, plafonné à <see cref="Planned"/>.</summary>
        public readonly int Cycle;

        /// <summary>N : cycles du lot (<c>cyclesPlanned</c> du serveur).</summary>
        public readonly int Planned;

        /// <summary>Temps restant estimé avant la fin du lot, en ms, planché à 0.</summary>
        public readonly long RemainingMs;

        public SlotEstimate(int cycle, int planned, long remainingMs)
        {
            Cycle       = cycle;
            Planned     = planned;
            RemainingMs = remainingMs;
        }

        /// <summary>Lot estimé fini (k = N, restant = 0) : « Lot terminé — collecter ».</summary>
        public bool IsFinished => RemainingMs <= 0;
    }

    /// <summary>
    /// Calcul pur du slot actif et des résumés de la production (19.4c-2) : estimation « lot k/N » et temps restant,
    /// formats, filtrage des entrées à 0, résumés de collecte et d'arrêt, libellé de l'intention d'arrêt. Aucune
    /// dépendance à Unity ni à Firebase.
    ///
    /// AFFICHAGE SEULEMENT (D-ETAPE19-010 options A ; arbitrage D-ETAPE19-013 ; doctrine C1, règle 3) : l'estimation
    /// repose sur l'horloge locale, falsifiable. Rien de ce qui est calculé ici n'est écrit dans le store ni envoyé au
    /// serveur, et aucune action n'est bloquée ni débloquée par l'estimation : le serveur tranche à la collecte et à
    /// l'arrêt. L'estimation est recalculée à chaque appel depuis le <see cref="SlotSnapshot"/> du store et la copie
    /// des recettes (<see cref="ProductionRecipes"/>) : aucun compteur local.
    /// </summary>
    public static class ProductionSlotProgress
    {
        private const long MillisecondsPerMinute = 60_000L;
        private const string SummaryLineSeparator = "\n";

        // Ordre fixe des ressources dans une ligne de résumé (chaîne logs → planks → kits) ; clé inconnue ensuite,
        // par ordre ordinal. Jamais l'ordre d'itération du dictionnaire.
        private static readonly string[] ResourceOrder =
        {
            EconomyResourceKeys.LOGS, EconomyResourceKeys.PLANKS, EconomyResourceKeys.RECONSTRUCTION_KITS,
        };

        // ── Estimation ────────────────────────────────────────────────────────

        /// <summary>
        /// Référence du calcul, même règle que le serveur (<c>slot.lastProcessedAt ?? slot.startedAt</c>,
        /// shared/production.ts:135) : <c>lastProcessedAt</c> vaut null au lancement, lu 0 par le client.
        /// </summary>
        public static long ReferenceMs(SlotSnapshot slot)
        {
            if (slot == null) return 0L;
            return slot.LastProcessedAtMs > 0 ? slot.LastProcessedAtMs : slot.StartedAtMs;
        }

        /// <summary>
        /// Écoulé depuis la référence, en ms, planché à 0 :
        /// <c>(horloge murale à l'ancre − référence) + temps monotone écoulé depuis l'ancre</c>. L'ancre (heure UTC de
        /// l'appareil et horloge monotone) est relevée par l'écran ; entre deux ancres, l'écoulé avance sur l'horloge
        /// monotone.
        /// </summary>
        public static long ElapsedMs(long referenceMs, long anchorWallClockMs, long monotonicSinceAnchorMs) =>
            Math.Max(0L, anchorWallClockMs - referenceMs + monotonicSinceAnchorMs);

        /// <summary>
        /// Estimation d'un lot actif (planks, kits ; options A) :
        /// <c>k = min(cyclesProcessed + ⌊écoulé ÷ durée⌋, cyclesPlanned)</c> ;
        /// <c>restant = (cyclesPlanned − cyclesProcessed) × durée − écoulé</c>, planché à 0.
        /// Aucune estimation (false) si les compteurs ne sont pas cohérents : <c>cyclesPlanned ≥ 1</c>,
        /// <c>0 ≤ cyclesProcessed ≤ cyclesPlanned</c>, recette connue de durée &gt; 0, référence &gt; 0. C'est le
        /// traitement, à l'affichage, de <c>ParseOptionalInt</c> (parsing inchangé, D-ETAPE19-009 / TD-025) ; logs
        /// (compteurs null) : jamais d'estimation.
        /// </summary>
        public static bool TryEstimate(SlotSnapshot slot, RecipeInfo recipe, long elapsedMs, out SlotEstimate estimate)
        {
            estimate = default;
            if (slot == null || recipe == null || recipe.DurationMs <= 0) return false;
            if (!slot.CyclesPlanned.HasValue || !slot.CyclesProcessed.HasValue) return false;

            var planned   = slot.CyclesPlanned.Value;
            var processed = slot.CyclesProcessed.Value;
            if (planned < 1 || processed < 0 || processed > planned) return false;
            if (ReferenceMs(slot) <= 0) return false;

            var elapsed         = Math.Max(0L, elapsedMs);
            var remainingCycles = planned - processed;
            var cyclesElapsed   = elapsed / recipe.DurationMs;
            var cycle           = cyclesElapsed >= remainingCycles ? planned : processed + (int)cyclesElapsed;
            var remainingMs     = Math.Max(0L, remainingCycles * recipe.DurationMs - elapsed);

            estimate = new SlotEstimate(cycle, planned, remainingMs);
            return true;
        }

        /// <summary>
        /// Minutes tronquées affichées pour un restant (même règle que <see cref="ProductionLaunchPlanner.FormatDuration"/>) ;
        /// −1 si le restant est ≤ 0 (lot estimé fini). Sert au tick à ne réécrire le texte que si la valeur change.
        /// </summary>
        public static long DisplayedMinutes(long remainingMs) =>
            remainingMs <= 0 ? -1L : remainingMs / MillisecondsPerMinute;

        // ── Formats ───────────────────────────────────────────────────────────

        /// <summary>« lot k/N » (options A).</summary>
        public static string FormatBatch(int cycle, int planned) =>
            string.Format(CultureInfo.InvariantCulture, PlayerMessages.BatchProgressFormat, cycle, planned);

        /// <summary>
        /// Temps restant (texte 9 ; arbitrage du 2026-11-04 : l'accord suit le nombre affiché), minutes tronquées :
        /// &lt; 60 s → « &lt; 1 min » ; 60 à 119 s → « 1 min restante » ; 2 à 59 min → « N min restantes » ;
        /// ≥ 1 h → « H h MM restantes ». Restant ≤ 0 → « Lot terminé — collecter ».
        /// </summary>
        public static string FormatRemaining(long remainingMs)
        {
            var minutes = DisplayedMinutes(remainingMs);
            if (minutes < 0)  return PlayerMessages.BatchFinished;
            if (minutes == 0) return PlayerMessages.RemainingUnderOneMinute;
            if (minutes == 1) return PlayerMessages.RemainingOneMinute;
            return minutes < 60
                ? string.Format(CultureInfo.InvariantCulture, PlayerMessages.RemainingMinutesFormat, minutes)
                : string.Format(CultureInfo.InvariantCulture, PlayerMessages.RemainingHoursFormat, minutes / 60, minutes % 60);
        }

        // ── Résumés ───────────────────────────────────────────────────────────

        /// <summary>
        /// Entrées non nulles d'une map de ressources, dans l'ordre fixe (logs, planks, kits ; clé inconnue ensuite, par
        /// ordre ordinal). Filtrage à l'affichage seulement : les parsings gardent les zéros. Map null → liste vide.
        /// </summary>
        public static List<KeyValuePair<string, int>> NonZeroOrdered(IReadOnlyDictionary<string, int> map)
        {
            var result = new List<KeyValuePair<string, int>>();
            if (map == null) return result;

            foreach (var key in ResourceOrder)
                if (map.TryGetValue(key, out var quantity) && quantity != 0)
                    result.Add(new KeyValuePair<string, int>(key, quantity));

            var unknown = new List<string>();
            foreach (var kv in map)
                if (kv.Value != 0 && Array.IndexOf(ResourceOrder, kv.Key) < 0)
                    unknown.Add(kv.Key);
            unknown.Sort(string.CompareOrdinal);
            foreach (var key in unknown)
                result.Add(new KeyValuePair<string, int>(key, map[key]));

            return result;
        }

        /// <summary>
        /// Une ligne de résumé (<paramref name="lineFormat"/>, texte 8) : « quantité ressource » séparés par « , »,
        /// noms invariables (<see cref="ProductionLaunchPlanner.ResourceName"/>) ; null si aucune entrée non nulle.
        /// </summary>
        public static string FormatResourceLine(string lineFormat, IReadOnlyDictionary<string, int> map)
        {
            var entries = NonZeroOrdered(map);
            if (entries.Count == 0) return null;

            var parts = new List<string>(entries.Count);
            foreach (var kv in entries)
                parts.Add(string.Format(CultureInfo.InvariantCulture, PlayerMessages.QuantityFormat,
                    kv.Value, ProductionLaunchPlanner.ResourceName(kv.Key)));
            return string.Format(CultureInfo.InvariantCulture, lineFormat,
                string.Join(PlayerMessages.ResourceListSeparator, parts));
        }

        /// <summary>
        /// Résumé de collecte : « Récolté : … » puis « Perdu (stock plein) : … », une ligne par catégorie non vide après
        /// filtrage ; les deux vides → « Rien à récolter pour l'instant. » (texte existant).
        /// </summary>
        public static string BuildCollectSummary(
            IReadOnlyDictionary<string, int> collected, IReadOnlyDictionary<string, int> discarded)
        {
            var lines = new List<string>(2);
            AddLine(lines, PlayerMessages.SummaryCollectedFormat, collected);
            AddLine(lines, PlayerMessages.SummaryDiscardedFormat, discarded);
            return lines.Count == 0 ? PlayerMessages.NothingToCollect : string.Join(SummaryLineSeparator, lines);
        }

        /// <summary>Résumé de collecte tiré de la réponse du serveur.</summary>
        public static string BuildCollectSummary(CollectProductionResult result) =>
            BuildCollectSummary(result?.Collected, result?.Discarded);

        /// <summary>
        /// Résumé d'arrêt (D-ETAPE19-010 Q4, D-ETAPE19-007) : rejeu → « Arrêt déjà enregistré » ; sinon une ligne par
        /// catégorie non vide après filtrage, dans l'ordre « Récolté », « Perdu (stock plein) », « Rendu », « Intrants
        /// perdus (stock plein) ». Toutes vides → chaîne vide (aucun texte nouveau : le slot libéré est le retour visible).
        /// </summary>
        public static string BuildStopSummary(
            bool alreadyApplied,
            IReadOnlyDictionary<string, int> collected,
            IReadOnlyDictionary<string, int> discarded,
            IReadOnlyDictionary<string, int> refunded,
            IReadOnlyDictionary<string, int> refundDiscarded)
        {
            if (alreadyApplied) return PlayerMessages.StopAlreadyApplied;

            var lines = new List<string>(4);
            AddLine(lines, PlayerMessages.SummaryCollectedFormat,       collected);
            AddLine(lines, PlayerMessages.SummaryDiscardedFormat,       discarded);
            AddLine(lines, PlayerMessages.SummaryRefundedFormat,        refunded);
            AddLine(lines, PlayerMessages.SummaryRefundDiscardedFormat, refundDiscarded);
            return string.Join(SummaryLineSeparator, lines);
        }

        /// <summary>Résumé d'arrêt tiré de la réponse du serveur.</summary>
        public static string BuildStopSummary(StopProductionResult result) =>
            result == null
                ? string.Empty
                : BuildStopSummary(result.AlreadyApplied, result.Collected, result.Discarded, result.Refunded,
                    result.RefundDiscarded);

        private static void AddLine(List<string> lines, string lineFormat, IReadOnlyDictionary<string, int> map)
        {
            var line = FormatResourceLine(lineFormat, map);
            if (line != null) lines.Add(line);
        }

        // ── Intention d'arrêt ─────────────────────────────────────────────────

        /// <summary>
        /// Libellé d'intention de l'arrêt = contenu complet de la requête : <c>stop:&lt;bâtiment&gt;:&lt;slot&gt;</c>, en
        /// culture invariante (même patron que <see cref="ProductionLaunchPlanner.BuildStartIntent"/>, D-ETAPE19-003).
        /// </summary>
        public static string BuildStopIntent(string buildingId, int slotIndex) =>
            string.Format(CultureInfo.InvariantCulture, "stop:{0}:{1}", buildingId, slotIndex);
    }
}
