using System;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;

namespace GuildsAndEmpires.State
{
    /// <summary>
    /// Projection runtime d'affichage du gold, de l'inventaire et du bâtiment de production du joueur.
    /// Seul cache d'état métier du client (doctrine C7) : il survit aux écrans (enregistré une fois au bootstrap).
    ///
    /// Doctrine : ce store n'autorise, ne calcule et ne valide JAMAIS une opération économique.
    /// Ses données ne sont remplacées QUE depuis des valeurs SERVEUR (resolveLoginState, startProductionSlot,
    /// collectProduction, sellToMarket, ...). Le serveur reste l'unique source de vérité.
    /// Aucun incrément/décrément local ; les seuls setters (ApplyServer*) recopient une réponse serveur telle quelle.
    ///
    /// Bâtiment (19.4c-1, report de 19.4b) : le BuildingSnapshot reçu en dernier du serveur. Sa référence sert aussi
    /// d'ancre aux clés d'idempotence des intentions de production (PendingIntentKeys) : elle change à chaque
    /// réponse serveur, jamais entre deux.
    ///
    /// Sérialisation des appels (19.4c-1, bloquants de revue) : un seul appel qui écrit bâtiment et inventaire
    /// (chargement, lancement, collecte) à la fois, quel que soit l'écran. L'état « appel en cours » vit ici (le store
    /// survit aux écrans) : posé à l'envoi (<see cref="TryBeginServerCall"/>), levé quand l'appel revient, réponse ou
    /// erreur (<see cref="EndServerCall"/>), jamais par l'annulation d'un écran. Un appel n'est donc envoyé qu'après
    /// l'application de la réponse du précédent : l'état qu'il renvoie inclut tous les appels antérieurs.
    /// Filet : chaque appel porte un numéro croissant attribué à l'envoi ; une réponse n'est appliquée que si son
    /// numéro dépasse le dernier appliqué. Ce numéro suit l'ordre d'envoi, pas l'ordre de traitement par le serveur :
    /// c'est la sérialisation qui garantit la fraîcheur, le numéro ne fait qu'écarter une réponse hors séquence.
    /// Limite : la sérialisation est levée à toute erreur, y compris réseau ou délai dépassé. Un appel revenu sans
    /// réponse exploitable peut avoir muté le serveur après coup ; le store l'ignore alors jusqu'à la réponse
    /// suivante, qui le rattrape (réessai avec la même clé → alreadyApplied, collecte idempotente, chargement).
    /// Garantie complète : TD-034.
    /// Une réponse de lancement ou de collecte reçue avant tout chargement (store non amorcé) est refusée entière.
    ///
    /// <see cref="Changed"/> est levé une fois par écriture appliquée, et à chaque début ou fin d'appel ; un écran
    /// s'y abonne en OnEnable et s'en désabonne en OnDisable (doctrine C9).
    /// </summary>
    public sealed class PlayerEconomyStateStore
    {
        public long Gold { get; private set; }
        public InventoryState Inventory { get; private set; }
        public bool HasState { get; private set; }

        /// <summary>Dernier bâtiment de production renvoyé par le serveur ; null tant qu'aucun n'a été reçu.</summary>
        public BuildingSnapshot Building { get; private set; }

        /// <summary>
        /// Levé après chaque écriture appliquée d'une valeur serveur (gold, inventaire ou bâtiment), et au début et à
        /// la fin de chaque appel sérialisé.
        /// </summary>
        public event Action Changed;

        private long _lastIssuedRequest;
        private long _callInFlight;   // numéro de l'appel en cours ; 0 : aucun

        /// <summary>Numéro de la dernière réponse numérotée appliquée (0 : aucune).</summary>
        public long LastAppliedRequest { get; private set; }

        /// <summary>Un appel qui écrit bâtiment et inventaire est en cours (tous écrans confondus).</summary>
        public bool CallInFlight => _callInFlight != 0;

