# Conventions — Guilds & Empires

## C# Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Class | PascalCase | `FirebaseEconomyService` |
| Interface | IPascalCase | `IEconomyService` |
| ScriptableObject | PascalCase + SO suffix | `ResourceTypeSO` |
| Private field | _camelCase | `_profileListener` |
| Async method | PascalCase + Async | `LoadProfileAsync` |
| Firestore model | PascalCase, no suffix | `PlayerProfile` |

## Git (trunk-based, solo founder)

```
main          ← always deployable
feature/xxx   ← max 2 days lifetime
fix/xxx       ← hotfix off main
```

### Commit format (Conventional Commits)
```
feat(economy): add collectBuilding Cloud Function
fix(ui): dispatch Firebase callbacks to main thread
refactor(services): extract IEconomyService interface
chore(deps): upgrade Firebase SDK to 13.2.0
```
Scopes: `economy`, `guild`, `market`, `auth`, `ui`, `services`, `firebase`, `addressables`, `liveops`, `iap`

## PR self-review checklist
- [ ] No client-side economic writes
- [ ] Firebase callbacks dispatch to main thread
- [ ] Firestore listeners disposed in OnDisable
- [ ] CancellationToken passed to async methods
- [ ] ScriptableObject used for config (not hardcoded)
- [ ] Remote Config key has a registered default

## GitHub Actions — Cloud Functions deploy
```yaml
on:
  push:
    branches: [main]
    paths: ['functions/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd functions && npm ci && npm run build
      - run: npx firebase deploy --only functions --project ${{ vars.FIREBASE_PROJECT }}
        env: { FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }} }
```

## Analytics — Required Events

| Event | When | Parameters |
|-------|------|-----------|
| `session_start` | App foreground | `uid`, `level` |
| `auth_success` | Login/signup | `method` |
| `building_collected` | Collection | `type`, `level`, `yield` |
| `trade_executed` | Market buy/sell | `resource_type`, `quantity`, `price` |
| `iap_completed` | Receipt validated | `product_id`, `gems_granted` |
| `error_cf_failed` | CF error | `function_name`, `error_code` |

## Remote Config — Key Registry

| Key | Type | Default |
|-----|------|---------|
| `woodProductionRate` | int | 10 |
| `collectionIntervalSeconds` | int | 300 |
| `marketListingFeePercent` | int | 5 |
| `eventActive` | bool | false |
| `eventMultiplier` | float | 1.0 |
| `guildMaxMembers` | int | 20 |
