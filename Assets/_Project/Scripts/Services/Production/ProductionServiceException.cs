using System;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Erreur renvoyée par IProductionService.
    /// <see cref="UserMessage"/> est localisable et affiché directement au joueur.
    /// </summary>
    public sealed class ProductionServiceException : Exception
    {
        public string UserMessage { get; }

        public ProductionServiceException(string userMessage, Exception inner = null)
            : base(userMessage, inner)
        {
            UserMessage = userMessage;
        }
    }
}
