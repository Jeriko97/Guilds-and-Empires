# Comparaison V1 vs V2 — Unity Firebase Mobile Architect

**Date :** 2026-05-12

---

## Résumé exécutif

V1 était un bon architecte. V2 est un Technical Director.

La différence : V1 répondait aux questions. V2 bloque les mauvaises décisions avant qu'elles
soient posées, quantifie les risques, et enforce des doctrines transversales (économie, anti-triche,
performance, LiveOps, solo-founder, AI workflow) au lieu de règles isolées.

---

## Tableau de comparaison

| Dimension | V1 | V2 |
|---|---|---|
| **Rôle principal** | Lead Architect | Lead Technical Director |
| **Posture** | Répond aux questions | Challenge les mauvaises décisions |
| **Veto power** | Non (suggère des alternatives) | Oui (VETO explicite + pattern naming) |
| **Doctrines** | Règles isolées (10 non-négociables) | 6 doctrines codifiées, chargées à la demande |
| **Contexte projet** | Basique (table de contraintes) | Complet (snapshot état réel + audit baseline) |
| **Économie MMO** | Règle "pas d'écriture client" | Doctrine complète : sinks/sources, inflation, market architecture, anomaly detection |
| **Anti-triche** | "Ne pas faire confiance au client" | Threat model, 7 couches de défense, templates Cloud Function, rate limiting concret |
| **Performance** | Guidelines mobiles | Budgets chiffrés imposés (frame time, heap, GC, APK size) par device-class |
| **LiveOps** | RC mentionné dans les règles | Doctrine : registry clés RC, refresh en session, FCM, A/B testing via RC conditions |
| **Solo-founder** | YAGNI listé dans "what not to build" | Doctrine complète : budget complexité, 3 couches max, stratégie de tests pragmatique |
| **AI Workflow** | Non présent | Doctrine : ADR, Firebase Emulator, workflow génération code, checklist sécurité PR |
| **Audit baseline** | Mentionné, 6 findings | Mentionné, 9 findings avec statut "Open" explicite |
| **Référence files** | 4 fichiers | 10 fichiers (4 existants enrichis + 6 doctrines) |
| **Evals** | 3 cas | 10 cas, 5 catégories, critères V2 spécifiques |
| **Règles non-négociables** | 10 règles | 20 règles (3 catégories : économie/sécurité, Firebase/data, Unity) |
| **Anti-patterns documentés** | 8 | 15 avec table "pourquoi / quoi à la place" |
| **Ton** | Direct, opinioné | Direct + VETO pattern nommé + explication du "pourquoi" systématique |

---

## Ce que V1 faisait déjà bien (conservé)

- Architecture server-authoritative comme principe central
- Règles Firebase non-négociables (serverTimestamp, offline persistence, listener disposal)
- MainThreadDispatcher pour les callbacks
- ServiceLocator sans DI framework
- Structure de dossiers Assets recommandée
- Schéma Firestore V2 (players, guilds, market, globalEconomy)
- Cloud Function template avec idempotency
- Coût Firebase estimation et alertes
- Remote Config avec defaults dans ScriptableObjects

---

## Nouvelles capacités V2

### 1. Veto Power (nouvelle posture)

```
V1 : "Je recommande d'utiliser une Cloud Function plutôt qu'une écriture client."
V2 : "VETO — client-side economic write. C'est le pattern qu'on bloque explicitement.
      Le client envoie l'intent (buildingId), le serveur lit lastCollectedAt et calcule.
      Voici le template correct : [code]"
```

### 2. Threat Model complet (doctrine-anticheat.md)

V1 listait les problèmes de sécurité existants. V2 modélise exhaustivement les vecteurs d'attaque
avec leur impact réel et leur mitigation — et distingue ce qu'on peut et ne peut pas défendre
(mémoire client = pas de risque économique si le serveur est authoritative).

### 3. Budget de performance imposé (doctrine-mobile-performance.md)

V1 : "Évitez les allocations GC."  
V2 : "0 B GC alloc par frame en steady state. <16.6 ms frame time. <100 MB Unity heap.
      Mesure avec Unity Profiler ciblant Snapdragon 665. Si ces chiffres ne sont pas atteints,
      la PR ne merge pas."

### 4. Architecture LiveOps data-driven (doctrine-liveops.md)

V1 mentionnait Remote Config dans les règles.  
V2 documente l'architecture complète : registry des clés, refresh en session, événements
data-driven sans build, A/B testing via conditions RC, FCM pour re-engagement.

### 5. Doctrine économique MMO (doctrine-economy.md)

V1 : "Le serveur décide des montants économiques."  
V2 : "Voici le modèle complet : sources légitimes, sinks obligatoires, monitoring gold/heure,
détection d'anomalies, architecture anti-hot-document pour les prix globaux, idempotency."

### 6. Solo Founder Guardrails (doctrine-solo-founder.md)

V1 listait "what NOT to build".  
V2 explique pourquoi, donne le seuil de DAU à partir duquel chaque complexité devient justifiée,
et propose une stratégie de tests pragmatique (Firebase Emulator > mocks).

### 7. AI-Native Workflow (doctrine-ai-workflow.md)

V1 n'existait pas.  
V2 documente comment utiliser ce skill comme Technical Director permanent, comment formuler
les questions pour obtenir de meilleures réponses, ADR avant implémentation, Firebase Emulator
local, et checklist de sécurité pré-merge.

---

## Impact attendu sur la qualité du projet

| Risque V1 | Mitigation V2 |
|---|---|
| Client-side economic write "just for now" | VETO immédiat + doc doctrine-anticheat |
| Overengineering (Zenject, IRepository<T>) | VETO + doctrine-solo-founder |
| GC pressure non détectée | Budget chiffré + profiling obligatoire pré-merge |
| Événements LiveOps nécessitant un build | Doctrine LiveOps data-driven |
| Prix marché = listener sur hot document | Architecture Cloud Scheduler documentée |
| Décisions non documentées | Doctrine AI workflow + ADR obligatoires |
| Sécurité ajoutée "après" | Veto + checklist PR sécurité |

---

## Migration V1 → V2

Le SKILL.md et les 4 références existantes sont mis à jour en place.
6 nouveaux fichiers de doctrine sont créés dans `references/`.
Le fichier `evals.json` passe de 3 à 10 cas.

Aucun code Unity ou Firebase ne change — V2 est une mise à jour du skill IA,
pas du codebase du projet. Les décisions architecturales déjà prises (ServiceLocator,
schéma Firestore V2, etc.) sont conservées et renforcées.
