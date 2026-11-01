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

## Suite de la session (même jour)
- **Déploiement** autorisé par le founder :
  - 1er essai du founder en échec, « User code failed to load… Timeout after 10000 », car le chargement à froid dépasse 10 s.
  - Relancé avec `FUNCTIONS_DISCOVERY_TIMEOUT=60` : 9 CF en Node 22, `claimDailyBonus` supprimée.
  - TD-013 résolue.
- **Vérification en Play** :
  - `resolveLoginState OK` (50 logs en stock).
  - `sellToMarket` répond, mais avec `failed-precondition: market state not initialized`. **`marketState/state` n'a jamais été seedé en prod** → TD-018 ouverte (contractPool idem).
  - Le format `inventory` de la réponse reste donc à vérifier après le seed.
- **Push** : OK après reconnexion du founder au bon compte GitHub. `origin` était resté au 18/06 : le travail de juillet-août n'avait jamais été poussé.
- `_Recovery` et dossier `Economy` supprimés à la main par le founder.

## Non fait / en attente du founder
- `ProjectSettings/Packages/com.unity.ai.assistant/` : résidu à supprimer à la main.
- Branches `claude/keen-almeida-c9032d`, `claude/relaxed-antonelli-57a65e` (1 commit non fusionné)
  et worktrees `happy-germain` / `heuristic-stonebraker` (brouillons de mai non commités) : à trier par le founder.
- Stratégie `main` (106+ commits d'avance sur `feature/bootstrap-architecture`).

## Prochaine étape
Après déploiement : ÉTAPE 18.2b-2 — HUD gold/inventaire (`PlayerEconomyStateStore`) + MarketScreen
avec prix et vente, câblé et validé en Play par l'agent.

## TD-018 (partie marché) — seed versionné, mode autonome supervisé
- Le récap ne contient pas de « section 9 » numérotée : les 5 points ont été reconstitués depuis TD-018 et la
  « Prochaine étape » du briefing (seed, garde-fous CLI, tests, retrait de la tolérance D-ETAPE14c, message client).
- Livré en local (D-TD018-001) : `src/seed/marketStateSeed.ts`, CLI `npm run seed:market`, 13 tests (222/222 verts),
  `updateMarketPrices` en fail loudly sur document absent, message `FailedPrecondition` neutralisé côté client.
- Revue ticket : Codex GO ; auditeur GO APRÈS CORRECTION (bloquant : cible réelle du SDK Admin = `--project` →
  `initializeApp({ projectId })` + refus si variable d'environnement contradictoire). Corrigé.
- **En attente du founder** : exécution du seed en production (escalade cas 1 et 4), puis déploiement (cas 2).
  Ce poste n'a pas d'Application Default Credentials (`gcloud` absent).

## TD-018 — exécution en production (accord founder : option 1, puis déploiement ciblé)
- Google Cloud CLI 591.0.0 installé (winget, paquet Google LLC) ; ADC du founder via
  `gcloud auth application-default login` (avertissement « quota project » sans effet).
- Seed prod (`guildsandempires-ca543`) : `CRÉÉ` — document créé à 20:47:12 UTC (5 / 12 / 20, historique vide).
  2e passage : `DÉJÀ PRÉSENT`, document relu : `updateTime` = `createTime` (rien réécrit).
- Ticks de l'ANCIENNE `updateMarketPrices` entre 20:50 et 21:10 : sans avertissement (le marché est trouvé).
- Avant déploiement : `firebase/functions` propre, HEAD = `0a54298`, 222/222 verts (14 suites).
- Déploiement ciblé 21:13 UTC : `firebase deploy --only functions:updateMarketPrices` → révision
  `updatemarketprices-00005-qin`, « Successful update operation ». Les 8 autres CF non touchées.
- Après déploiement : le tick de ~21:15 n'a pas eu lieu (planificateur remis à jour par le déploiement) ;
  exécutions à 21:18:00 et 21:23:07, sans erreur ni avertissement. Relu à 21:28 : `lastUpdatedAt`
  21:23:08 ; prix logs 5 / planks 11 / kits 20 (dans les fourchettes 3–9, 8–22, plancher 20) ;
  `priceHistory` logs [5,5,5], planks [11,11,11], kits [20,20,20].
- Décision founder : pas de vente de test ; `sellToMarket` → `inventory` à vérifier en ÉTAPE 18.2b-2.
