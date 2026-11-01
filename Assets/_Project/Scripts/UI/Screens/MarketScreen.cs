using UnityEngine;
using UnityEngine.UIElements;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Core.Logging;

namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Coquille du screen Marché — titre + bouton Retour uniquement.
    /// Aucun contenu marché (prix, inventaire, gold) : voir ÉTAPE 18.2b-2.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class MarketScreen : BaseScreen
    {
        private UIDocument _doc;

        // ── UI element refs ───────────────────────────────────────────────────
        private Label  _titleLabel;
        private Label  _statusLabel;
        private Button _backButton;

        private void Awake()
        {
            _doc = GetComponent<UIDocument>();
        }

        private void OnEnable()
        {
            var root     = _doc.rootVisualElement;
            _titleLabel  = root.Q<Label>("title-label");
            _statusLabel = root.Q<Label>("status-label");
            _backButton  = root.Q<Button>("back-button");

            if (_backButton != null)
                _backButton.clicked += OnBackClicked;
        }

        private void OnDisable()
        {
            if (_backButton != null)
                _backButton.clicked -= OnBackClicked;
        }

        private void OnBackClicked()
        {
            if (ServiceLocator.TryResolve<ScreenManager>(out var screenManager))
                screenManager.Pop();
            else
                GELogger.Warning("MarketScreen", "ScreenManager non résolvable — Pop impossible.");
        }
    }
}
