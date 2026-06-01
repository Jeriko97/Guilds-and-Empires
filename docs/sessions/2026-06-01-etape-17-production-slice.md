# Session 2026-06-01 — ÉTAPE 17 : Production Slice (17.0 → 17.A-2)

## Objectif de session

Ouvrir la boucle de production Phase 1 : nettoyage du legacy client,
buildingId server-authoritative, parsing complet BuildingDocument côté Unity,
preuve visuelle dans le DebugScreen.

---

## Sous-étapes fermées

### 17.0 — Nettoyage legacy client

**Scope :** suppression du stack POC auth/profile/economy ; Canvas uGUI legacy
retiré de Boot.unity.

**Fichiers supprimés (7 × .cs + 7 × .meta) :**
- `UI/AuthUIController.cs`
- `UI/ProfileUIController.cs`
- `Services/ProfileService.cs`
- `Services/IProfileService.cs` (+ `ProfileData`)
- `Services/Economy/EconomyService.cs`
- `Services/Economy/IEconomyService.cs`
- `Services/Economy/EconomyModels.cs` ← hors ticket initial, orphelin après les 6 autres

**AppBootstrap.cs :**
- `using GuildsAndEmpires.Services;` et `using GuildsAndEmpires.Services.Economy;` retirés
- `Register<IProfileService>` et `Register<IEconomyService>` retirés
- Commentaire de classe mis à jour (step 5 : IPlayerService uniquement)

**Validation Boot.unity (preuves citées) :**
- Zéro occurrence Canvas/AuthUIController/ProfileUIController
- GameObject `DebugScreen` présent avec `DebugScreenController` + `UIDocument`
- `_debugScreen: {fileID: 838872943}` non nul dans AppBootstrap

**Commits :**
| Hash | Message |
|---|---|
| `3f78e5d` | `chore(cleanup): remove legacy auth/profile/economy client stack` |
| `8fb3dae` | `chore(cleanup): remove legacy Canvas from Boot.unity` |
| `1626f5b` | `docs: log D-ETAPE17.0 and update legacy status in briefing` |

---

### 17.A-1 — buildingId server-authoritative (backend)

**Contexte :** audit D-17A avait confirmé que `BuildingDocument` ne portait pas
l'id Firestore du document, rendant `startProductionSlot` impossible côté client.

**Décision (Option A) :** le serveur injecte l'id — jamais le client ne le reconstruit.

**Changements backend (`firebase/functions/src/`) :**
- `types.ts` : `export type PlayerStateBuilding = BuildingDocument & { id: string }`
- `types.ts` : `PlayerStateSnapshot.buildings` → `PlayerStateBuilding[]`
- `resolveLoginState.ts` : constante `STARTER_SAWMILL_ID = "sawmill_0"` partagée
  entre `buildingsRef.doc(STARTER_SAWMILL_ID)` et le return snapshot
  (les deux ne peuvent jamais diverger)
- Branche premier login : `[{ id: STARTER_SAWMILL_ID, ...sawmill }]`
- Branche joueur existant : `{ id: buildingSnap.id, ...building, slots: updatedSlots }`

**Tests :** 2 nouvelles assertions `expect(b.id).toBe("sawmill_0")` —
pass 1 : 192/204 (12 failures pré-existantes cold start, pas liées) ;
pass 2 : **204/204 ✓**

**Déployé :** `guildsandempires-ca543` — `resolveLoginState` Successful update.

**TD ouverte :** TD-014 — test "CRITIQUE" sleep 6s flaky (émulateur froid).

**Commits :**
| Hash | Message |
|---|---|
| `c95e226` | `feat(login): include buildingId in resolveLoginState response` |
| `37afa6f` | `docs: log D-ETAPE17.A-1 (server-authoritative buildingId, supersedes hardcode)` |
| `397cbb0` | `docs: open TD-014 (flaky resolveLoginState test, real sleep)` |

---

### 17.A-2 — Parsing BuildingSnapshot/SlotSnapshot + DebugScreen (client)

