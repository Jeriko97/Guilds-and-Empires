using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using Firebase.Auth;

public class ProfileUIController : MonoBehaviour
{
    [Header("UI")]
    public TMP_Text emailText;
    public TMP_Text statsText;
    public Button addGoldButton;

    private IDisposable listener;
    private string currentUid;

    void OnEnable()
    {
        if (addGoldButton)
        {
            addGoldButton.onClick.RemoveAllListeners();
            addGoldButton.onClick.AddListener(AddGold10);
        }

        FirebaseAuth.DefaultInstance.StateChanged += OnAuthStateChanged;
        SetupForUser(FirebaseAuth.DefaultInstance.CurrentUser);
    }

    void OnDisable()
    {
        FirebaseAuth.DefaultInstance.StateChanged -= OnAuthStateChanged;
        TearDownListener();
    }

    private void OnAuthStateChanged(object sender, EventArgs e)
    {
        SetupForUser(FirebaseAuth.DefaultInstance.CurrentUser);
    }

    private void SetupForUser(FirebaseUser user)
    {
        TearDownListener();

        if (user == null)
        {
            currentUid = null;
            if (emailText) emailText.text = "Not logged";
            if (statsText) statsText.text = "New Text";
            return;
        }

        currentUid = user.UserId;
        if (emailText) emailText.text = user.Email ?? "(no email)";

        // Écoute en temps réel du profil
        listener = ProfileService.Observe(currentUid, profile =>
        {
            if (statsText) statsText.text = $"Lvl {profile.level} — Gold {profile.gold}";
        });
    }

    private void TearDownListener()
    {
        listener?.Dispose();
        listener = null;
    }

    private async void AddGold10()
    {
        if (string.IsNullOrEmpty(currentUid)) return;
        await ProfileService.AddGoldAsync(currentUid, 10);
    }
}
