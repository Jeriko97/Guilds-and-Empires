using System;
using System.Collections.Generic;

namespace GuildsAndEmpires.Core
{
    /// <summary>
    /// Lightweight service registry. Register during AppBootstrap, resolve anywhere.
    /// Main-thread only — no locking, intentional. Services are registered once at boot.
    ///
    /// Max 3 layers between UI and Firebase: UI → IService → ServiceLocator → concrete impl.
    /// </summary>
    public static class ServiceLocator
    {
        private static readonly Dictionary<Type, object> _services = new();

        /// <summary>Registers a service. Throws if the type is already registered.</summary>
        public static void Register<T>(T service) where T : class
        {
            var type = typeof(T);
            if (_services.ContainsKey(type))
                throw new InvalidOperationException(
                    $"ServiceLocator: {type.Name} is already registered. Call Replace<T> to override.");
            _services[type] = service;
        }

        /// <summary>Registers or replaces a service without throwing.</summary>
        public static void Replace<T>(T service) where T : class => _services[typeof(T)] = service;

        /// <summary>Resolves a required service. Throws if not registered.</summary>
        public static T Resolve<T>() where T : class
        {
            if (_services.TryGetValue(typeof(T), out var svc))
                return (T)svc;
            throw new InvalidOperationException(
                $"ServiceLocator: {typeof(T).Name} is not registered. Was it registered in AppBootstrap?");
        }

        /// <summary>Resolves an optional service. Returns false if not registered.</summary>
        public static bool TryResolve<T>(out T service) where T : class
        {
            if (_services.TryGetValue(typeof(T), out var raw))
            {
                service = (T)raw;
                return true;
            }
            service = null;
            return false;
        }

        public static void Unregister<T>() where T : class => _services.Remove(typeof(T));

        /// <summary>For tests only — resets all registrations between test runs.</summary>
        internal static void Reset() => _services.Clear();
    }
}
