# GAE Phase 1 — Decisions Log

> Toutes les décisions de design et d'architecture prises avant l'implémentation du Vertical Slice Phase 1.
> Format : décision finale + rationale (2-3 lignes) + impact.

---

## 1. Décisions de Loop Design (Prompt 1)

| # | Sujet | Décision | Rationale | Impact |
|---|---|---|---|---|
| D1.1 | Resource anchor | **Logs → Planks → Reconstruction Kits** | Le bois justifie narrativement la reconstruction du village post-raids gobelins. Scale naturellement vers Phase 2 (besoins d'infrastructure par faction). | Toute la chaîne de production Phase 1 est bois-centrée. |
| D1.2 | Imperial Favor model | **Hybride asymétrique** : Signal (principal) + Gate (secondaire) | Une Favor purement gate crée de l'obligation. Purement signal, elle se déconnecte de la narration "gagner la confiance de l'Empire". L'hybride respecte les deux. | Favor débloque de meilleurs contrats (signal) ET constitue une condition pour le Guild Charter (gate faible). |
| D1.3 | Premier world event | **Scripté, win-win, déclenché après le 1er contrat** | Le premier contact du joueur avec les events doit être positif. Un event aléatoire potentiellement défavorable en first-session détruit la rétention. La leçon : "marchands préparés profitent des crises." | Les world events aléatoires (potentiellement défavorables) ne se débloquent qu'après cet event scripté vécu. |

---

## 2. Décisions Systémiques (Prompt 2)

| # | Sujet | Décision | Rationale | Impact |
|---|---|---|---|---|
| D2.1 | Inventaire | **Limité, upgradable en gold** — Logs 50 / Planks 30 / Kits 10 | La saturation force la décision de marché. Sans friction d'inventaire, l'accumulation passive est possible et la loop économique disparaît. | Upgrades d'inventaire = gold sink secondaire anti-inflation. |
| D2.2 | Expiration des contrats | **Pas de pénalité — coût d'opportunité visible** | Une pénalité d'expiration crée de l'anxiété sur mobile. L'absence totale de conséquence retire l'enjeu. Le coût d'opportunité (créneau de Favor perdu) préserve la tension sans punir. | Contrats Standard : régénérés. Contrats Priority : quantité finie, fenêtre limitée. |
| D2.3 | Visibilité marché | **Ticker compact ambiant** (2-3 prix + flèches) sur UI principale ; marché complet en écran séparé | La lecture du marché est la compétence centrale de GAE. Si elle requiert une action délibérée, elle ne s'installe pas naturellement chez le joueur. L'affichage ambiant forme le réflexe. | Implémenté par polling (pas de listener Firestore — voir D6.2). |

---

## 3. Décisions Economy Values (Prompt 3A)

| # | Sujet | Décision | Rationale | Impact |
|---|---|---|---|---|
| D3.1 | Production offline | **Continue jusqu'à saturation d'inventaire** | Le cap d'inventaire devient le mécanisme naturel de check-in. Un joueur actif n'a pas d'avantage de production sur un joueur qui se connecte 4 fois — l'avantage vient des décisions de marché. | Le serveur calcule la production différée à chaque login. Aucun write planifié par slot. |
| D3.2 | AI market | **Courbe de prix simulée server-side** (Phase 1) | Contrôlable, prévisible à maintenir seul. Schema conçu pour migration vers vrais ordres Phase 2 sans refactor. | `updateMarketPrices` scheduled CF toutes les 5 min. Client poll, pas de listener. |
| D3.3 | AI merchants | **Signaux de prix sans état persistant** (Phase 1) | Coût d'implémentation minimal, économie lisible et contrôlée. Suffisant pour simuler un marché vivant avec une population AI. | Migration vers agents stateful prévue en Phase 2 pour les concurrents stratégiques. |

---

## 4. Décisions Techniques (Prompt 3B)

| # | Sujet | Décision | Rationale | Impact |
|---|---|---|---|---|
| D4.1 | Migration schéma Firestore | **Option A — Cloud Function one-shot** | Pre-alpha solo = très peu de documents. La complexité d'une couche de compatibilité client n'est pas justifiée. Si dataset massif un jour, migration vers hybride. | `schemaVersion` dans chaque document top-level. Changelog dans `docs/architecture/schema-migrations.md`. |
| D4.2 | Firebase App Check | **DebugProvider en `#if UNITY_EDITOR`, PlayIntegrityProvider en prod** | Évite de bloquer le dev local tout en garantissant la sécurité en production. Un oubli de DebugProvider en prod serait une brèche critique. | Test CI bloque le build si DebugProvider référencé hors `#if UNITY_EDITOR`. |
| D4.3 | Environnements Firebase | **Emulator (80%) + projet staging dédié (20%)** — 3 projets : dev / staging / prod | L'Emulator ne supporte pas App Check ni les Scheduled Functions. Staging valide ces cas avant chaque deploy prod. Emulator = itération rapide quotidienne. | `firebase.json` multi-projets. Scripts `deploy:staging` et `deploy:prod` dans `package.json`. |

---

## 5. Valeurs Critiques — Ne Pas Modifier Isolément

Ces valeurs définissent l'équilibre de toute l'économie Phase 1. Modifier l'une sans recalculer les autres casse les ratios.

| Valeur | Valeur actuelle | Pourquoi critique |
|---|---|---|
| **Durée du Kit** | 60 min | Anchor de toute la session pacing. Détermine combien de contrats/jour, valeur perçue d'un Kit, intensité de la décision marché vs contrat. |
| **Ratio Planks/Logs à prix normal** | 2,4 (Logs 5g → Planks 12g) | Marge de transformation fondamentale. En dessous de 2,0 : personne ne transforme. Au-dessus de 4,0 : Logs disparaissent du marché. Maintenir entre 2,2 et 3,0. |
| **Premium contractuel** | +33% Standard / +113% Priority | Pivots de la fantasy Imperial Merchant. Si Standard < 25%, contrats optionnels. Si Priority < 80%, l'event perd sa puissance de décision. |
| **Seuil Guild Charter** | 350 Favor + 500 gold | Grand objectif Phase 1. Trop proche = Phase 1 est un tutoriel. Trop loin = abandon. Cible : 3-5 semaines de jeu régulier. **TO_PLAYTEST en priorité absolue.** |
| **Cap Kits** | 10 unités | Fréquence maximale des décisions économiques forcées. Hypothèse la plus fragile du tableau — à monitorer dès le premier playtest. |

---

## 6. Arbitrages Techniques Importants

| # | Sujet | Décision retenue | Alternative rejetée | Raison du rejet |
|---|---|---|---|---|
| A1 | Ticker marché | **Polling client toutes les 5 min** | Listener Firestore temps réel | Listener = $52/mois à 10k DAU (1 write CF → 10k reads simultanés). Polling = ~$3/mois. Même expérience perçue, même cadence de mise à jour. |
| A2 | Calcul temps de production | **Serveur lit `slot.startedAt` et calcule seul** | Client fournit un `elapsedSeconds` | Client-provided elapsed time = trivialement spoofable (Doctrine Anti-Cheat). `resolveLoginState` ne reçoit aucun paramètre temporel du client. |
| A3 | Marché Phase 1 | **Prix simulés server-side** | Vrai order book dès Phase 1 | Order book nécessite gestion des ordres, matching engine, concurrence — complexité injustifiée pour un pre-alpha solo. Schema migration-ready pour Phase 2 sans refactor. |
| A4 | Dénormalisation inventaire | **Inventaire dans document player** | Subcollection séparée | 1 read au login vs 3-4 reads. À 10k DAU × 30j, économie de 60-90M reads = $36-54/mois évités. |
| A5 | Config gameplay | **ScriptableObject (défaut) + Remote Config (override)** | Valeurs hardcodées en C# | Valeurs hardcodées = store update obligatoire pour rebalancer. Remote Config = LiveOps immédiat, A/B tests, events saisonniers sans redéploiement. |

---

## 7. État des Audit Findings (référence : audit-v1-2026-05-11.md)

| Finding | Sévérité | Statut | Traité par |
|---|---|---|---|
| No Firestore Security Rules | CRITICAL | **Resolved (ÉTAPE 15)** | `firestore.rules` Phase 1 + 22 tests `@firebase/rules-unit-testing`. |
| `AddGoldAsync` client-side | CRITICAL | **Open** | Remplacé par architecture Cloud Functions (Prompt 3B) |
| App Check non configuré | HIGH | **Open** | Setup décidé en D4.2 — à implémenter |
| No `MainThreadDispatcher` | HIGH | **Resolved (ÉTAPE 16)** | `MainThreadDispatcher.cs` déjà présent dans le projet. Confirmé conforme doctrine C2. |
| No offline persistence | HIGH | **Resolved (ÉTAPE 16)** | `FirebaseBootstrap.ConfigureFirestorePersistence()` : `PersistenceEnabled = true` avant tout read. Confirmé conforme doctrine C8. |
| Company Name "DefaultCompany" | MEDIUM | Open | — |
| Visual Scripting + Multiplayer Center | MEDIUM | Open | À retirer avant first beta |
| No Addressables | HIGH | Open | Phase 1 : acceptable. À adresser avant Phase 2. |
| uid redondant dans document | LOW | Open | Corrigé dans le nouveau schema (uid = clé du document, pas champ interne) |

---

---

## 8. Décisions micro implémentation

| # | Sujet | Décision | Rationale | Trigger de revue |
|---|---|---|---|---|
| D-ETAPE11 | Emplacement constantes market | `MAX_MARKET_SELL_QUANTITY`, `MARKET_SALES_RATE_LIMIT`, `MARKET_SALES_WINDOW_MS` dans `sellToMarket.ts` (pas `shared/market.ts`) | YAGNI cohérent avec `FAVOR_THRESHOLDS` en ÉTAPE 10 : aucune autre CF ne les réutilise encore. Même règle que pour favorRank.ts : factoriser à la première duplication réelle, pas par anticipation. | À migrer vers `shared/market.ts` si `updateMarketPrices` ou tout autre handler référence l'une de ces constantes. |
| D-ETAPE13 | Factorisation FAVOR_THRESHOLDS | Extraction des seuils favor (50, 200, 350) depuis les magic numbers inline de `computeFavorRank` vers `shared/favorRank.ts` comme constante exportée `FAVOR_THRESHOLDS as const`. `shared/guildCharter.ts` ré-exporte `GUILD_CHARTER_FAVOR_THRESHOLD = FAVOR_THRESHOLDS.guild_charter_eligible` pour éviter le couplage direct du handler à `favorRank.ts`. | Trigger YAGNI activé : `purchaseGuildCharter` est le 2e consommateur du seuil 350 après `computeFavorRank` (ÉTAPE 10). | À surveiller si Phase 2 modifie ces seuils — un seul point de modification dans `shared/favorRank.ts`. |
| D-ETAPE14 | Statut marché reconstructionKits | Option A — plancher fixe 20g, non affecté par drift/noise. Event multipliers peuvent booster temporairement. | Cohérent avec doc design ("soupape, pas canal principal"). Évite un 3e marché dynamique Phase 1. | Phase 2 si introduction d'un vrai marché Kits. |
| D-ETAPE14b | Algorithme drift prix marché | Ordre : drift → bruit → clamp intermédiaire → event multipliers → floor de sécurité → arrondi. Pas de ceiling Phase 1 (l'event peut faire dépasser le max, c'est voulu pour la visibilité du boost). Constants DRIFT_FACTOR=0.1, NOISE_AMPLITUDE=0.05. | Convergence douce vers basePrice. Bruit appliqué avant events pour respecter la hiérarchie sémantique. | Si playtest montre instabilité, ajuster DRIFT_FACTOR avant tout autre paramètre. |
| D-ETAPE14c | Tolérance états marketState | Inexistant → log + return gracieux. Corrompu (structure incomplète) → throw Error. | Fail loudly sur état corrompu (scheduled CF sans surveillance) vs fail silently sur premier déploiement (cas légitime). | Si introduction d'un mécanisme d'init automatique de marketState, retirer la tolérance "inexistant". |
| D-ETAPE15 | Test des Security Rules | Suite dédiée `firestore.rules.test.ts` via `@firebase/rules-unit-testing`, séparée des tests handlers (Admin SDK bypasse les rules). Quadruplet complet sur collections sensibles + couverture exhaustive du schéma Phase 1 incluant les 3 subcollections post-ÉTAPE 9. Dimension query (collection.get()) couverte séparément de get() document (section F). | Rules non testées = fausse sécurité, finding CRITICAL. Subcollections récentes absentes de la spec historique = risque d'oubli au deny-all. | À étendre si Phase 2 ajoute des collections (orderBook, factions, etc.). |
| D-ETAPE16-001 | Cible backend Unity bootstrap | **Projet Firebase dev/staging** (pas l'émulateur Firebase). Aucune configuration `UseEmulator` / `UseFunctionsEmulator` n'existe dans le projet Unity. | Investir dans la config réseau Unity ↔ Émulateur est hors-scope ÉTAPE 16. L'objectif est la preuve de chaîne complète. La config émulateur est une étape dédiée ultérieure si besoin réel. | Si un besoin de dev offline Unity se manifeste, créer une ÉTAPE dédiée pour wirer `UseEmulator` dans `EnvironmentConfig` (flag existant). |
| D-ETAPE16-002 | ServiceLocator static vs MonoBehaviour | Utilisation du `ServiceLocator` **static class existant** (non le pattern GameServiceLocator MonoBehaviour du ticket). | Le projet Unity avait déjà un `ServiceLocator` static (`Register<T>`, `Resolve<T>`, `TryResolve<T>`) conforme aux doctrines. Créer un doublon MonoBehaviour serait de la dette et de la confusion. Doctrine C3 satisfaite : max 3 couches entre UI et Firebase. | Si besoin de `DontDestroyOnLoad` avec état sur le ServiceLocator (ex: persistence de registrations entre scènes), migrer vers MonoBehaviour. |
| D-ETAPE16-003 | Auth anonyme dans AppBootstrap | `SignInAnonymouslyAsync` ajouté directement dans `AppBootstrap.RunInitPipeline` (step 4), sans `IAuthService` intermédiaire. | YAGNI : ÉTAPE 16 a un seul type d'auth. Ajouter une interface `IAuthService` pour un seul consommateur = abstraction prématurée. Trigger de refactor : ajout email/Google/Apple Sign-In (étape dédiée ultérieure). | À extraire dans `IAuthService` + `AnonymousAuthService` quand l'auth réelle est introduite. |
| D-ETAPE16-004 | UID dans PlayerStateSnapshot | Le `uid` Firebase est injecté dans `PlayerStateSnapshot` par `FirebasePlayerService` après auth (`FirebaseAuth.DefaultInstance.CurrentUser?.UserId`). | Permet à `DebugScreenController` d'afficher l'uid sans importer `Firebase.Auth` (doctrine C3 : aucun SDK Firebase dans les classes UI). Consistant avec le principe que le service expose les données, l'UI les rend. | N/A — décision de séparation de couches définitive. |
| D-ETAPE16-005 | App Check différé — CF publiques en pré-alpha | Les 9 CF Phase 1 déployées sur `guildsandempires-ca543` avec `invoker: "public"`. App Check non configuré. Acceptable en pré-alpha solo (surface d'attaque = 0 DAU). | Risque réel : appel non authentifié possible. Mitigé par les Security Rules Firestore (client ne peut pas écrire) et l'auth obligatoire dans chaque CF (`requireAuth`). Un attaquant peut appeler les CF mais ne peut pas corrompre de données. | À implémenter avant tout déploiement non-solo (D4.2 : DebugProvider en `#if UNITY_EDITOR`, PlayIntegrityProvider en prod). |
| D-ETAPE16.5 | Seed Sawmill au premier login | `resolveLoginState` crée un building Sawmill (id fixe `"sawmill_0"`, 3 slots null) dans le bloc `!playerSnap.exists`, second write de la même transaction que la création du player. Pas de CF `createBuilding` (YAGNI, Phase 1 = 1 building). Littéral unique partagé entre le write Firestore et le snapshot retourné — pas de drift possible. | `startProductionSlot` exige un `buildingId` ; cohérent avec la vision "campement modeste". Pas de rétro-seed des players existants (stance pré-alpha TD-003, ~0 joueur). | Phase 2 multi-building → création de building dédiée. |
| D-ETAPE17.0 | Nettoyage legacy client | Suppression du stack POC auth/profile (`AuthUIController`, `ProfileUIController`, `ProfileService`, `IProfileService` + `ProfileData`) et du stack `EconomyService`/`IEconomyService` (POC `claimDailyBonus`). `EconomyModels` supprimé également (orphelin). Canvas uGUI legacy retiré de `Boot.unity`. `AppBootstrap` mis à jour (registrations + commentaire). | L'archi documentée (phase-1-technical-implementation §5) prévoit des services PAR DOMAINE ; `IEconomyService` n'en fait pas partie. La production passera par `IProductionService` neuf en 17.A (patron `FirebasePlayerService`), pas par un service fourre-tout. Backend (CF `claimDailyBonus`, `/profiles`, comptes Auth email) = purge dans un step backend dédié ultérieur. | N/A — nettoyage définitif pré-boucle production. |
| D-ETAPE17.A-1 | buildingId fourni par le serveur dans resolveLoginState | `PlayerStateBuilding = BuildingDocument & { id: string }` — type intersection dans `types.ts`. `PlayerStateSnapshot.buildings` devient `PlayerStateBuilding[]`. Constante `STARTER_SAWMILL_ID = "sawmill_0"` partagée entre le write Firestore et le return snapshot (les deux ne peuvent jamais diverger). Branche existant : `buildingSnap.id` injecté à chaque push. Le client Unity ne reconstruit jamais l'id. Supersede le placeholder "hardcode sawmill_0" implicite dans l'audit D-17A. | Option A (server-authoritative) — scale Phase 2 (multi-building) sans rework client : chaque building retourne son id Firestore réel, quelle que soit sa clé. Option B (convention client `buildingType + "_0"`) serait fragile dès le 2e building de même type. | Phase 2 si plusieurs buildings → aucune modification (pattern déjà generique). |

---

*Dernière mise à jour : 2026-06-01 — ÉTAPE 17.A-1 buildingId server-authoritative*
