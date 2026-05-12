using System;
using System.Threading;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using Firebase.Auth;
using GuildsAndEmpires.Core;
using GuildsAndEmpires.Core.Threading;
using GuildsAndEmpires.Core.Logging;
using GuildsAndEmpires.Services;
using GuildsAndEmpires.Services.Economy;

/// <summary>
/// Affiche le profil du joueur connecté en temps réel et propose les actions économiques disponibles.
///
/// Reçoit IProfileService et IEconomyService via ServiceLocator — aucune dépendance directe au SDK Firebase.
/// Les callbacks Firestore arrivent déjà sur le main thread (dispatché par ProfileService).
/// Le StateChanged Firebase Auth est dispatché manuellement via MainThreadDispatcher.
/// </summary>
public class ProfileUIController : MonoBehaviour
{
    [Header("UI")]
    public TMP_Text emailText;
    public TMP_Text statsText;
    public TMP_Text bonusStatusText;
    public Button claimBonusButton;

    private IDisposable         _profileListener;
    private CancellationTokenSource _cts;
    private string              _currentUid;

    private void OnEnable()
    {
        _cts = new CancellationTokenSource();

        if (claimBonusButton)
        {
            claimBonusButton.onClick.RemoveAllListeners();
            claimBonusButton.onClick.AddListener(OnClaimBonusClicked);
        }

        // StateChanged arrive sur un thread Firebase — dispatch obligatoire sur le main thread.
        FirebaseAuth.DefaultInstance.StateChanged += OnAuthStateChanged;
        SetupForUser(FirebaseAuth.DefaultInstance.CurrentUser);
    }

    private void OnDisable()
    {
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;

        FirebaseAuth.DefaultInstance.StateChanged -= OnAuthStateChanged;
        TearDownListener();
    }

    private void OnAuthStateChanged(object sender, EventArgs e)
    {
        // Firebase Auth StateChanged n'est pas garanti sur le main thread sur Android.
        MainThreadDispatcher.Post(() => SetupForUser(FirebaseAuth.DefaultInstance.CurrentUser));
    }

    private void SetupForUser(FirebaseUser user)
    {
        TearDownListener();
        SetBonusStatus(string.Empty);

        if (user == null)
        {
            _currentUid = null;
            if (emailText) emailText.text = "Non connecté";
            if (statsText)  statsText.text  = string.Empty;
            return;
        }

        _currentUid = user.UserId;
        if (emailText) emailText.text = user.Email ?? "(sans email)";

        // ServiceLocator.TryResolve : le service peut ne pas encore être enregistré
        // si l'UI s'active avant la fin du bootstrap (état Initializing).
        if (!ServiceLocator.TryResolve<IProfileService>(out var profileService))
        {
            GELogger.Warning("ProfileUI", "IProfileService non encore disponible.");
            return;
        }

        _profileListener = profileService.Observe(_currentUid, OnProfileChanged, _cts.Token);
    }

    private void OnProfileChanged(ProfileData profile)
    {
        // Déjà sur le main thread (dispatché par ProfileService via MainThreadDispatcher).
        if (statsText)
            statsText.text = $"Niv. {profile.Level} — Or : {profile.Gold:N0}";
    }

    private void TearDownListener()
    {
        _profileListener?.Dispose();
        _profileListener = null;
    }

    // ── Action économique ────────────────────────────────────────────────────

    private async void OnClaimBonusClicked()
    {
        if (string.IsNullOrEmpty(_currentUid)) return;
        if (_cts == null || _cts.IsCancellationRequested) return;

        if (!ServiceLocator.TryResolve<IEconomyService>(out var economyService))
        {
            SetBonusStatus("Service indisponible.");
            return;
        }

        SetClaimButtonInteractable(false);
        SetBonusStatus("Réclamation en cours…");

        try
        {
            var result = await economyService.ClaimDailyBonusAsync(_cts.Token);
            SetBonusStatus($"+{result.GoldDelta} or ! Total : {result.NewGold:N0}");
            GELogger.Info("ProfileUI", $"Bonus réclamé — +{result.GoldDelta} or");
        }
        catch (EconomyException ex) when (ex.IsCooldownError)
        {
            SetBonusStatus(ex.UserMessage);
        }
        catch (EconomyException ex)
        {
            SetBonusStatus($"Erreur : {ex.UserMessage}");
            GELogger.Warning("ProfileUI", $"ClaimBonus échoué [{ex.ErrorCode}]: {ex.UserMessage}");
        }
        catch (OperationCanceledException)
        {
            // OnDisable pendant l'appel — normal, rien à afficher.
        }
        finally
        {
            SetClaimButtonInteractable(true);
        }
    }

    private void SetBonusStatus(string msg)
    {
        if (bonusStatusText) bonusStatusText.text = msg;
    }

    private void SetClaimButtonInteractable(bool value)
    {
        if (claimBonusButton) claimBonusButton.interactable = value;
    }
}
