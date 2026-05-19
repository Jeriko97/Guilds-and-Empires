# Unity Patterns — Guilds & Empires

## Async/Await

### CancellationToken everywhere
```csharp
void OnEnable()  { _cts = new CancellationTokenSource(); _ = LoadAsync(_cts.Token); }
void OnDisable() { _cts?.Cancel(); _cts?.Dispose(); }

private async Task LoadAsync(CancellationToken ct)
{
    var data = await Services.Economy.GetResourcesAsync(ct);
    ct.ThrowIfCancellationRequested(); // guard before touching Unity objects
    RefreshUI(data);
}
```

### async void only for Unity event callbacks
```csharp
// OK — Unity event
private async void OnCollectClicked()
{
    try { await Services.Buildings.CollectAsync(id, _cts.Token); }
    catch (OperationCanceledException) { }
    catch (Exception e) { ShowError(e.Message); }
}
// WRONG — async void in utility method (exception swallowed silently)
private async void LoadData() { await SomethingAsync(); }
```

## Mobile Performance

### Avoid GC in hot paths
```csharp
// WRONG — allocates string every frame
void Update() { statusText.text = "Gold: " + profile.gold; }

// CORRECT — zero-alloc TMP API, update only on change
private int _lastGold = -1;
void UpdateGoldDisplay(int gold)
{
    if (gold == _lastGold) return;
    _lastGold = gold;
    statsText.SetText("Gold: {0}", gold);
}
```

### App Backgrounding — close Firebase connections
```csharp
void OnApplicationPause(bool paused)
{
    if (paused)  { _listener?.Dispose(); _listener = null; }
    else         { _listener = Services.Profile.Observe(uid, OnChanged); }
}
```

## Addressables
Use for: UI sprites/icons, audio, non-Boot scenes, seasonal assets.
Do NOT use for: scripts, core bootstrap assets, files < 10KB.

```csharp
var handle = Addressables.LoadAssetAsync<Sprite>(iconKey);
await handle.Task.WaitAsync(ct);
if (handle.Status != AsyncOperationStatus.Succeeded) return _fallbackSprite;
return handle.Result;
```

## Safe Area
```csharp
[RequireComponent(typeof(RectTransform))]
public class SafeAreaPanel : MonoBehaviour
{
    void Awake()
    {
        var safe = Screen.safeArea;
        var rt = GetComponent<RectTransform>();
        var min = new Vector2(safe.x / Screen.width, safe.y / Screen.height);
        var max = new Vector2((safe.x + safe.width) / Screen.width,
                              (safe.y + safe.height) / Screen.height);
        rt.anchorMin = min; rt.anchorMax = max;
    }
}
```

## Error Handling for Cloud Functions
```csharp
public async Task<Result<CollectResult>> CollectBuildingAsync(string id, CancellationToken ct)
{
    try
    {
        var fn = FirebaseFunctions.DefaultInstance.GetHttpsCallable("collectBuilding");
        var result = await fn.CallAsync(new Dictionary<string, object>
            { ["buildingId"] = id, ["requestId"] = Guid.NewGuid().ToString() });
        ct.ThrowIfCancellationRequested();
        return Result<CollectResult>.Ok(ParseResult(result.Data));
    }
    catch (FirebaseFunctionsException e) when (e.ErrorCode == FunctionsErrorCode.FailedPrecondition)
        { return Result<CollectResult>.Fail("Not ready yet"); }
    catch (FirebaseFunctionsException e) when (e.ErrorCode == FunctionsErrorCode.Unauthenticated)
        { await Services.Auth.SignOutAsync(); return Result<CollectResult>.Fail("Session expired"); }
    catch (OperationCanceledException)
        { return Result<CollectResult>.Fail("Cancelled"); }
}
```
