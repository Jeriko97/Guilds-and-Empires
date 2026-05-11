# Doctrine — AI-Native Studio Workflow

## Principe fondamental

En tant que solo founder utilisant l'IA comme force multiplicatrice, votre workflow de développement
est lui-même une décision d'architecture. Un usage discipliné de l'IA vous permet de produire
à la vitesse d'une petite équipe — mais seulement si vous structurez l'interaction correctement.

---

## Le skill comme Technical Director permanent

Ce skill (`unity-firebase-architect`) est votre Technical Director IA.
Il doit être déclenché pour **toute** décision technique, pas seulement les grandes.

### Quand déclencher :
- Avant d'écrire un nouveau service ou système
- Avant d'ajouter une dépendance (package, SDK)
- Avant de toucher à l'économie ou à l'authentification
- Quand vous avez "une idée rapide" qui contourne un pattern établi
- Avant chaque PR qui touche les Cloud Functions ou Firestore

### Comment formuler les questions :

**Mauvais (trop vague) :**
```
"Comment implémenter les guildes ?"
```

**Bon (contexte + contrainte + question spécifique) :**
```
"Je veux implémenter la création de guildes dans Guilds & Empires.
Schéma Firestore actuel : players/{uid}/profile + resources + buildings.
Contrainte : un joueur ne peut appartenir qu'à une seule guilde.
Question : structure Firestore pour guildes, et quelle Cloud Function
pour la création + l'ajout de membres ?"
```

**Toujours inclure dans les questions d'économie :**
- Le schéma Firestore actuel du domaine concerné
- L'action utilisateur spécifique (pas "gérer les guildes" mais "le joueur appuie sur Créer une guilde")
- La contrainte business (max membres, coût de création, etc.)

---

## ADR — Architecture Decision Records

Toute décision architecturale significative est documentée avant implémentation.
Format minimal, dans `docs/architecture/adr/`.

```markdown
# ADR-001 — Server-Authoritative Economy

## Statut : Accepté (2026-05-11)

## Contexte
Le prototype actuel a AddGoldAsync en client-side Firestore direct.
Un MMO économique avec client-side write est triviallement trichable.

## Décision
Toute mutation d'état économique passe par Cloud Functions.
Le client envoie uniquement son intent (buildingId, requestId).
Le serveur re-dérive tous les montants depuis l'état Firestore.

## Conséquences
+ Protection contre la triche mémoire et les writes directs
+ Idempotency possible (requestId)
+ Validation centralisée
- Latence ajoutée (~200-500ms par action économique)
- Cloud Functions coûtent ~$0.40/million invocations (acceptable)

## Alternatives rejetées
- Client-side validation : rejetée — non-authoritative, contournable
- Hybrid (CF pour les gros montants seulement) : rejetée — règle non-uniforme, exceptions dangereuses
```

### Décisions qui nécessitent un ADR :
- Tout nouveau domaine de données Firestore
- Choix entre deux patterns d'architecture
- Ajout d'un service Firebase (FCM, Storage, etc.)
- Choix de package Unity tiers
- Stratégie de déploiement

---

## Firebase Emulator Suite — Workflow local

Ne jamais développer contre la base de données Firebase de production.

```
Environnements :
  local  → Firebase Emulator Suite (Auth + Firestore + Functions)
  dev    → Projet Firebase séparé (guilds-empires-dev)
  prod   → Projet Firebase production (guilds-empires)
```

### Setup Emulator (à faire en semaine 1)

```bash
# Installation
firebase login
firebase init emulators --project guilds-empires-dev
# Choisir : Authentication, Firestore, Functions

# Lancement
firebase emulators:start
# UI disponible sur http://localhost:4000
```

```csharp
// AppController.cs — détecter l'émulateur en dev
#if UNITY_EDITOR || DEVELOPMENT_BUILD
private void ConnectToEmulators()
{
    FirebaseFirestore.DefaultInstance.Settings = new FirebaseFirestoreSettings
    {
        Host = "10.0.2.2:8080", // 10.0.2.2 = localhost depuis Android emulator
        SslEnabled = false,
        PersistenceEnabled = false // désactivé sur émulateur
    };
    FirebaseAuth.DefaultInstance.SetEmulatorSettings("10.0.2.2", 9099);
    FirebaseFunctions.DefaultInstance.UseFunctionsEmulator("10.0.2.2", 5001);
}
#endif
```

