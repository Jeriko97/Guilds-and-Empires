# Session 2026-05-31 — ÉTAPE 16 Unity Bootstrap

## Jalon majeur

**Premier client Unity opérationnel — chaîne complète Auth → resolveLoginState → DebugScreen.**

Premier ticket Unity du projet. Paradigme inversé : de TypeScript/Firebase vers C#/Unity.

## Tâche 0 — Résultats de l'audit

### SDK Firebase présents (v13.1.0)

| Module | État |
|---|---|
| Firebase.App | ✅ |
| Firebase.Auth | ✅ |
| Firebase.Firestore | ✅ |
| Firebase.Functions | ✅ |
| Firebase.RemoteConfig | ✅ |
| Firebase.AppCheck | ✅ (hors-scope ÉTAPE 16) |

### Code Auth existant

- `AuthUIController.cs` (pré-alpha, ~127 LOC) — email/password, crée `/profiles/{uid}` (ancien schéma). Violations doctrinales multiples. **Non réutilisé.**
- `ProfileService.cs` + `ProfileUIController.cs` — architecture plus propre (ServiceLocator, IProfileService), mais lit `/profiles/` (ancien schéma) et uGUI. **Non cassé, non réutilisé.**

### Ce qui était déjà conforme

- `MainThreadDispatcher` ✅ — doctrine C2 exacte
- `ServiceLocator` (static class) ✅ — Register/Resolve/TryResolve
- `FirebaseBootstrap` ✅ — CheckAndFixDependenciesAsync + PersistenceEnabled
- `AppBootstrap` ✅ — pipeline séquentiel, DontDestroyOnLoad, CancellationToken
- `GELogger` ✅

### Décision cible (D-ETAPE16-001)

**Projet Firebase dev/staging** — aucune config `UseEmulator` dans Unity. Investissement
émulateur Unity hors-scope, différé à une étape ultérieure si besoin réel.

## Livrables

### L1 — MainThreadDispatcher
**Déjà présent.** `Assets/_Project/Scripts/Core/Threading/MainThreadDispatcher.cs`.
Conforme doctrine C2. Finding "No MainThreadDispatcher" → **Resolved (ÉTAPE 16)**.

### L2 — FirebaseInitializer (bootstrap)
**Existait (`FirebaseBootstrap.cs`), complété dans `AppBootstrap.cs`.**
- `FirebaseBootstrap` : CheckAndFixDependencies + PersistenceEnabled = true.
- `AppBootstrap` : step 4 ajouté — `SignInAnonymouslyAsync` (réutilise session existante si présente).
- Finding "No offline persistence" → **Resolved (ÉTAPE 16)**.

### L3 — ServiceLocator + IPlayerService
- `ServiceLocator` static class existante réutilisée (D-ETAPE16-002).
- `IPlayerService` — `Assets/_Project/Scripts/Services/Player/IPlayerService.cs`
- `PlayerServiceException` — erreur typée avec `UserMessage`
- `FirebasePlayerService` — `Assets/_Project/Scripts/Services/Player/FirebasePlayerService.cs`
  Encapsule `FirebaseFunctions`. UID injecté dans le snapshot (D-ETAPE16-004).
  Mapping `FunctionsErrorCode` → messages joueur (doctrine C6).

### L4 — Modèle PlayerState
`Assets/_Project/Scripts/Models/PlayerStateSnapshot.cs`

Mappe `PlayerStateSnapshot` retourné par `resolveLoginState` :
- `PlayerData` : gold, imperialFavor, inventory, favorRank, guildCharterUnlocked, firstContractCompleted, displayName
- `InventoryState` : logs, planks, reconstructionKits (quantity, cap, upgradesApplied)
- `ResourceStack` : quantity, cap, upgradesApplied
- `BuildingCount` / `ActiveContractCount` (compteurs, pas parse complet)
- Parsing robuste depuis `Dictionary<object, object>` (SDK Firebase Functions 13.x). Fallback sur valeurs initiales pour champs absents.

