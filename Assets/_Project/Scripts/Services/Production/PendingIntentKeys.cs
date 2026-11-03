using System;
using System.Collections.Generic;

namespace GuildsAndEmpires.Services.Production
{
    /// <summary>
    /// Registre des clés d'idempotence des intentions en attente (D-ETAPE19-003 ; patron PendingSales de
    /// MarketScreen, D-ETAPE18-001).
    ///
    /// Une intention = un libellé (ex. "start:sawmill_0:1:logs") + l'état serveur affiché au clic
    /// (référence d'objet). Même libellé et même état → même clé (réessai après une erreur, doctrine C5) ;
    /// état affiché différent → nouvelle clé. La clé n'est libérée qu'après une réponse serveur parsée avec
    /// succès (alreadyApplied compris) : sur toute erreur (réseau, délai, refus), elle est conservée.
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

        public void Clear() => _pending.Clear();
    }
}
