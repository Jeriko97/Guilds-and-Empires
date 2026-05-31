using System;

namespace GuildsAndEmpires.Services.Player
{
    /// <summary>
    /// Erreur renvoyée par IPlayerService.
    /// <see cref="UserMessage"/> est localisable et affiché directement au joueur.
    /// </summary>
    public sealed class PlayerServiceException : Exception
    {
        public string UserMessage { get; }

        public PlayerServiceException(string userMessage, Exception inner = null)
            : base(userMessage, inner)
        {
            UserMessage = userMessage;
        }
    }
}
