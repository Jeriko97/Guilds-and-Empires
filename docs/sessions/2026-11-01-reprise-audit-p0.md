# Session 2026-11-01 — Reprise du projet : audit v2 + P0 assainissement

## Contexte
Reprise après ~3 mois d'arrêt (dernier commit 2026-08-08). Audit complet :
`docs/architecture/audit-v2-2026-11-01.md`.

## Rattrapage — travail de juillet-août jamais documenté (ÉTAPE 18, slice marché)
Reconstitué depuis git (aucun log de session ni décision à l'époque) :
- `30a7de7` (06-29) : `sellToMarket` renvoie l'`inventory` mis à jour (doctrine 17.A-3).
  Tests 22-23 ajoutés. **Jamais déployé** à notre connaissance.
- `a8bc7ea` (07-09) : `IMarketService` + `FirebaseMarketService`, lecture `marketState` en cache.
- `e21e7f5` (07-09) : `SellToMarketAsync` côté client (`SellToMarketResult`).
- `5dc9ad3` (08-08) : `PlayerEconomyStateStore` (gold + inventaire) + garde de ré-entrée dans ProductionScreen.
- Non commité jusqu'ici, commité aujourd'hui (`b81d3a5`) : coquille `MarketScreen` (« ÉTAPE 18.2b-2 »
  dans le code) + bouton « Marché » dans ProductionScreen, navigation Push/Pop.

## P0 réalisé
- **Facturation Firebase** désactivée → toutes les CF renvoyaient `INTERNAL`. Réactivée par le
  founder ; `resolveLoginState OK` constaté en Play.
- **Pilotage de l'Éditeur** (D-REPRISE-001) : `com.unity.pipeline` 0.9.1-exp.1. Packages AI retirés.
- **Hygiène git** :
  - `2d1ad63` : 22 `.meta` manquants depuis le 31/05.
  - `d99cc1e` : `MainPanelSettings` déplacé de `Scripts/Services/Economy/` vers `UI/` (GUID conservé) + thème runtime.
  - `b81d3a5` : MarketScreen (validé en Play par l'agent : Marché ↔ Retour, 0 erreur).
  - `b636c8a` : Pipeline, `.gitignore` (logs émulateur, `_Recovery`), gitlink de worktree retiré.
  - Vérifié sur un clone propre : 0 GUID manquant, 0 fichier sans `.meta`.
  - 7 branches `claude/*` fusionnées et 3 worktrees propres supprimés.
- **Backend** :
  - `53949b6` : `claimDailyBonus` retiré (D-REPRISE-002).
  - `3de8a77` : Node 22 (TD-013).
  - 209/209 tests verts sur 2 runs complets. Le 1er run à froid a eu 1 timeout (`sellToMarket` test 1, 67 s), même symptôme que la piste « warm-up émulateur » de TD-014.
- **Docs** : TD-013 mise à jour, TD-016 (région) et TD-017 (App Check) ouvertes, D-REPRISE-001/002,
  briefings, snapshots des skills.

## Non fait / en attente du founder
- **Déploiement des CF** (Node 22 + `sellToMarket` enrichi) : refusé par le garde-fou de l'agent
  (déploiement en production). À lancer par le founder, voir le briefing Claude Code.
- `Assets/_Recovery/` (ignoré), dossier vide `Scripts/Services/Economy/`,
  `ProjectSettings/Packages/com.unity.ai.assistant/` : suppressions refusées par le garde-fou, à faire à la main.
- Branches `claude/keen-almeida-c9032d`, `claude/relaxed-antonelli-57a65e` (1 commit non fusionné)
  et worktrees `happy-germain` / `heuristic-stonebraker` (brouillons de mai non commités) : à trier par le founder.
- Stratégie `main` (106+ commits d'avance sur `feature/bootstrap-architecture`).

## Prochaine étape
Après déploiement : ÉTAPE 18.2b-2 — HUD gold/inventaire (`PlayerEconomyStateStore`) + MarketScreen
avec prix et vente, câblé et validé en Play par l'agent.
