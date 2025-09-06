using System;
using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using Firebase.Auth;

public class AuthUIController : MonoBehaviour
{
    [Header("Refs (TMP)")]
    public TMP_InputField emailInput;
    public TMP_InputField passwordInput;
    public TMP_Text statusText;

    [Header("Buttons")]
    public Button signInButton;
    public Button signUpButton;
    public Button signOutButton;

    void OnEnable()
    {
        if (signInButton)
        {
            signInButton.onClick.RemoveAllListeners();
            signInButton.onClick.AddListener(async () => await SignInAsync());
        }
        if (signUpButton)
        {
            signUpButton.onClick.RemoveAllListeners();
            signUpButton.onClick.AddListener(async () => await SignUpAsync());
        }
        if (signOutButton)
        {
            signOutButton.onClick.RemoveAllListeners();
            signOutButton.onClick.AddListener(async () => await SignOutAsync());
        }

        if (statusText) statusText.text = "Ready";
    }

    async Task SignInAsync()
    {
        try
        {
            if (statusText) statusText.text = "Signing in...";
            var email = emailInput ? emailInput.text : "";
            var pass  = passwordInput ? passwordInput.text : "";

            var res = await FirebaseAuth.DefaultInstance
                .SignInWithEmailAndPasswordAsync(email, pass);

            if (statusText) statusText.text = $"Logged: {res.User.Email}";
            Debug.Log($"[AUTH] SignIn OK: {res.User.UserId}");
        }
        catch (Exception e)
        {
            if (statusText) statusText.text = $"Signin error: {e.Message}";
            Debug.LogError($"[AUTH] SignIn error: {e}");
        }
    }

    async Task SignUpAsync()
    {
        try
        {
            if (statusText) statusText.text = "Creating account...";
            var email = emailInput ? emailInput.text : "";
            var pass  = passwordInput ? passwordInput.text : "";

            var res = await FirebaseAuth.DefaultInstance
                .CreateUserWithEmailAndPasswordAsync(email, pass);

            if (statusText) statusText.text = $"Created: {res.User.Email}";
            Debug.Log($"[AUTH] SignUp OK: {res.User.UserId}");
        }
        catch (Exception e)
        {
            if (statusText) statusText.text = $"Signup error: {e.Message}";
            Debug.LogError($"[AUTH] SignUp error: {e}");
        }
    }

    async Task SignOutAsync()
    {
        try
        {
            FirebaseAuth.DefaultInstance.SignOut();
            if (statusText) statusText.text = "Signed out";
        }
        catch (Exception e)
        {
            if (statusText) statusText.text = $"Signout error: {e.Message}";
            Debug.LogError($"[AUTH] SignOut error: {e}");
        }
    }
}
