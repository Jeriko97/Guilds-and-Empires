using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Firebase.Functions;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.Services.Economy
{
    /// <summary>
    /// Implémente <see cref="IEconomyService"/> via Firebase Callable Cloud Functions.
    ///
    /// Chaque appel génère un nonce UUID unique envoyé avec la requête.
    /// La Cloud Function utilise ce nonce comme clé d'idempotency : si le client
    /// retente après un timeout réseau, la même réponse est renvoyée sans retraiter.
    ///
    /// Isolation Firebase : seule cette classe importe Firebase.Functions.
    /// L'UI et les autres services passent par IEconomyService.
    /// </summary>
    public sealed class EconomyService : IEconomyService
    {
        // Pour un déploiement dans une région non-us-central1, utiliser :
        // FirebaseFunctions.GetInstance(FirebaseApp.DefaultInstance, "europe-west1")
        private readonly FirebaseFunctions _functions =
    FirebaseFunctions.GetInstance("us-central1");

        public async Task<ClaimDailyBonusResult> ClaimDailyBonusAsync(CancellationToken ct = default)
        {
            // Le nonce garantit l'idempotency côté serveur.
            // En cas de timeout réseau, le client peut retenter avec le MÊME nonce
            // et recevoir le résultat déjà calculé sans double-attribution de gold.
            var nonce    = Guid.NewGuid().ToString("N");
            var callable = _functions.GetHttpsCallable("claimDailyBonus");

            GELogger.Debug("Economy", $"ClaimDailyBonus — nonce: {nonce}");

            HttpsCallableResult rawResult;
            try
            {
                rawResult = await callable.CallAsync(new Dictionary<string, object>
                {
                    { "nonce", nonce }
                });
            }
            catch (FunctionsException ex)
            {
                // Traduit l'erreur Firebase en EconomyException typée pour l'UI.
                GELogger.Warning("Economy", $"ClaimDailyBonus [{ex.ErrorCode}]: {ex.Message}");
                throw new EconomyException(ex.ErrorCode.ToString(), ex.Message, ex);
            }
            catch (Exception ex) when (ct.IsCancellationRequested)
            {
                GELogger.Debug("Economy", "ClaimDailyBonus annulé.");
                throw new OperationCanceledException(ct);
            }

            return ParseClaimResult(rawResult.Data);
        }

        private static ClaimDailyBonusResult ParseClaimResult(object data)
        {
            // Firebase Functions Unity SDK 13.x deserializes JSON objects as
            // Dictionary<object, object>, not Dictionary<string, object>.
            Dictionary<object, object> dict = data switch
            {
                Dictionary<object, object> d => d,
                Dictionary<string, object> d => new Dictionary<object, object>(
                    System.Linq.Enumerable.ToDictionary(d, kv => (object)kv.Key, kv => kv.Value)),
                _ => throw new EconomyException("internal", "Réponse serveur invalide.")
            };

            try
            {
                var goldDelta = Convert.ToInt64(dict["goldDelta"]);
                var newGold   = Convert.ToInt64(dict["newGold"]);
                return new ClaimDailyBonusResult(goldDelta, newGold);
            }
            catch (Exception ex)
            {
                throw new EconomyException("internal", "Réponse serveur mal formée.", ex);
            }
        }
    }
}
