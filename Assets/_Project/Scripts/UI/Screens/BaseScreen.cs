using UnityEngine;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Base class for all full-screen UI panels. Extend this and override OnShow/OnHide.
    ///
    /// Screens are driven by ScreenManager (Push/Pop/Replace/SetRoot).
    /// Do not call Show() or Hide() directly from game logic — go through ScreenManager so
    /// the navigation stack stays consistent.
    ///
    /// To add transitions: call DOTween in OnShow/OnHide. BaseScreen handles the active state;
    /// the subclass handles the visual animation.
    /// </summary>
    public abstract class BaseScreen : MonoBehaviour, IScreen
    {
        public bool IsVisible { get; private set; }

        public void Show()
        {
            if (IsVisible) return;
            gameObject.SetActive(true);
            IsVisible = true;
            OnShow();
        }

        public void Hide()
        {
            if (!IsVisible) return;
            OnHide();
            IsVisible = false;
            gameObject.SetActive(false);
        }

        /// <summary>Called after the screen becomes visible. Animate in, subscribe to events.</summary>
        protected virtual void OnShow() { }

        /// <summary>Called before the screen becomes invisible. Animate out, unsubscribe from events.</summary>
        protected virtual void OnHide() { }
    }
}
