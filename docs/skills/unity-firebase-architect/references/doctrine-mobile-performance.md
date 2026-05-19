# Doctrine — Mobile Performance Budgets

## Pourquoi un budget, pas des guidelines

Un jeu mobile sans budget de performance est un jeu qui dégrade silencieusement.
Un Snapdragon 665 avec 3 GB RAM est votre cible réelle — pas votre iPhone de dev.
Chaque décision technique doit être évaluée contre ces chiffres.

---

## Budgets — Chiffres imposés

| Métrique | Budget | Mesure |
|---|---|---|
| Frame time | ≤ 16.6 ms (60 fps) | Unity Profiler, Target → Snapdragon 665 |
| GC alloc par frame (steady state) | 0 B | Unity Profiler Memory section |
| Unity heap (runtime) | ≤ 100 MB | Memory Profiler package |
| Texture memory | ≤ 80 MB | Memory Profiler → Textures |
| Draw calls | ≤ 100 / frame | Unity Frame Debugger |
| Batches | ≤ 60 / frame | Unity Stats window |
| APK initial download | ≤ 100 MB | Build Settings → Build Size Report |
| Build installed size | ≤ 300 MB | Addressables remote content inclus |
| Firebase SDK overhead | ~20 MB | Déjà budgété dans les 100 MB APK |
| Session battery drain | ≤ 5% / 30 min | Fermez les listeners en background |

---

## GC — Zero alloc dans les hot paths

### Ce qui alloue (à bannir des hot paths)

```csharp
// WRONG — alloue une string à chaque frame
void Update() { goldText.text = "Gold: " + profile.gold; }

// WRONG — alloue string[] à chaque appel
void Update() { Debug.Log(string.Format("FPS: {0}", fps)); }

// WRONG — alloue IEnumerable à chaque appel
void Update() { foreach (var item in GetItems()) { ... } }

// WRONG — alloue une List<T> à chaque calcul
List<Building> GetReadyBuildings() { return buildings.Where(b => b.IsReady).ToList(); }
```

### Patterns zero-alloc (obligatoires)

```csharp
// CORRECT — TMP SetText with args, no string alloc
private int _lastGold = -1;
void UpdateGoldDisplay(int gold)
{
    if (gold == _lastGold) return; // update seulement si changement
    _lastGold = gold;
    goldText.SetText("Gold: {0}", gold); // TMP format, zero alloc
}

// CORRECT — StringBuilder réutilisé
private readonly System.Text.StringBuilder _sb = new(64);
void UpdateStatusText(int gold, int wood)
{
    _sb.Clear();
    _sb.Append("Gold: ").Append(gold).Append(" | Wood: ").Append(wood);
    statusText.SetText(_sb);
}

// CORRECT — pre-allocated list, reused
private readonly List<Building> _readyBuildings = new(16);
void GetReadyBuildings(List<Building> result)
{
    result.Clear();
    for (int i = 0; i < _buildings.Count; i++)
        if (_buildings[i].IsReady) result.Add(_buildings[i]);
}
```

---

## Addressables — Chargement d'assets

### Règle stricte

```
Assets NON addressables (dans le build) :
  - Bootstrap assets (AppController, MainThreadDispatcher)
  - Fonts (TextMeshPro)
  - Shaders (URP renderer)

Assets Addressables (chargés à la demande) :
  - Sprites d'icônes (ressources, bâtiments, items)
  - Audio clips
  - Scènes non-boot (Auth, MainHub, Market)
  - Assets saisonniers / événements LiveOps
  - Tout ce qui pèse > 10 KB
```

```csharp
// WRONG — Resources.Load bloque le main thread
var sprite = Resources.Load<Sprite>("Icons/wood");

// CORRECT — Addressables async, avec CancellationToken
public async Task<Sprite> LoadIconAsync(string key, CancellationToken ct)
{
    var handle = Addressables.LoadAssetAsync<Sprite>(key);
    await handle.Task.WaitAsync(ct);
    if (handle.Status != AsyncOperationStatus.Succeeded)
    {
        Addressables.Release(handle);
        return _fallbackSprite;
    }
    return handle.Result;
}
// Libérer quand la scène se décharge :
void OnDisable() { Addressables.Release(_iconHandle); }
```

---

## Draw Calls — UI Budget

L'UI est le principal driver de draw calls dans un MMO idle mobile.

```
Budget total : ≤ 100 draw calls
  - Gameplay world : ≤ 30
  - UI Canvas principal : ≤ 40  ← utiliser UI batching (même material, même atlas)
  - UI Overlay (HUD) : ≤ 20
  - Effets VFX : ≤ 10
```