        /// <summary>
        /// Pose l'état « appel en cours » et attribue le numéro de l'appel, à l'envoi. Refusé (false, aucun envoi)
        /// si un appel est déjà en cours, quel que soit l'écran qui l'a lancé.
        /// </summary>
        public bool TryBeginServerCall(out long requestNumber)
        {
            if (_callInFlight != 0)
            {
                requestNumber = 0;
                return false;
            }
            requestNumber = IssueRequestNumber();
            _callInFlight = requestNumber;
            Changed?.Invoke();
            return true;
        }

        /// <summary>
        /// Lève l'état « appel en cours » quand l'appel <paramref name="requestNumber"/> revient (réponse, erreur ou
        /// délai d'expiration du SDK) ; sans effet pour un autre numéro. Jamais appelé sur la seule annulation d'un
        /// écran.
        /// </summary>
        public void EndServerCall(long requestNumber)
        {
            if (requestNumber == 0 || _callInFlight != requestNumber) return;
            _callInFlight = 0;
            Changed?.Invoke();
        }

        /// <summary>Numéro croissant ; hors <see cref="TryBeginServerCall"/>, réservé aux tests du filet.</summary>
        internal long IssueRequestNumber() => ++_lastIssuedRequest;

        public void ApplyServerState(long gold, InventoryState inventory)
        {
            Gold = gold;
            Inventory = inventory;
            HasState = true;
            GELogger.Debug("PlayerEconomyStateStore", $"ApplyServerState — gold={gold}, hasState=true");
            Changed?.Invoke();
        }

        public void ApplyServerInventory(InventoryState inventory)
        {
            if (!HasState)
            {
                GELogger.Warning("PlayerEconomyStateStore", "ApplyServerInventory appelé avant tout ApplyServerState — ignoré (store non amorcé).");
                return;
            }

            Inventory = inventory;
            GELogger.Debug("PlayerEconomyStateStore", "ApplyServerInventory — inventory mis à jour.");
            Changed?.Invoke();
        }

        /// <summary>
        /// Réponse de chargement (resolveLoginState) numérotée : gold, inventaire et bâtiment (s'il y en a un) écrits
        /// ensemble, un seul <see cref="Changed"/>. Ignorée (retour false, store inchangé) si son numéro ne dépasse pas
        /// le dernier appliqué.
        /// </summary>
        public bool ApplyServerLoginState(
            long requestNumber, long gold, InventoryState inventory, BuildingSnapshot building)
        {
            if (!Accept(requestNumber, "ApplyServerLoginState")) return false;

            Gold      = gold;
            Inventory = inventory;
            HasState  = true;
            if (building != null) Building = building;
            GELogger.Debug("PlayerEconomyStateStore", $"ApplyServerLoginState — requête {requestNumber}, gold={gold}");
            Changed?.Invoke();
            return true;
        }

        /// <summary>
        /// Réponse de lancement ou de collecte numérotée : bâtiment et inventaire écrits ensemble, un seul
        /// <see cref="Changed"/> (jamais d'état mélangé visible). Refusée entière tant que le store n'est pas amorcé,
        /// et ignorée si son numéro ne dépasse pas le dernier appliqué (retour false, store inchangé).
        /// </summary>
        public bool ApplyServerProductionState(long requestNumber, BuildingSnapshot building, InventoryState inventory)
        {
            if (!HasState)
            {
                // Refusée entière, sans faire avancer LastAppliedRequest : seul un chargement amorce le store.
                GELogger.Warning("PlayerEconomyStateStore",
                    $"ApplyServerProductionState — réponse {requestNumber} refusée : store non amorcé (aucun chargement).");
                return false;
            }
            if (!Accept(requestNumber, "ApplyServerProductionState")) return false;

            if (building != null)  Building  = building;
            if (inventory != null) Inventory = inventory;
            GELogger.Debug("PlayerEconomyStateStore", $"ApplyServerProductionState — requête {requestNumber}");
            Changed?.Invoke();
            return true;
        }

        private bool Accept(long requestNumber, string caller)
        {
            if (requestNumber <= LastAppliedRequest)
            {
                GELogger.Info("PlayerEconomyStateStore",
                    $"{caller} — réponse {requestNumber} ignorée : la réponse {LastAppliedRequest}, de numéro " +
                    "supérieur, est déjà appliquée.");
                return false;
            }
            LastAppliedRequest = requestNumber;
            return true;
        }
    }
}
