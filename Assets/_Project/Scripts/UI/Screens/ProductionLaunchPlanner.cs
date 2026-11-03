using System;
using System.Collections.Generic;
using System.Globalization;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>Bouton N choisi dans le panneau de lancement (Q3 du founder : 1 / 10 / Max).</summary>
    public enum CyclesChoice
    {
        None,
        One,
        Ten,
        Max,
    }

    /// <summary>État calculé des boutons du panneau de lancement (arbitrage 1a-1f, D-ETAPE19-014).</summary>
    public readonly struct LaunchPanelButtons
    {
        public readonly bool Recipes;
        public readonly bool One;
        public readonly bool Ten;
        public readonly bool Max;
        public readonly bool Launch;
        public readonly bool Cancel;

        public LaunchPanelButtons(bool recipes, bool one, bool ten, bool max, bool launch, bool cancel)
        {
            Recipes = recipes;
            One     = one;
            Ten     = ten;
            Max     = max;
            Launch  = launch;
            Cancel  = cancel;
        }
    }

    /// <summary>
    /// Calcul pur du panneau de lancement de la production (19.4c-1) : Max, état des boutons, aperçu, saturation,
    /// libellé d'intention. Aucune dépendance à Unity ni à Firebase.
    ///
    /// AFFICHAGE SEULEMENT (D-ETAPE19-010 options A et Q2 ; doctrine C1, règle 3) : rien de ce qui est calculé ici
    /// n'est écrit dans le store ni envoyé au serveur, hormis N (Max compris), qui est l'intention du joueur
    /// (D-ETAPE19-003) et que le serveur revalide. Seul blocage client admis : le grisage des boutons N au-delà de
    /// Max et l'inactivité de « Lancer » sans N choisi (arbitrage 1a-1f). Tout refus reste au serveur (mapping C6).
    /// </summary>
    public static class ProductionLaunchPlanner
    {
        private const int TenCycles = 10;

        // ── Max et boutons ────────────────────────────────────────────────────

        /// <summary>
        /// Max d'un lot (arbitrage 1d) = min(borne de la recette, ⌊intrants ÷ coût⌋, ⌊place libre ÷ outputQty⌋),
        /// chaque terme planché à 0. Même règle que le serveur (startProductionSlot.ts : N entre 1 et la borne,
        /// l. 98-100 ; N × coût ≤ stock de chaque intrant, l. 210-215 ; N × outputQty ≤ cap − quantité, l. 229-232).
        /// Un terme incalculable (inventaire ou pile absents, coût ou sortie ≤ 0) est omis du min : on ne grise
        /// jamais à tort sur une donnée absente, le serveur tranche. 0 pour une recette sans lot (logs) ou inconnue.
        /// Valeurs lues de la copie client des recettes : TD-027 (affichage et intention seulement, le serveur revalide).
        /// </summary>
        public static int ComputeMaxCycles(RecipeInfo recipe, InventoryState inventory)
        {
            if (recipe?.MaxBatchCycles == null) return 0;

            var max = Math.Max(0, recipe.MaxBatchCycles.Value);
            if (inventory == null) return max;

            foreach (var input in recipe.InputsPerCycle)
            {
                var stack = GetStack(inventory, input.Key);
                if (stack == null || input.Value <= 0) continue;
                max = Math.Min(max, Math.Max(0, stack.Quantity / input.Value));
            }

            var output = GetStack(inventory, recipe.OutputKey);
            if (output != null && recipe.OutputQty > 0)
                max = Math.Min(max, Math.Max(0, (output.Cap - output.Quantity) / recipe.OutputQty));

            return max;
        }

        /// <summary>N envoyé pour ce choix (« Max » envoie Max) ; null si aucun N choisi ou si son bouton est inactif.</summary>
        public static int? SelectedCycles(CyclesChoice choice, int max) => choice switch
        {
            CyclesChoice.One when max >= 1         => 1,
            CyclesChoice.Ten when max >= TenCycles => TenCycles,
            CyclesChoice.Max when max >= 1         => max,
            _                                      => null,
        };

        /// <summary>Un choix dont le bouton est devenu inactif (Max recalculé) est retiré : aucun N grisé ne reste choisi.</summary>
        public static CyclesChoice NormalizeChoice(CyclesChoice choice, int max) =>
            SelectedCycles(choice, max).HasValue ? choice : CyclesChoice.None;

        /// <summary>
        /// État des boutons du panneau. Pendant un appel : tous inactifs (règle existante SetAllButtonsEnabled).
        /// Sinon, état calculé (1a-1c) : recettes et « Annuler » actifs (1f : jamais de grisage de recette) ;
        /// « 1 » si Max ≥ 1, « 10 » si Max ≥ 10, « Max » si Max ≥ 1 ; « Lancer » actif pour les logs dès la recette
        /// choisie (1b), pour planks et kits seulement si un N est choisi (1a).
        /// </summary>
        public static LaunchPanelButtons ComputeButtons(RecipeInfo recipe, CyclesChoice choice, int max, bool callInFlight)
        {
            if (callInFlight) return new LaunchPanelButtons(false, false, false, false, false, false);
            if (recipe == null) return new LaunchPanelButtons(true, false, false, false, false, true);
            if (recipe.MaxBatchCycles == null) return new LaunchPanelButtons(true, false, false, false, true, true);

            return new LaunchPanelButtons(
                recipes: true,
                one:     max >= 1,
                ten:     max >= TenCycles,
                max:     max >= 1,
                launch:  SelectedCycles(choice, max).HasValue,
                cancel:  true);
        }

        // ── Aperçu ────────────────────────────────────────────────────────────

        /// <summary>
        /// Aperçu du lot (options A) : N × outputQty de la ressource produite, N × coût de chaque intrant, N × durée
        /// d'un cycle. Ex. « 10 planks : 20 logs, 4 h 10 ».
        /// </summary>
        public static string FormatPreview(RecipeInfo recipe, int cycles)
        {
            var produced = Quantity((long)cycles * recipe.OutputQty, recipe.OutputKey);

            var parts = new List<string>();
            foreach (var input in recipe.InputsPerCycle)
                parts.Add(Quantity((long)cycles * input.Value, input.Key));
            parts.Add(FormatDuration(cycles * recipe.DurationMs));

            return string.Format(CultureInfo.InvariantCulture, PlayerMessages.PreviewFormat,
                produced, string.Join(PlayerMessages.PreviewSeparator, parts));
        }

        /// <summary>Durée ≥ 1 h : « X h YY » ; &lt; 1 h : « YY min » (minutes entières).</summary>
        public static string FormatDuration(long durationMs)
        {
            var totalMinutes = Math.Max(0L, durationMs) / 60_000L;
            return totalMinutes < 60
                ? string.Format(CultureInfo.InvariantCulture, PlayerMessages.DurationMinutesFormat, totalMinutes)
                : string.Format(CultureInfo.InvariantCulture, PlayerMessages.DurationHoursFormat,
                    totalMinutes / 60, totalMinutes % 60);
        }

        private static string Quantity(long quantity, string inventoryKey) =>
            string.Format(CultureInfo.InvariantCulture, PlayerMessages.QuantityFormat, quantity, ResourceName(inventoryKey));

        // ── Saturation ────────────────────────────────────────────────────────

        /// <summary>
        /// Production restante des autres slots occupés produisant la même ressource que <paramref name="recipe"/> :
        /// Σ max(0, cyclesPlanned − cyclesProcessed) × outputQty, lus du snapshot serveur (aucune estimation par
        /// l'horloge). Compteur absent → 0 ; recette inconnue du client → slot ignoré.
        /// </summary>
        public static long RemainingOutputOfOtherSlots(RecipeInfo recipe, IReadOnlyList<SlotSnapshot> slots, int panelSlotIndex)
        {
            if (recipe == null || slots == null) return 0;

            long total = 0;
            foreach (var slot in slots)
            {
                if (slot == null || slot.SlotIndex == panelSlotIndex || slot.RecipeId == null) continue;
                var other = ProductionRecipes.Find(slot.RecipeId);
                if (other == null || other.OutputKey != recipe.OutputKey) continue;
                var remaining = Math.Max(0, (slot.CyclesPlanned ?? 0) - (slot.CyclesProcessed ?? 0));
                total += (long)remaining * other.OutputQty;
            }
            return total;
        }

        /// <summary>
        /// Avertissement de saturation, non bloquant (options A) : production restante des autres slots + N × sortie
        /// &gt; place libre. Place libre inconnue (inventaire ou pile absents) : aucun avertissement. Logs : jamais.
        /// </summary>
        public static bool IsSaturationRisk(
            RecipeInfo recipe, int cycles, IReadOnlyList<SlotSnapshot> slots, int panelSlotIndex, InventoryState inventory)
        {
            if (recipe?.MaxBatchCycles == null || inventory == null) return false;
            var output = GetStack(inventory, recipe.OutputKey);
            if (output == null) return false;

            var freeSpace = (long)output.Cap - output.Quantity;
            var incoming  = RemainingOutputOfOtherSlots(recipe, slots, panelSlotIndex) + (long)cycles * recipe.OutputQty;
            return incoming > freeSpace;
        }

        // ── Intention ─────────────────────────────────────────────────────────

        /// <summary>
        /// Libellé d'intention = contenu complet de la requête : <c>start:&lt;bâtiment&gt;:&lt;slot&gt;:&lt;recette&gt;:&lt;N&gt;</c>,
        /// « - » pour les logs. Une clé = un contenu (D-ETAPE19-003 ; le serveur refuse une clé rejouée avec un autre
        /// contenu, startProductionSlot.ts:145-150).
        /// </summary>
        public static string BuildStartIntent(string buildingId, int slotIndex, string recipeId, int? cycles) =>
            string.Format(CultureInfo.InvariantCulture, "start:{0}:{1}:{2}:{3}",
                buildingId, slotIndex, recipeId, cycles.HasValue ? cycles.Value.ToString(CultureInfo.InvariantCulture) : "-");

        // ── Libellés ──────────────────────────────────────────────────────────

        /// <summary>Libellé d'un slot actif (texte 6) : recette réelle, ou « Production en cours » si inconnue.</summary>
        public static string ActiveSlotLabel(string recipeId) => recipeId switch
        {
            ProductionRecipes.LogsId               => PlayerMessages.ActiveLogs,
            ProductionRecipes.PlanksId             => PlayerMessages.ActivePlanks,
            ProductionRecipes.ReconstructionKitsId => PlayerMessages.ActiveKits,
            _                                      => PlayerMessages.ActiveUnknown,
        };

        /// <summary>Nom invariable d'une ressource dans l'aperçu, par clé d'inventaire.</summary>
        public static string ResourceName(string inventoryKey) => inventoryKey switch
        {
            EconomyResourceKeys.LOGS                => PlayerMessages.ResourceLogs,
            EconomyResourceKeys.PLANKS              => PlayerMessages.ResourcePlanks,
            EconomyResourceKeys.RECONSTRUCTION_KITS => PlayerMessages.ResourceKits,
            _                                       => inventoryKey,
        };

        private static ResourceStack GetStack(InventoryState inventory, string inventoryKey) => inventoryKey switch
        {
            EconomyResourceKeys.LOGS                => inventory.Logs,
            EconomyResourceKeys.PLANKS              => inventory.Planks,
            EconomyResourceKeys.RECONSTRUCTION_KITS => inventory.ReconstructionKits,
            _                                       => null,
        };
    }
}