**Règles UI batching :**
- Un seul Canvas par écran (ne pas nester les Canvas inutilement — brise le batching)
- Sprite Atlas par thème : `resources-atlas`, `buildings-atlas`, `ui-common-atlas`
- Pas de Raycast Target sur les éléments non-interactifs (coûte un check par frame)
- Éviter les masques (Mask, RectMask2D brisent le batching sous le masque)

---

## Firebase — Performance sur mobile

### Listeners et batterie

```csharp
// OBLIGATOIRE — suspend les connexions Firebase en background
void OnApplicationPause(bool paused)
{
    if (paused)
    {
        _profileListener?.Dispose();
        _profileListener = null;
        // Firestore ferme la WebSocket automatiquement après le Dispose
    }
    else
    {
        // Reconnexion sur resume — fetch d'abord, listener ensuite
        _ = RefreshOnResumeAsync(_cts.Token);
    }
}

private async Task RefreshOnResumeAsync(CancellationToken ct)
{
    // Fetch l'état serveur (peut avoir changé pendant l'absence)
    var profile = await Services.Profile.GetAsync(ct);
    MainThreadDispatcher.Post(() => UpdateUI(profile));
    // Puis réouvrir le listener temps réel
    _profileListener = Services.Profile.Observe(uid, OnProfileChanged);
}
```

### Initialisation Firebase — loading screen obligatoire

Firebase Unity SDK v13.x : 2-5 secondes d'init sur Snapdragon 665.
Sans écran de chargement + guard, l'app affiche une UI cassée ou crashe.

```csharp
// AppController.cs — séquence d'init gardée
public async Task InitAsync()
{
    ShowLoadingScreen("Initialisation...");
    
    try
    {
        // Peut prendre jusqu'à 5 secondes sur appareil lent
        var status = await FirebaseApp.CheckAndFixDependenciesAsync()
            .WaitAsync(TimeSpan.FromSeconds(10)); // timeout de sécurité
        
        if (status != DependencyStatus.Available)
        {
            ShowError($"Firebase unavailable: {status}");
            return;
        }
        
        // Offline persistence AVANT le premier read
        FirebaseFirestore.DefaultInstance.Settings = new FirebaseFirestoreSettings
        {
            PersistenceEnabled = true,
            CacheSizeBytes = 50 * 1024 * 1024 // 50 MB cache local
        };
        
        OnFirebaseReady?.Invoke();
    }
    catch (TimeoutException)
    {
        ShowError("Connexion impossible. Vérifiez votre réseau.");
    }
}
```

---

## Safe Area — Android obligatoire

Appareils cibles : encoche, punch-hole, barre de navigation gestuelle.

```csharp
[RequireComponent(typeof(RectTransform))]
public class SafeAreaPanel : MonoBehaviour
{
    void Awake() => Apply();

#if UNITY_EDITOR
    void OnValidate() => Apply(); // preview dans l'éditeur avec Device Simulator
#endif

    void Apply()
    {
        var safe = Screen.safeArea;
        var rt = GetComponent<RectTransform>();
        var min = new Vector2(safe.x / Screen.width, safe.y / Screen.height);
        var max = new Vector2((safe.x + safe.width) / Screen.width,
                              (safe.y + safe.height) / Screen.height);
        rt.anchorMin = min;
        rt.anchorMax = max;
    }
}
```

**Règle :** Chaque Canvas racine a un `SafeAreaPanel` comme enfant direct.
Tous les éléments UI sont enfants du `SafeAreaPanel`, jamais du Canvas directement.

---

## Build Size — Checklist

```
Packages à retirer (détectés dans l'audit) :
  ☐ Visual Scripting (1.9.7)    — ~15 MB build, 0 utilité
  ☐ Multiplayer Center (1.0.0)  — ~5 MB build, 0 utilité

Packages à ajouter :
  ☐ Addressables                — Critique pour mobile patching
  ☐ DOTween (dotween.demigiant.com) — UI animations sans GC

Shaders — URP :
  ☐ Désactiver les variants shader inutilisés (Shader Stripping dans Player Settings)
  ☐ Lit shader → Unlit pour les icônes et UI sprites (pas besoin de lighting)

Textures :
  ☐ Format Android : ASTC (qualité + compression)
  ☐ Mip maps : désactivés pour les sprites UI (seulement utiles pour les objets 3D)
  ☐ Compression atlas : 2048×2048 max par atlas
```

---

## Profiling — Workflow obligatoire avant toute PR UI

1. Connecter un Snapdragon 665 réel (ou profil Android Mid-Range dans Device Simulator)
2. Unity Profiler → CPU Usage → vérifier frame time < 16.6 ms
3. Unity Profiler → Memory → vérifier GC Alloc = 0 en steady state
4. Frame Debugger → vérifier draw calls < 100
5. Memory Profiler → snapshot → vérifier Unity heap < 100 MB

**Si les chiffres ne sont pas respectés, la PR ne merge pas.**
