using System.Collections.Generic;
using UnityEngine;
using GuildsAndEmpires.Core.Bootstrap;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Stack-based screen navigation. Screens are instantiated prefabs parented to ScreenContainer.
    ///
    /// Push    — adds a screen on top; the screen below is hidden but stays alive in memory.
    /// Pop     — removes the top screen and reveals the one below it.
    /// Replace — swaps the current top screen; history below is preserved.
    /// SetRoot — clears the entire stack and establishes a new root (e.g. after login/logout).
    ///
    /// No animations are wired yet — override OnShow/OnHide in each BaseScreen subclass to add
    /// DOTween transitions without touching this class.
    /// </summary>
    [DefaultExecutionOrder(-80)]
    public sealed class ScreenManager : MonoBehaviour
    {
        [Tooltip("Parent transform for all instantiated screen prefabs. Use a Canvas child.")]
        [SerializeField] private Transform _screenContainer;

        private readonly Stack<BaseScreen> _stack = new();

        public BaseScreen Current => _stack.Count > 0 ? _stack.Peek() : null;
        public int Depth => _stack.Count;

        /// <summary>
        /// Called by AppBootstrap once the initialization pipeline completes.
        /// Push the first screen based on current auth state here.
        /// </summary>
        public void OnBootReady(AppBootstrap.AppState state)
        {
            GELogger.Info("ScreenManager", $"Boot ready — state: {state}");
            // TODO: Resolve IAuthService, push LoginScreen or HomeScreen based on auth state.
        }

        /// <summary>
        /// Pushes a new screen instance. The current screen is hidden but kept in memory.
        /// Use when navigating forward (e.g. Home → BuildingDetail).
        /// </summary>
        public void Push(BaseScreen screen)
        {
            if (screen == null)
            {
                GELogger.Warning("ScreenManager", "Push called with null screen.");
                return;
            }
            Current?.Hide();
            _stack.Push(screen);
            screen.Show();
            GELogger.Debug("ScreenManager", $"Push '{screen.name}' — depth {_stack.Count}");
        }

        /// <summary>
        /// Removes the top screen (destroys it) and reveals the screen below.
        /// Use for back navigation.
        /// </summary>
        public void Pop()
        {
            if (_stack.Count == 0)
            {
                GELogger.Warning("ScreenManager", "Pop on empty stack — ignored.");
                return;
            }
            var top = _stack.Pop();
            top.Hide();
            Destroy(top.gameObject);
            Current?.Show();
            GELogger.Debug("ScreenManager", $"Pop — depth now {_stack.Count}");
        }

        /// <summary>
        /// Replaces the current top screen (destroys it) without affecting the stack below.
        /// Use for flows where going back should skip the replaced step (e.g. loading → home).
        /// </summary>
        public void Replace(BaseScreen screen)
        {
            if (screen == null)
            {
                GELogger.Warning("ScreenManager", "Replace called with null screen.");
                return;
            }
            if (_stack.Count > 0)
            {
                var old = _stack.Pop();
                old.Hide();
                Destroy(old.gameObject);
            }
            _stack.Push(screen);
            screen.Show();
            GELogger.Debug("ScreenManager", $"Replace '{screen.name}' — depth {_stack.Count}");
        }

        /// <summary>
        /// Clears the entire navigation stack and establishes a new root screen.
        /// Use after login/logout to prevent the user from navigating back to the previous state.
        /// </summary>
        public void SetRoot(BaseScreen screen)
        {
            if (screen == null)
            {
                GELogger.Warning("ScreenManager", "SetRoot called with null screen.");
                return;
            }
            while (_stack.Count > 0)
            {
                var s = _stack.Pop();
                s.Hide();
                Destroy(s.gameObject);
            }
            _stack.Push(screen);
            screen.Show();
            GELogger.Debug("ScreenManager", $"SetRoot '{screen.name}'");
        }
    }
}
