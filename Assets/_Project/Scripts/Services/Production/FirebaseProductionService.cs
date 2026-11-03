using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Firebase;
using Firebase.Functions;
using GuildsAndEmpires.Core;
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

        /// <param name="app">Instance choisie par FirebaseBootstrap (par défaut, ou instance de l'émulateur dans l'Éditeur).</param>
        public FirebaseProductionService(FirebaseApp app)
        {
            _functions = FirebaseFunctions.GetInstance(app);
        }

        public async Task<ProductionResult> StartProductionSlotAsync(
            string buildingId,
            int slotIndex,
            string recipeId,
            int? cycles,
            string idempotencyKey,
            CancellationToken ct = default)
        {
            GELogger.Debug("ProductionService", $"startProductionSlot — building:{buildingId} slot:{slotIndex} recipe:{recipeId} cycles:{cycles?.ToString() ?? "-"}");

            var callable = _functions.GetHttpsCallable("startProductionSlot");
            var payload  = new Dictionary<string, object>
            {
                { "buildingId",     buildingId     },
                { "slotIndex",      slotIndex      },
                { "recipeId",       recipeId       },
                { "idempotencyKey", idempotencyKey },
            };
            // Logs : le serveur refuse le champ cycles, même à null — il n'est envoyé que pour un lot.
            if (cycles.HasValue) payload["cycles"] = cycles.Value;

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync(payload);
            }
            catch (FunctionsException ex)
            {
                GELogger.Warning("ProductionService", $"startProductionSlot [{ex.ErrorCode}]: {ex.Message}");
                throw ToServiceException(ex);
            }
            catch (Exception) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("ProductionService", "startProductionSlot — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                // buildingId injecté car BuildingDocument ne contient pas l'id Firestore (D-ETAPE16-004).
                var result = ProductionResult.Parse(rawResult.Data, buildingId);
                GELogger.Info("ProductionService", $"startProductionSlot OK — building:{buildingId} slot:{slotIndex} alreadyApplied:{result.AlreadyApplied}");
                return result;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                GELogger.Error("ProductionService", $"Parsing réponse échoué: {ex.Message}");
                throw new ProductionServiceException("Réponse serveur invalide.", ex);
            }
        }

        public async Task<CollectProductionResult> CollectProductionAsync(
            string buildingId,
            CancellationToken ct = default)
        {
            GELogger.Debug("ProductionService", $"collectProduction — building:{buildingId}");

            var callable = _functions.GetHttpsCallable("collectProduction");
            var payload  = new Dictionary<string, object>
            {
                { "buildingId", buildingId },
            };

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync(payload);
            }
            catch (FunctionsException ex)
            {
                GELogger.Warning("ProductionService", $"collectProduction [{ex.ErrorCode}]: {ex.Message}");
                throw ToServiceException(ex);
            }
            catch (Exception) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("ProductionService", "collectProduction — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                var result = CollectProductionResult.Parse(rawResult.Data, buildingId);
                GELogger.Info("ProductionService", $"collectProduction OK — building:{buildingId}");
                return result;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                GELogger.Error("ProductionService", $"Parsing réponse échoué: {ex.Message}");
                throw new ProductionServiceException("Réponse serveur invalide.", ex);
            }
        }

        public async Task<StopProductionResult> StopProductionSlotAsync(
            string buildingId,
            int slotIndex,
            string idempotencyKey,
            CancellationToken ct = default)
        {
            GELogger.Debug("ProductionService", $"stopProductionSlot — building:{buildingId} slot:{slotIndex}");

            var callable = _functions.GetHttpsCallable("stopProductionSlot");
            var payload  = new Dictionary<string, object>
            {
                { "buildingId",     buildingId     },
                { "slotIndex",      slotIndex      },
                { "idempotencyKey", idempotencyKey },
            };

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync(payload);
            }
            catch (FunctionsException ex)
            {
                GELogger.Warning("ProductionService", $"stopProductionSlot [{ex.ErrorCode}]: {ex.Message}");
                throw ToServiceException(ex);
            }
            catch (Exception) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("ProductionService", "stopProductionSlot — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                var result = StopProductionResult.Parse(rawResult.Data, buildingId);
                GELogger.Info("ProductionService", $"stopProductionSlot OK — building:{buildingId} slot:{slotIndex} alreadyApplied:{result.AlreadyApplied}");
                return result;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                GELogger.Error("ProductionService", $"Parsing réponse échoué: {ex.Message}");
                throw new ProductionServiceException("Réponse serveur invalide.", ex);
            }
        }

        // ── FunctionsErrorCode → message joueur (doctrine C6) ─────────────────

        private static ProductionServiceException ToServiceException(FunctionsException ex) =>
            ex.ErrorCode == FunctionsErrorCode.DataLoss
                // État de slot corrompu (D-ETAPE19-010 Q1) : compte en maintenance, texte du founder (Q5).
                ? new ProductionServiceException(PlayerMessages.Maintenance, ex, isMaintenance: true)
                : new ProductionServiceException(MapErrorMessage(ex.ErrorCode), ex);

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
