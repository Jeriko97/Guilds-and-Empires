namespace GuildsAndEmpires.Core
{
    /// <summary>
    /// Textes affichés au joueur : textes partagés entre plusieurs services, et textes d'écran fixés par une décision
    /// du journal (19.4c-1 : panneau de lancement, D-ETAPE19-014). Chaque texte est fixé par le founder (F2 ; libellés
    /// courts : arbitre, D-REPRISE-012) : ne pas le reformuler ici sans décision au journal. Vouvoiement pour tout
    /// texte affiché (D-REPRISE-012).
    /// </summary>
    public static class PlayerMessages
    {
        /// <summary>
        /// État de slot corrompu (code <c>data-loss</c>, D-ETAPE19-010 Q1) : texte fixé par le founder (Q5).
        /// </summary>
        public const string Maintenance =
            "Compte temporairement en maintenance. Votre progression est conservée. Réessayez plus tard.";

        // ── Panneau de lancement de la production (19.4c-1, réponse F2 du founder, D-ETAPE19-014) ──

        /// <summary>Bouton d'un slot libre (texte 1).</summary>
        public const string ProduceButton = "Produire";

        /// <summary>Choix de la recette (texte 2).</summary>
        public const string RecipeLogs   = "Logs";
        public const string RecipePlanks = "Planks";
        public const string RecipeKits   = "Kits";

        /// <summary>Boutons N (Q3 du founder, D-ETAPE19-010).</summary>
        public const string CyclesOne = "1";
        public const string CyclesTen = "10";
        public const string CyclesMax = "Max";

        /// <summary>Lancer / annuler (texte 4).</summary>
        public const string LaunchButton = "Lancer";
        public const string CancelButton = "Annuler";

        /// <summary>
        /// Noms de ressource dans l'aperçu, invariables (« 1 planks ») ; jamais la clé technique
        /// <c>reconstructionKits</c> (options A ; « kits » : D-ETAPE19-004, Q3 ; réponse F2).
        /// </summary>
        public const string ResourceLogs   = "logs";
        public const string ResourcePlanks = "planks";
        public const string ResourceKits   = "kits";

        /// <summary>
        /// Aperçu du lot (options A) : <c>&lt;N×sortie&gt; &lt;ressource&gt; : &lt;N×coût&gt; &lt;intrant&gt;[, …], &lt;durée&gt;</c>,
        /// ex. « 10 planks : 20 logs, 4 h 10 ». {0} : quantité et ressource produites ; {1} : intrants et durée.
        /// </summary>
        public const string PreviewFormat = "{0} : {1}";

        /// <summary>Quantité et ressource dans l'aperçu : « 20 logs ».</summary>
        public const string QuantityFormat = "{0} {1}";

        /// <summary>Séparateur des intrants et de la durée dans l'aperçu.</summary>
        public const string PreviewSeparator = ", ";

        /// <summary>Durée ≥ 1 h : « X h YY » (options A, ex. « 4 h 10 »).</summary>
        public const string DurationHoursFormat = "{0} h {1:00}";

        /// <summary>Durée &lt; 1 h : « YY min » (texte 3, ex. « 25 min »).</summary>
        public const string DurationMinutesFormat = "{0} min";

        /// <summary>Avertissement de saturation, non bloquant (texte 5, texte du founder).</summary>
        public const string SaturationWarning =
            "Attention : avec vos autres productions en cours, la place risque de manquer. L'excédent serait perdu.";

        /// <summary>Slot actif (texte 6) ; recette inconnue du client : <see cref="ActiveUnknown"/>.</summary>
        public const string ActiveLogs    = "Logs en cours";
        public const string ActivePlanks  = "Planks en cours";
        public const string ActiveKits    = "Kits en cours";
        public const string ActiveUnknown = "Production en cours";
    }
}
