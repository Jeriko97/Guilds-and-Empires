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

        /// <summary>
        /// true pour un état de slot corrompu (code data-loss, D-ETAPE19-010 Q1) : le compte est en
        /// maintenance, <see cref="UserMessage"/> est le texte fixé par le founder (Q5), affiché tel quel.
        /// </summary>
        public bool IsMaintenance { get; }

        public PlayerServiceException(string userMessage, Exception inner = null, bool isMaintenance = false)
            : base(userMessage, inner)
        {
            UserMessage   = userMessage;
            IsMaintenance = isMaintenance;
        }
    }
}
