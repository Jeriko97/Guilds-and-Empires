using System;
using System.Threading;
using System.Threading.Tasks;
using Firebase.Auth;
using Firebase.Functions;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.Services.Player
{
    /// <summary>
    /// Implémente <see cref="IPlayerService"/> via Firebase Callable Cloud Functions.
    ///
    /// Seule classe à importer Firebase.Functions dans cette couche — doctrine C3.
    /// Tous les callers passent par IPlayerService ; aucun écran ne connaît FirebaseFunctions.
    /// </summary>
    public sealed class FirebasePlayerService : IPlayerService
    {
        private readonly FirebaseFunctions _functions;

        public FirebasePlayerService()
        {
            _functions = FirebaseFunctions.DefaultInstance;
        }

        public async Task<PlayerStateSnapshot> ResolveLoginStateAsync(CancellationToken ct = default)
        {
            GELogger.Debug("PlayerService", "ResolveLoginState — appel CF…");

            var callable = _functions.GetHttpsCallable("resolveLoginState");

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync();
            }
            catch (FunctionsException ex)
            {
                GELogger.Warning("PlayerService", $"resolveLoginState [{ex.ErrorCode}]: {ex.Message}");
                throw new PlayerServiceException(MapErrorMessage(ex.ErrorCode), ex);
            }
            catch (Exception ex) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("PlayerService", "resolveLoginState — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                var uid = FirebaseAuth.DefaultInstance.CurrentUser?.UserId ?? string.Empty;
                var snapshot = PlayerStateSnapshot.Parse(rawResult.Data, uid);
                GELogger.Info("PlayerService", $"resolveLoginState OK — gold:{snapshot.Player.Gold} rank:{snapshot.Player.FavorRank}");
                return snapshot;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                GELogger.Error("PlayerService", $"Parsing réponse échoué: {ex.Message}");
                throw new PlayerServiceException("Réponse serveur invalide.", ex);
            }
        }

        // ── FunctionsErrorCode → message joueur (doctrine C6) ─────────────────
        // On switch sur le code, jamais sur le texte du message serveur.

        private static string MapErrorMessage(FunctionsErrorCode code) => code switch
        {
            FunctionsErrorCode.Unauthenticated   => "Session expirée, reconnexion…",
            FunctionsErrorCode.NotFound          => "Profil introuvable, recharge le jeu.",
            FunctionsErrorCode.ResourceExhausted => "Trop de connexions récentes, réessaie plus tard.",
            FunctionsErrorCode.Internal          => "Une erreur est survenue, réessaie.",
            _                                    => "Une erreur est survenue, réessaie.",
        };
    }
}
