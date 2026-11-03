using System;
using System.Threading;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Functions;
using GuildsAndEmpires.Core;
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
        private readonly FirebaseApp       _app;
        private readonly FirebaseFunctions _functions;

        /// <param name="app">Instance choisie par FirebaseBootstrap (par défaut, ou instance de l'émulateur dans l'Éditeur).</param>
        public FirebasePlayerService(FirebaseApp app)
        {
            _app       = app;
            _functions = FirebaseFunctions.GetInstance(app);
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
                // État de slot corrompu (data-loss, D-ETAPE19-010 Q1) : compte en maintenance, texte du founder (Q5).
                if (ex.ErrorCode == FunctionsErrorCode.DataLoss)
                    throw new PlayerServiceException(PlayerMessages.Maintenance, ex, isMaintenance: true);
                throw new PlayerServiceException(MapErrorMessage(ex.ErrorCode), ex);
            }
            catch (Exception) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("PlayerService", "resolveLoginState — annulé.");
                throw new OperationCanceledException(ct);
            }

            ct.ThrowIfCancellationRequested();

            try
            {
                var uid = FirebaseAuth.GetAuth(_app).CurrentUser?.UserId ?? string.Empty;
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
