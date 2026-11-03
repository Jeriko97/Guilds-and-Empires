using System.Collections.Generic;
using System.Collections.ObjectModel;
using GuildsAndEmpires.Core;

namespace GuildsAndEmpires.Models
{
    /// <summary>
    /// Recette de production telle que le client l'affiche. Immuable.
    /// </summary>
    public sealed class RecipeInfo
    {
        /// <summary>Identifiant serveur de la recette (ex. "reconstruction_kits").</summary>
        public string RecipeId { get; }

        /// <summary>Clé d'inventaire produite (ex. "reconstructionKits" — différente de l'id de recette).</summary>
        public string OutputKey { get; }

        /// <summary>Quantité produite par cycle.</summary>
        public int OutputQty { get; }

        /// <summary>Durée d'un cycle, en millisecondes.</summary>
        public long DurationMs { get; }

        /// <summary>Taille maximale d'un lot ; null = production continue (logs), pas de lot.</summary>
        public int? MaxBatchCycles { get; }

        /// <summary>Intrants par cycle : clé d'inventaire → quantité. Vide pour les logs.</summary>
        public IReadOnlyDictionary<string, int> InputsPerCycle { get; }

        public RecipeInfo(
            string recipeId,
            string outputKey,
            int outputQty,
            long durationMs,
            int? maxBatchCycles,
            IReadOnlyDictionary<string, int> inputsPerCycle)
        {
            RecipeId       = recipeId;
            OutputKey      = outputKey;
            OutputQty      = outputQty;
            DurationMs     = durationMs;
            MaxBatchCycles = maxBatchCycles;
            // Copie en lecture seule : l'instance reste immuable même si l'appelant garde le dictionnaire source.
            InputsPerCycle = new ReadOnlyDictionary<string, int>(new Dictionary<string, int>(inputsPerCycle));
        }
    }

    /// <summary>
    /// Copie client des recettes Phase 1, pour l'AFFICHAGE seulement (D-ETAPE19-010 Q2, TD-027).
    ///
    /// À modifier avec recipes.ts (firebase/functions/src/shared/recipes.ts) : toute valeur changée côté
    /// serveur doit l'être ici dans le même ticket. Depuis 19.4c-1 (arbitrage 1a-1f, D-ETAPE19-014), le grisage
    /// des boutons N et la valeur envoyée par « Max » en dépendent (ProductionLaunchPlanner) : affichage et
    /// intention du joueur seulement, doctrine C1 règle 3 (confort UX) ; le serveur revalide tout lancement et
    /// reste l'autorité (doctrine C1).
    /// </summary>
    public static class ProductionRecipes
    {
        public const string LogsId               = "logs";
        public const string PlanksId             = "planks";
        public const string ReconstructionKitsId = "reconstruction_kits";

        private static readonly Dictionary<string, RecipeInfo> ById = new()
        {
            [LogsId] = new RecipeInfo(
                LogsId, EconomyResourceKeys.LOGS,
                outputQty: 1, durationMs: 20L * 60 * 1000, maxBatchCycles: null,
                inputsPerCycle: new Dictionary<string, int>()),
            [PlanksId] = new RecipeInfo(
                PlanksId, EconomyResourceKeys.PLANKS,
                outputQty: 1, durationMs: 25L * 60 * 1000, maxBatchCycles: 24,
                inputsPerCycle: new Dictionary<string, int> { [EconomyResourceKeys.LOGS] = 2 }),
            [ReconstructionKitsId] = new RecipeInfo(
                ReconstructionKitsId, EconomyResourceKeys.RECONSTRUCTION_KITS,
                outputQty: 1, durationMs: 60L * 60 * 1000, maxBatchCycles: 10,
                inputsPerCycle: new Dictionary<string, int> { [EconomyResourceKeys.PLANKS] = 3 }),
        };

        /// <summary>Recettes dans l'ordre de la chaîne (logs → planks → kits).</summary>
        public static IReadOnlyList<RecipeInfo> All { get; } = new ReadOnlyCollection<RecipeInfo>(new[]
        {
            ById[LogsId], ById[PlanksId], ById[ReconstructionKitsId],
        });

        /// <summary>Recette connue, ou null si l'id est inconnu du client.</summary>
        public static RecipeInfo Find(string recipeId) =>
            recipeId != null && ById.TryGetValue(recipeId, out var r) ? r : null;
    }
}