**Audit préalable (key findings) :**
1. Wire format Firebase Functions v2 : Timestamps sérialisés via `Object.entries`
   (pas `toJSON()`) → clés **`"_seconds"` / `"_nanoseconds"` AVEC underscore**.
   Confirmé par sonde `Object.keys(Timestamp)` + lecture `encode()` dans
   `firebase-functions/lib/common/providers/https.js`.
2. Aucun Timestamp parsing existant côté Unity — première occurrence.
3. `level` et `slotIndex` arrivent en `long` boxé → `(int)GetLong(...)`.

**Nouveaux modèles (`Assets/_Project/Scripts/Models/`) :**
- `BuildingSnapshot.cs` : `SlotSnapshot` + `BuildingSnapshot`
- `PlayerStateSnapshot.cs` : `IReadOnlyList<BuildingSnapshot> Buildings` (stocké) ;
  `int BuildingCount => Buildings.Count` (calculé — zéro régression DebugScreen)

**Helper canonique :**
```csharp
// SOURCE DE VÉRITÉ unique — ne jamais créer un second parser
private static long ParseTimestampMs(object raw)
{
    if (raw == null) return 0L;
    if (raw is Dictionary<object, object> ts)
    {
        var sec  = GetLong(ts, "_seconds",     0L);
        var nano = GetLong(ts, "_nanoseconds", 0L);
        return sec * 1000L + nano / 1_000_000L;
    }
    return 0L;
}
```

**DebugScreen :** section par building (`id`, `buildingType`, `level`) + champ par
slot (`slotIndex`, `recipeId` ou `"idle"`, `startedAtMs`).

**Validation Play (founder) :**
```
Building — sawmill_0 (sawmill lv1)
  slot[0]   idle
  slot[1]   idle
  slot[2]   idle
```
`resolveLoginState OK`, gold 0, caps inchangées, 0 erreur console.
(RemoteConfig "running on defaults" = attendu, TD-012.)

**Commits :**
| Hash | Message |
|---|---|
| `4e5b47b` | `feat(client): parse BuildingSnapshot and SlotSnapshot in PlayerStateSnapshot` |
| `7ed05e3` | `feat(debug): display building id and slots in DebugScreen` |
| `923b8d8` | `docs: log D-ETAPE17.A-2 (canonical Firebase Timestamp parse)` |

---

## Incident de session — wiring DebugScreen perdu

**Ce qui s'est passé :** lors de l'ÉTAPE 16.5 ou 17.0, le champ `_debugScreen`
de `AppBootstrap` dans `Boot.unity` a été trouvé nul (`{fileID: 0}`) à un moment.
La cause : Unity réinitialise les références sérialisées quand un script est
modifié et que la scène n'est pas resauvée immédiatement après la recompilation.

**Convention instaurée :**
> Après toute modification de script (`AppBootstrap`, contrôleurs, etc.),
> ouvrir Unity, laisser recompiler, vérifier les références sérialisées dans
> l'Inspector, **sauvegarder la scène Boot.unity, et committer Boot.unity**
> dans la foulée. Ne jamais committer un diff de code sans vérifier que
> Boot.unity est à jour.

---

## Décisions enregistrées cette session

| Décision | Réf. log |
|---|---|
| Nettoyage stack legacy POC (auth/profile/economy) | D-ETAPE17.0 |
| buildingId server-authoritative via PlayerStateBuilding | D-ETAPE17.A-1 |
| Parsing Timestamp canonique (`_seconds`/`_nanoseconds`) | D-ETAPE17.A-2 |

---

## Reste à faire sur ÉTAPE 17

- **17.A-3** — `startProductionSlot` via ProductionScreen (premier écran gameplay)
- **17.B** — `collectProduction` (récolte de production différée)
- **TD-014** — corriger le test "CRITIQUE" (sleep → suppression déterministe
  rateLimits doc), à grouper avec les premiers tests 17.A-3