### L5 — Écran debug UI Toolkit
- `Assets/_Project/UI/DebugScreen.uxml` — layout : titre, statut, ScrollView + container
- `Assets/_Project/UI/DebugScreen.uss` — styles loading/error/success, field rows, sections
- `Assets/_Project/Scripts/UI/DebugScreenController.cs` — MonoBehaviour sur UIDocument.
  `OnEnable` : crée CTS, résout IPlayerService, lance `LoadAsync(ct)`.
  `OnDisable` : annule CTS (doctrine C9).
  Aucun SDK Firebase dans le contrôleur (doctrine C3).
  Aucun calcul local — affichage brut du PlayerState reçu (vigilance V1).

### L6 — Scène bootstrap
**Boot.unity existante — wiring manuel requis par le founder (voir ci-dessous).**
`AppBootstrap` modifié : step 7 active `_debugScreen.gameObject` via
`MainThreadDispatcher.Post` après enregistrement de tous les services.

## Instructions de wiring scène (à faire dans Unity Editor)

La scène `Assets/_Project/Scenes/Boot.unity` est existante. Ajouter :

### GameObject "DebugScreen" (à créer dans la scène)
1. Dans la scène Boot, créer un nouveau GameObject : **DebugScreen**
2. Lui ajouter le composant **UIDocument** (UnityEngine.UIElements)
   - Source Asset → assigner `Assets/_Project/UI/DebugScreen.uxml`
   - Panel Settings → assigner le PanelSettings existant du projet
     (ou créer : Assets > Create > UI Toolkit > Panel Settings)
3. Lui ajouter le composant **DebugScreenController**
4. **Désactiver le GameObject** (checkbox en haut du Inspector = décoché).
   `AppBootstrap` l'activera après bootstrap complet.

### Bootstrap GameObject — assigner _debugScreen
5. Sélectionner le GameObject Bootstrap dans la scène
6. Dans le composant **AppBootstrap** (section "Debug"),
   assigner le GameObject "DebugScreen" dans le champ `_debugScreen`.

### USS dans le UXML (à vérifier)
Si l'USS n'est pas référencé dans le UXML au runtime :
Dans `DebugScreen.uxml`, ajouter `<Style src="DebugScreen.uss" />` comme premier
enfant de `<ui:UXML>` (ou assigner via le UIDocument's PanelSettings).

## Critères d'acceptation (validés par code)

| Critère | État |
|---|---|
| Aucun SDK Firebase dans DebugScreenController | ✅ |
| Callbacks Firebase via MainThreadDispatcher | ✅ (await sur main thread Unity) |
| PersistenceEnabled avant premier read | ✅ (FirebaseBootstrap, step 3) |
| Aucun calcul local dans l'écran debug | ✅ (vigilance V1) |
| CancellationToken annulé en OnDisable | ✅ (doctrine C9) |
| FunctionsErrorCode mappé en message joueur | ✅ (doctrine C6) |
| Service Locator + interfaces | ✅ (doctrine C3) |

**Validation finale : le founder lance Unity en Play mode et confirme l'affichage.**

## Commits (ordre chronologique)

- `2f4c9cc` — feat(client): add IPlayerService, PlayerStateSnapshot model, and FirebasePlayerService
- `4d0a6d6` — feat(client): add DebugScreen UI Toolkit and wire anonymous auth in AppBootstrap

## Décisions micro loggées

- D-ETAPE16-001 : Cible Firebase = dev/staging (pas émulateur Unity)
- D-ETAPE16-002 : ServiceLocator static réutilisé (vs MonoBehaviour)
- D-ETAPE16-003 : Auth anonyme directement dans AppBootstrap (pas IAuthService)
- D-ETAPE16-004 : UID injecté dans PlayerStateSnapshot par le service (pas par l'UI)

## Prochaine étape

Validation founder (Play mode Unity → DebugScreen affiche PlayerState).
Puis ÉTAPE 17 : premier écran gameplay (production, contrats, ou marché — à définir).