---

## Génération de code avec l'IA — Règles

### Ce que l'IA génère bien :
- Boilerplate de services (interface + implémentation Firebase)
- Cloud Functions à partir d'une spec précise
- Security Rules à partir du schéma Firestore
- Tests d'intégration Cloud Functions
- Migrations de schéma Firestore

### Ce que vous devez toujours valider :
- La logique économique (l'IA ne connaît pas l'équilibre de votre jeu)
- Les Security Rules (l'IA peut en oublier des cas edge)
- Les transactions Firestore (vérifier l'atomicité et les cas d'erreur)
- Les coûts Firestore (l'IA ne compte pas les reads/writes automatiquement)

### Workflow de génération de service :

```
1. Décrire le système (schéma + actions + contraintes) dans le prompt
2. Demander d'abord le schéma Firestore + Security Rules
3. Valider le schéma avant de demander les Cloud Functions
4. Valider les Cloud Functions avant de demander le code Unity
5. Relire le code généré avec ce skill avant de commit
```

---

## CI/CD — Pipeline minimal

### GitHub Actions — Cloud Functions

```yaml
# .github/workflows/deploy-functions.yml
name: Deploy Cloud Functions
on:
  push:
    branches: [main]
    paths: ['functions/**']

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Install & test
        working-directory: functions
        run: npm ci && npm test

      - name: Deploy to Firebase
        run: npx firebase deploy --only functions --project ${{ vars.FIREBASE_PROJECT }}
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

### GitHub Actions — Firestore Rules

```yaml
# .github/workflows/deploy-rules.yml
name: Deploy Firestore Rules
on:
  push:
    branches: [main]
    paths: ['firestore.rules', 'firestore.indexes.json']

jobs:
  deploy-rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy rules
        run: npx firebase deploy --only firestore:rules,firestore:indexes --project ${{ vars.FIREBASE_PROJECT }}
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

---

## Revue de sécurité IA — Checklist avant merge

Déclencher ce skill avec la liste de contrôle suivante avant toute PR qui touche à l'économie ou l'auth :

```
Revue sécurité — PR [numéro] — [description]

Cloud Functions modifiées :
  [ ] Auth check (context.auth != null) en première ligne ?
  [ ] Input validation (type + bounds) sur tous les paramètres ?
  [ ] Idempotency key vérifié avant mutation ?
  [ ] Rate limiting appliqué ?
  [ ] Toutes les mutations dans une runTransaction ?
  [ ] Aucun montant fourni par le client utilisé directement ?

Firestore Rules :
  [ ] Nouvelles collections couvertes par les rules ?
  [ ] write: if false sur toutes les collections économiques ?
  [ ] Tester avec firebase emulators:exec "npm test" ?

Unity C# :
  [ ] Aucun accès Firebase direct depuis l'UI (passe par IService) ?
  [ ] Listeners disposés dans OnDisable ?
  [ ] Callbacks Firebase dispatched to main thread ?
  [ ] CancellationToken passé aux méthodes async ?
```

---

## Documentation — Standards

### Quoi documenter (et où)

```
docs/architecture/
  adr/          → Architecture Decision Records (décisions importantes)
  audit-*.md    → Audits techniques périodiques (tous les 3 mois en pre-alpha)
  schema-*.md   → Évolutions du schéma Firestore

functions/
  README.md     → Comment lancer l'émulateur + déployer + tester

Assets/_Project/
  (pas de doc dans le code — les noms de classes suffisent)
```

### Quoi ne PAS documenter

- Ce que le code fait (les noms de méthodes le disent)
- Les décisions évidentes
- Le code temporaire (supprimez-le plutôt)
- Les TODOs sans date ni propriétaire (supprimez-les ou créez une issue GitHub)

---

## Cadence de travail recommandée

```
Semaine type (solo founder, 15-20h/semaine de code) :

Lundi    : Review de la semaine précédente + planification
           → Déclencher le skill pour prioriser
Mardi-Jeudi : Implémentation feature principale
              → Déclencher le skill avant chaque nouveau système
Vendredi : Code review self + tests + merge
           → Déclencher la checklist sécurité avant merge

Mensuel :
  → Audit technique avec ce skill (état de l'architecture, dettes, coûts)
  → Review des métriques Analytics (rétention, économie)
  → Review Remote Config (valeurs à ajuster ?)
```
