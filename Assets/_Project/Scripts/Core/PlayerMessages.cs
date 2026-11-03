namespace GuildsAndEmpires.Core
{
    /// <summary>
    /// Textes joueur partagés entre plusieurs services. Chaque texte est fixé par le founder (F2) :
    /// ne pas le reformuler ici sans décision au journal.
    /// </summary>
    public static class PlayerMessages
    {
        /// <summary>
        /// État de slot corrompu (code <c>data-loss</c>, D-ETAPE19-010 Q1) : texte fixé par le founder (Q5).
        /// </summary>
        public const string Maintenance =
            "Compte temporairement en maintenance. Votre progression est conservée. Réessayez plus tard.";
    }
}
