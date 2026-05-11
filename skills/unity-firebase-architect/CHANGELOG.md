# Changelog — Unity Firebase Mobile Architect

## [2.0.0] — 2026-05-12

### Breaking Changes
- Le skill passe de "Lead Architect" à "Lead Technical Director" avec veto power
- Les réponses aux propositions incorrectes commencent désormais par "VETO —" au lieu d'une suggestion alternative

### Added

**6 doctrines codifiées (nouveaux fichiers `references/`) :**
- `doctrine-economy.md` — Économie MMO persistante : sinks/sources, marché, anomaly detection, idempotency
- `doctrine-anticheat.md` — Threat model complet, 7 couches de défense, templates Cloud Function, rate limiting
- `doctrine-mobile-performance.md` — Budgets chiffrés imposés (frame time, GC, heap, APK size, draw calls)
- `doctrine-liveops.md` — Remote Config complet, registry clés, refresh session, FCM, A/B testing
- `doctrine-solo-founder.md` — Budget complexité, YAGNI absolus, stratégie tests pragmatique, checklist dépendances
- `doctrine-ai-workflow.md` — ADR, Firebase Emulator, workflow génération code, checklist PR sécurité

**SKILL.md :**
- Veto power documenté avec pattern naming explicite
- 6 sections "Doctrine" avec triggers de challenge
- 10 règles non-négociables supplémentaires (20 total, 3 catégories)
- Table des anti-patterns enrichie (15 entrées avec "pourquoi / quoi à la place")
- Section "Technical Director Veto Power" avec 6 cas de veto explicites
- Référence aux 6 nouveaux fichiers doctrine dans la table des références
- Audit baseline enrichi : 9 findings avec statut "Open" explicite

**evals/evals.json :**
- 7 nouveaux cas d'évaluation (10 total)
- 5 catégories : economy-architecture, code-review, anticheat-veto, performance, liveops
- Critères V2 dans les expectations des 3 evals existants
- Nouveaux evals : veto client-amount (4), GC alloc Update (5), LiveOps event (6),
  veto Zenject (7), hot document cost (8), anomaly detection (9), mobile crash (10)

**evals/benchmark-v2.md :** Benchmark complet avec scores par catégorie et observations qualitatives

**evals/v1-v2-comparison.md :** Comparaison détaillée V1/V2 sur 15 dimensions

### Changed

**references/architecture-rules.md :**
- Structure dossiers Assets mise à jour avec `EconomyCalculator.cs` (logique pure séparée)
- ServiceLocator enrichi avec `InitializeForTesting()` (Firebase Emulator)
- AppController : séquence d'init complète avec timeout et App Check
- MonoBehaviour lifecycle : `OnApplicationPause` ajouté au template
- Table des patterns interdits enrichie (8 → 12 anti-patterns)
- Section YAGNI enrichie avec seuils de DAU pour chaque pattern

**references/conventions.md :**
- Règle de naming Remote Config (même nom que champ ScriptableObject)
- PR checklist enrichie (6 → 15 items, 3 catégories : sécurité, mobile, config)
- Analytics events : 15 events requis (6 → 15), paramètres obligatoires documentés
- Remote Config registry complet (6 → 23 clés documentées)
- Ajout pipeline GitHub Actions pour Firestore Rules
- Scènes conventions documentées
- Liste packages autorisés et packages à retirer

### Removed
- Aucune règle V1 supprimée — toutes les règles V1 sont conservées et renforcées

---

## [1.0.0] — 2026-05-11

### Added
- Version initiale : 4 rôles (Lead Architect, Technical Director, MMO Economy Expert, LiveOps Architect)
- 7 contraintes projet
- 10 règles non-négociables
- 8 anti-patterns documentés
- 4 fichiers de référence : architecture-rules, firebase-patterns, unity-patterns, conventions
- 3 evals (collecte bâtiment, marché P2P, code review ProfileUIController)
- Audit baseline (2026-05-11) : 6 findings critiques
