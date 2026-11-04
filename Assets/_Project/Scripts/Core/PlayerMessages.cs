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

        // ── Slot actif et arrêt d'un slot (19.4c-2, D-ETAPE19-010 options A, réponse F2 du founder D-ETAPE19-014) ──

        /// <summary>Bouton d'un slot actif et bouton de la confirmation d'arrêt (texte 7).</summary>
        public const string StopButton = "Arrêter";

        /// <summary>
        /// Confirmation d'arrêt, sans chiffres (D-ETAPE19-010 Q4, options A). Texte du founder, inchangé quel que soit
        /// le slot (logs compris).
        /// </summary>
        public const string StopConfirmation =
            "Le cycle en cours sera perdu. Les intrants des cycles non commencés seront rendus dans la limite de la place libre.";

        /// <summary>Rejeu d'un arrêt déjà appliqué (options A).</summary>
        public const string StopAlreadyApplied = "Arrêt déjà enregistré";

        /// <summary>
        /// Lignes des résumés de collecte et d'arrêt (texte 8) ; {0} : liste « quantité ressource » séparée par
        /// <see cref="ResourceListSeparator"/>. Lignes à zéro masquées (Q4).
        /// </summary>
        public const string SummaryCollectedFormat       = "Récolté : {0}";
        public const string SummaryDiscardedFormat       = "Perdu (stock plein) : {0}";
        public const string SummaryRefundedFormat        = "Rendu : {0}";
        public const string SummaryRefundDiscardedFormat = "Intrants perdus (stock plein) : {0}";

        /// <summary>Séparateur des ressources dans une ligne de résumé (celui du texte de collecte existant).</summary>
        public const string ResourceListSeparator = ", ";

        /// <summary>Collecte sans rien de récolté ni de perdu (texte existant, inchangé).</summary>
        public const string NothingToCollect = "Rien à récolter pour l'instant.";

        /// <summary>Avancement estimé d'un lot (options A, ex. « lot 3/10 ») ; {0} : k, {1} : N.</summary>
        public const string BatchProgressFormat = "lot {0}/{1}";

        /// <summary>Lot estimé fini (options A) : affichage seulement, le serveur tranche à la collecte.</summary>
        public const string BatchFinished = "Lot terminé — collecter";

        /// <summary>
        /// Temps restant d'un lot (texte 9 ; « 1 min restante » : arbitre, 2026-11-04, D-REPRISE-012). Minutes
        /// tronquées ; l'accord suit le nombre affiché. Distincts des formats de l'aperçu (<see cref="DurationHoursFormat"/>,
        /// <see cref="DurationMinutesFormat"/>), qui restent sans « restantes ».
        /// </summary>
        public const string RemainingHoursFormat    = "{0} h {1:00} restantes";
        public const string RemainingMinutesFormat  = "{0} min restantes";
        public const string RemainingOneMinute      = "1 min restante";
        public const string RemainingUnderOneMinute = "< 1 min";

        /// <summary>
        /// Erreur inattendue de l'écran de production (texte existant, inchangé ; tutoiement : lot de textes F2,
        /// TD-033).
        /// </summary>
        public const string UnexpectedError = "Erreur inattendue, consulte la console.";
    }
}
