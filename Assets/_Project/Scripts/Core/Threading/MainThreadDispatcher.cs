using System;
using System.Collections.Concurrent;
using UnityEngine;

namespace GuildsAndEmpires.Core.Threading
{
    /// <summary>
    /// Dispatches actions from background threads to the Unity main thread.
    /// Required because Firebase SDK callbacks (Auth, Firestore listeners) arrive on a thread-pool
    /// thread, and touching any UnityEngine object from there causes a crash on Android.
    ///
    /// Usage: MainThreadDispatcher.Post(() => myText.text = profile.displayName);
    ///
    /// Placed on the Bootstrap GameObject — lives for the full app lifetime.
    /// </summary>
    [DefaultExecutionOrder(-99)]
    public sealed class MainThreadDispatcher : MonoBehaviour
    {
        private static readonly ConcurrentQueue<Action> _queue = new();
        private static MainThreadDispatcher _instance;

        /// <summary>True once the dispatcher MonoBehaviour is active in the scene.</summary>
        public static bool IsAvailable => _instance != null;

        /// <summary>
        /// Posts an action to run on the Unity main thread.
        /// Safe to call from any thread. No-op if action is null.
        /// </summary>
        public static void Post(Action action)
        {
            if (action != null)
                _queue.Enqueue(action);
        }

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }
            _instance = this;
        }

        private void Update()
        {
            while (_queue.TryDequeue(out var action))
            {
                try
                {
                    action();
                }
                catch (Exception ex)
                {
                    // Log without re-throwing — a single failed callback must not kill the dispatcher.
                    UnityEngine.Debug.LogError($"[MainThreadDispatcher] Unhandled exception: {ex}");
                }
            }
        }

        private void OnDestroy()
        {
            if (_instance == this)
                _instance = null;
        }
    }
}
