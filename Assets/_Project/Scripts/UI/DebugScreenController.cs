using System.Threading;
using UnityEngine;
using UnityEngine.UIElements;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Models;
using GuildsAndEmpires.Services.Player;

namespace GuildsAndEmpires.UI
{
    /// <summary>
    /// Écran debug ÉTAPE 16 — affiche le PlayerState retourné par resolveLoginState.
    ///
    /// Règles absolues (vigilances ticket) :
    /// - Aucun calcul local — affichage brut du PlayerState reçu. Vigilance V1.
    /// - Cycle de vie symétrique : async lancé en OnEnable, annulé en OnDisable. Doctrine C9.
    /// - IPlayerService résolu via ServiceLocator — jamais de Firebase.Functions ici. Doctrine C3.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class DebugScreenController : MonoBehaviour
    {
        private UIDocument _doc;
        private CancellationTokenSource _cts;

        // ── UI element refs ───────────────────────────────────────────────────
        private Label _statusLabel;
        private VisualElement _contentContainer;

        private void Awake()
        {
            _doc = GetComponent<UIDocument>();
        }

        private void OnEnable()
        {
            _cts = new CancellationTokenSource();

            var root = _doc.rootVisualElement;
            _statusLabel      = root.Q<Label>("status-label");
            _contentContainer = root.Q<VisualElement>("content-container");

            SetStatus("Connexion…", "status--loading");
            _contentContainer.Clear();

            _ = LoadAsync(_cts.Token);
        }

        private void OnDisable()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }

        // ── Async load ────────────────────────────────────────────────────────

        private async System.Threading.Tasks.Task LoadAsync(CancellationToken ct)
        {
            if (!ServiceLocator.TryResolve<IPlayerService>(out var playerService))
            {
                GELogger.Error("DebugScreen", "IPlayerService non enregistré — bootstrap incomplet.");
                SetStatus("Erreur : service manquant.", "status--error");
                return;
            }

            try
            {
                var snapshot = await playerService.ResolveLoginStateAsync(ct);
                ct.ThrowIfCancellationRequested();

                // Dispatch garanti sur le main thread par MainThreadDispatcher
                // (ResolveLoginStateAsync est awaité depuis le main thread Unity,
                //  la continuation reprend sur le contexte synchronisation Unity).
                RenderSnapshot(snapshot);
            }
            catch (System.OperationCanceledException)
            {
                // OnDisable pendant l'appel — normal, rien à afficher.
            }
            catch (PlayerServiceException ex)
            {
                GELogger.Warning("DebugScreen", $"Erreur PlayerService: {ex.UserMessage}");
                SetStatus($"Erreur : {ex.UserMessage}", "status--error");
            }
            catch (System.Exception ex)
            {
                GELogger.Error("DebugScreen", $"Erreur inattendue: {ex.Message}");
                SetStatus("Erreur inattendue, consulte la console.", "status--error");
            }
        }

        // ── Render ────────────────────────────────────────────────────────────

        private void RenderSnapshot(PlayerStateSnapshot snapshot)
        {
            SetStatus("PlayerState reçu", "status--success");

            _contentContainer.Clear();

            var uidLabel = new Label($"uid: {snapshot.Uid}");
            uidLabel.AddToClassList("uid-label");
            _contentContainer.Add(uidLabel);

            AddSection("Économie");
            AddField("gold",                snapshot.Player.Gold.ToString("N0"),  highlight: true);
            AddField("imperialFavor",       snapshot.Player.ImperialFavor.ToString("N0"));
            AddField("favorRank",           snapshot.Player.FavorRank,             highlight: true);
            AddField("guildCharterUnlocked",snapshot.Player.GuildCharterUnlocked.ToString());
            AddField("firstContractCompleted", snapshot.Player.FirstContractCompleted.ToString());

            AddSection("Inventaire — Logs");
            AddField("quantity",         snapshot.Player.Inventory.Logs.Quantity.ToString());
            AddField("cap",              snapshot.Player.Inventory.Logs.Cap.ToString());
            AddField("upgradesApplied",  snapshot.Player.Inventory.Logs.UpgradesApplied.ToString());

            AddSection("Inventaire — Planches");
            AddField("quantity",         snapshot.Player.Inventory.Planks.Quantity.ToString());
            AddField("cap",              snapshot.Player.Inventory.Planks.Cap.ToString());
            AddField("upgradesApplied",  snapshot.Player.Inventory.Planks.UpgradesApplied.ToString());

            AddSection("Inventaire — Kits Reconstruction");
            AddField("quantity",         snapshot.Player.Inventory.ReconstructionKits.Quantity.ToString());
            AddField("cap",              snapshot.Player.Inventory.ReconstructionKits.Cap.ToString());
            AddField("upgradesApplied",  snapshot.Player.Inventory.ReconstructionKits.UpgradesApplied.ToString());

            AddSection("Contexte");
            AddField("buildings",         snapshot.BuildingCount.ToString());
            AddField("activeContracts",   snapshot.ActiveContractCount.ToString());
            AddField("displayName",       snapshot.Player.DisplayName);
        }

        // ── Helpers UI ────────────────────────────────────────────────────────

        private void SetStatus(string text, string modifier)
        {
            if (_statusLabel == null) return;
            _statusLabel.text = text;
            _statusLabel.RemoveFromClassList("status--loading");
            _statusLabel.RemoveFromClassList("status--error");
            _statusLabel.RemoveFromClassList("status--success");
            _statusLabel.AddToClassList(modifier);
        }

        private void AddSection(string title)
        {
            var label = new Label(title);
            label.AddToClassList("section-header");
            _contentContainer.Add(label);
        }

        private void AddField(string key, string value, bool highlight = false)
        {
            var row = new VisualElement();
            row.AddToClassList("field-row");

            var keyLabel = new Label(key);
            keyLabel.AddToClassList("field-key");

            var valueLabel = new Label(value);
            valueLabel.AddToClassList("field-value");
            if (highlight) valueLabel.AddToClassList("field-value--highlight");

            row.Add(keyLabel);
            row.Add(valueLabel);
            _contentContainer.Add(row);
        }
    }
}
