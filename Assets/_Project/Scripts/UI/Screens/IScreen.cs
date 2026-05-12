namespace GuildsAndEmpires.UI.Screens
{
    /// <summary>
    /// Contract for all full-screen UI panels managed by ScreenManager.
    /// Game code calls Show/Hide only through ScreenManager — never directly.
    /// </summary>
    public interface IScreen
    {
        bool IsVisible { get; }
        void Show();
        void Hide();
    }
}
