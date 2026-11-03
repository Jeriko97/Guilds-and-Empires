using System;
using System.Collections.Generic;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Registre des clés d'idempotence des intentions en attente (D-ETAPE19-003 ; patron PendingSales de
    /// MarketScreen, D-ETAPE18-001).
    ///
    /// Une intention = un libellé qui porte tout le contenu de la requête (ex. "start:sawmill_0:1:planks:10" —
    /// une clé = un contenu, D-ETAPE19-003) + l'état serveur affiché au clic (référence d'objet). Même libellé et
    /// même référence → même clé (réessai après une erreur, doctrine C5) ; autre référence → nouvelle clé. La clé
    /// n'est libérée qu'après une réponse serveur parsée avec succès (alreadyApplied compris) : sur toute erreur
    /// (réseau, délai, refus), elle est conservée.
    ///
    /// La réutilisation dépend entièrement de la référence passée par l'appelant : elle doit désigner un état qui
    /// survit à l'écran et ne change qu'à une réponse serveur (19.4c-1 : le bâtiment du PlayerEconomyStateStore).
    /// Une référence recréée à chaque appel donnerait une nouvelle clé à chaque réessai.
    /// <see cref="PurgeStale"/> retire les intentions formées sur un autre état que l'état courant : si elles
    /// avaient abouti, l'état reçu depuis les inclut déjà ; sinon il ne s'est rien passé (patron PendingSales).
    ///
    /// L'appelant détient l'instance en statique (elle survit à la destruction de l'écran) et la vide au
    /// rechargement du domaine (RuntimeInitializeOnLoadMethod, SubsystemRegistration).
    /// </summary>
    public sealed class PendingIntentKeys
    {
        private sealed class Pending
        {
            public readonly string Key;
            public readonly object BasedOn;

            public Pending(string key, object basedOn)
            {
                Key     = key;
                BasedOn = basedOn;
            }
        }

        private readonly Dictionary<string, Pending> _pending = new();

        /// <summary>Nombre d'intentions en attente (tests).</summary>
        public int Count => _pending.Count;

        /// <summary>
        /// Clé de l'intention : la clé en attente si l'état affiché est le même (même référence),
        /// sinon une nouvelle clé (Guid), qui remplace l'ancienne.
        /// </summary>
        public string GetOrCreate(string intent, object basedOn)
        {
            if (_pending.TryGetValue(intent, out var pending) && ReferenceEquals(pending.BasedOn, basedOn))
                return pending.Key;

            var key = Guid.NewGuid().ToString();
            _pending[intent] = new Pending(key, basedOn);
            return key;
        }

        /// <summary>
        /// À appeler après une réponse serveur parsée avec succès : libère l'intention si elle porte
        /// encore cette clé (une intention remplacée entre-temps n'est pas touchée).
        /// </summary>
        public void Resolve(string intent, string key)
        {
            if (_pending.TryGetValue(intent, out var pending) && pending.Key == key)
                _pending.Remove(intent);
        }

        /// <summary>
        /// Retire les intentions dont la référence n'est pas <paramref name="current"/> (intentions périmées).
        /// À appeler avant <see cref="GetOrCreate"/>, avec la même référence.
        /// </summary>
        public void PurgeStale(object current)
        {
            List<string> stale = null;
            foreach (var kv in _pending)
                if (!ReferenceEquals(kv.Value.BasedOn, current))
                    (stale ??= new List<string>()).Add(kv.Key);
            if (stale == null) return;
            foreach (var intent in stale)
                _pending.Remove(intent);
        }

        public void Clear() => _pending.Clear();
    }
}
