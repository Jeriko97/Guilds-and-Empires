using GuildsAndEmpires.State;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>Ce que l'écran de production fait après une décision de chargement (19.4d).</summary>
    public enum ProductionLoadStep
    {
        /// <summary>Rien : l'écran n'attend aucun chargement, ou un appel est encore en cours.</summary>
        None,

        /// <summary>Bâtiment présent, hors maintenance : slots rendus, « Prêt. ».</summary>
        Ready,

        /// <summary>Aucun bâtiment, aucun appel en cours, hors maintenance : appel de connexion (« Chargement… »).</summary>
        Load,

        /// <summary>Un appel est en cours (lancé par cet écran ou un précédent) : on attend sa fin (« Chargement… »).</summary>
        Wait,

        /// <summary>Compte en maintenance : panneau, aucun appel, ligne d'état vidée.</summary>
        Maintenance,
    }

    /// <summary>
    /// Décision pure de l'écran de production (19.4d, arbitrage du 2026-11-04, (2c)) : « appeler le serveur à
    /// l'OnEnable / à la fin d'un appel ? » et « afficher le panneau de maintenance ? ». Lue depuis le
    /// PlayerEconomyStateStore seul (doctrine C7) : un écran recréé décide comme l'écran qu'il remplace. Aucune
    /// dépendance à Unity ni à Firebase.
    ///
    /// Règle (D-ETAPE19-010 Q5) : en maintenance, aucun appel sans action du joueur ; seul « Réessayer » relance la
    /// connexion. Hors maintenance, comportement existant (19.4c-1) : chargement si aucun bâtiment et aucun appel en
    /// cours ; attente de la fin d'un appel en cours.
    /// </summary>
    public static class ProductionLoadDecision
    {
        /// <summary>Le panneau de maintenance remplace la liste des slots.</summary>
        public static bool ShowMaintenancePanel(PlayerEconomyStateStore store) =>
            store != null && store.IsMaintenance;

        /// <summary>
        /// Entrée en maintenance vue par l'écran, à une notification du store : le panneau n'était pas affiché
        /// (<paramref name="panelShown"/>) et le store est en maintenance. L'écran vide alors sa ligne d'état, quel que
        /// soit l'écran ou le jeton qui a lancé l'appel revenu data-loss (ex. : « Collecter », « Marché », retour avant
        /// la réponse : « Prêt. » ne reste pas affiché sous le panneau).
        /// </summary>
        public static bool EntersMaintenance(bool panelShown, PlayerEconomyStateStore store) =>
            !panelShown && ShowMaintenancePanel(store);

        /// <summary>
        /// À l'OnEnable. Store absent (bootstrap incomplet) : <see cref="ProductionLoadStep.Load"/>, comme avant
        /// (le chargement affiche « service manquant »).
        /// </summary>
        public static ProductionLoadStep OnEnable(PlayerEconomyStateStore store)
        {
            if (store == null) return ProductionLoadStep.Load;

            var hasBuilding = store.Building != null;
            if (store.CallInFlight && (store.IsMaintenance || !hasBuilding)) return ProductionLoadStep.Wait;
            if (store.IsMaintenance) return ProductionLoadStep.Maintenance;
            return hasBuilding ? ProductionLoadStep.Ready : ProductionLoadStep.Load;
        }

        /// <summary>
        /// À chaque notification du store (réponse, début ou fin d'appel), pour un écran qui attendait un chargement
        /// (<paramref name="awaitingLoad"/> : « Chargement… » affiché). Rien tant qu'un appel est en cours.
        /// </summary>
        public static ProductionLoadStep AfterStoreChanged(PlayerEconomyStateStore store, bool awaitingLoad)
        {
            if (store == null || !awaitingLoad || store.CallInFlight) return ProductionLoadStep.None;
            if (store.IsMaintenance) return ProductionLoadStep.Maintenance;
            return store.Building != null ? ProductionLoadStep.Ready : ProductionLoadStep.Load;
        }
    }
}
