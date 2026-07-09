using System;

namespace GuildsAndEmpires.Services.Market
{
    /// <summary>
    /// Erreur renvoyée par IMarketService.
    /// <see cref="UserMessage"/> est localisable et affiché directement au joueur.
    /// </summary>
    public sealed class MarketServiceException : Exception
    {
        public string UserMessage { get; }

        public MarketServiceException(string userMessage, Exception inner = null)
            : base(userMessage, inner)
        {
            UserMessage = userMessage;
        }
    }
}
