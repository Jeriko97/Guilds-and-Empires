using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Firebase.Functions;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Implémente <see cref="IProductionService"/> via Firebase Callable Cloud Functions.
    ///
    /// Seule classe à importer Firebase.Functions dans cette couche — doctrine C3.
    /// Tous les callers passent par IProductionService ; aucun écran ne connaît FirebaseFunctions.
    /// Structure calquée sur FirebasePlayerService (GetHttpsCallable → CallAsync → parse → exceptions).
    /// </summary>
    public sealed class FirebaseProductionService : IProductionService
    {
        private readonly FirebaseFunctions _functions;

        public FirebaseProductionService()
        {
            _functions = FirebaseFunctions.DefaultInstance;
        }

        public async Task<ProductionResult> StartProductionSlotAsync(
            string buildingId,
            int slotIndex,
            string recipeId,
            CancellationToken ct = default)
        {
            GELogger.Debug("ProductionService", $"startProductionSlot — building:{buildingId} slot:{slotIndex} recipe:{recipeId}");

            var callable = _functions.GetHttpsCallable("startProductionSlot");
            var payload  = new Dictionary<string, object>
            {
                { "buildingId", buildingId },
                { "slotIndex",  slotIndex  },
                { "recipeId",   recipeId   },
            };

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync(payload);
            }
            catch (FunctionsException ex)
            {
                GELogger.Warning("ProductionService", $"startProductionSlot [{ex.ErrorCode}]: {ex.Message}");
                throw new ProductionServiceException(MapErrorMessage(ex.ErrorCode), ex);
            }
            catch (Exception ex) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("ProductionService", "startProductionSlot — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                // buildingId injecté car BuildingDocument ne contient pas l'id Firestore (D-ETAPE16-004).
                var result = ProductionResult.Parse(rawResult.Data, buildingId);
                GELogger.Info("ProductionService", $"startProductionSlot OK — building:{buildingId} slot:{slotIndex}");
                return result;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                GELogger.Error("ProductionService", $"Parsing réponse échoué: {ex.Message}");
                throw new ProductionServiceException("Réponse serveur invalide.", ex);
            }
        }

        // ── FunctionsErrorCode → message joueur (doctrine C6) ─────────────────

        private static string MapErrorMessage(FunctionsErrorCode code) => code switch
        {
            FunctionsErrorCode.Unauthenticated   => "Session expirée, reconnecte-toi.",
            FunctionsErrorCode.FailedPrecondition => "Action impossible : vérifiez l'état du slot.",
            FunctionsErrorCode.ResourceExhausted  => "Trop d'actions récentes, réessaie dans 2s.",
            FunctionsErrorCode.NotFound           => "Bâtiment ou slot introuvable.",
            FunctionsErrorCode.InvalidArgument    => "Paramètre invalide.",
            FunctionsErrorCode.Internal           => "Une erreur est survenue, réessaie.",
            _                                     => "Une erreur est survenue, réessaie.",
        };
    }
}
