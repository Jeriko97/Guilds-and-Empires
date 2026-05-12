using System;

namespace GuildsAndEmpires.Services.Economy
{
    /// <summary>Résultat du bonus journalier, tel que renvoyé par la Cloud Function.</summary>
    public readonly struct ClaimDailyBonusResult
    {
        /// <summary>Or accordé lors de cette réclamation (calculé serveur).</summary>
        public readonly long GoldDelta;

        /// <summary>Nouveau solde d'or après l'opération (calculé serveur).</summary>
        public readonly long NewGold;

        public ClaimDailyBonusResult(long goldDelta, long newGold)
        {
            GoldDelta = goldDelta;
            NewGold   = newGold;
        }
    }

    /// <summary>
    /// Erreur métier renvoyée par une Cloud Function via HttpsError.
    /// Distingue les erreurs métier (cooldown, quota) des erreurs réseau.
    /// L'UI affiche <see cref="UserMessage"/> directement au joueur.
    /// </summary>
    public sealed class EconomyException : Exception
    {
        /// <summary>Code d'erreur renvoyé par la Cloud Function (ex: "failed-precondition").</summary>
        public string ErrorCode { get; }

        /// <summary>Message localisable à afficher au joueur.</summary>
        public string UserMessage { get; }

        public EconomyException(string errorCode, string userMessage, Exception inner = null)
            : base($"[{errorCode}] {userMessage}", inner)
        {
            ErrorCode   = errorCode;
            UserMessage = userMessage;
        }

        /// <summary>True si l'erreur est due au cooldown (bonus déjà réclamé aujourd'hui).</summary>
        public bool IsCooldownError => ErrorCode == "failed-precondition";
    }
}
