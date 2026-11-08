# Alertes TD-021 — politiques versionnées et procédure d'activation

Texte pour Claude Code (exploitation), pas pour le joueur. Préparé en 19.5a (2026-11-08), journal D-ETAPE19-017,
dette TD-021 (`docs/architecture/technical-debt.md`).

**Rien n'est actif.** Ces fichiers ne créent rien par eux-mêmes. L'activation (canal de notification, politiques
d'alerte) est une action sur la production : **F3**, dans la demande regroupée au founder (D-ETAPE19-016). Aucune
commande de ce document ne s'exécute avant cette autorisation, y compris les relevés en lecture seule de l'étape 1.

## Contenu

| Fichier | Rôle |
|---|---|
| `td021-cf-planifiees.json` | Politique « échec d'une Cloud Function planifiée » (`updateMarketPrices` aujourd'hui) |
| `td021-slot-corrompu.json` | Politique « état de slot corrompu » (`HttpsError` `data-loss`, D-ETAPE19-010 Q1) |

Format : ressource `AlertPolicy` de l'API Cloud Monitoring
(https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies), alerte sur journaux
(« log-match »). L'API n'admet qu'une seule condition quand elle est de type `conditionMatchedLog` : chaque
politique a donc une seule condition, dont le filtre regroupe les cas par `OR`. Aucun canal de notification dans
les fichiers (`notificationChannels` vide) : il est ajouté à la création (étape 3).

Valeurs d'exploitation (sans effet sur le joueur) : au plus une notification par heure et par politique
(`notificationRateLimit.period = "3600s"`), incident fermé automatiquement au bout de 30 minutes
(`autoClose = "1800s"`).

## Mécanisme (code)

- Marqueur : chaque erreur visée est journalisée par `logger.error` avec un champ structuré `alerte`
  (`firebase/functions/src/shared/alertes.ts`), visible sous `jsonPayload.alerte` dans Cloud Logging :
  `"cf-planifiee"` ou `"slot-corrompu"`.
- CF planifiées : enveloppe `avecAlerteCfPlanifiee(nom, handler)` ; elle journalise le marqueur, avec les champs
  `fonction` (nom de la fonction) et `erreur` (message de l'erreur d'origine ; pas `message`, que le logger de
  firebase-functions écrase par le texte du journal), puis relance la même erreur (la planification voit toujours
  l'échec). **Toute nouvelle CF planifiée doit l'utiliser**, sinon aucune
  alerte ne part.
- Slot corrompu : les trois `logger.error("…: état de slot corrompu", …)` (`resolveLoginState`, `collectProduction`,
  `stopProductionSlot`) portent `alerte: "slot-corrompu"` et `code`, tiré de l'`HttpsError` levée (`data-loss`).
  **Tout nouveau point de journalisation d'un état de slot corrompu doit porter ces deux champs**
  (`champsAlerteSlotCorrompu`), sinon aucune alerte ne part.
- Source unique : `firebase/functions/src/__test__/alertes.test.ts` échoue si une constante, le code réel de
  l'erreur et un filtre divergent.

Filtres :
- planifiée : `severity>=ERROR AND (jsonPayload.alerte="cf-planifiee" OR (resource.type="cloud_run_revision" AND
  resource.labels.service_name="updatemarketprices") OR (resource.type="cloud_scheduler_job" AND
  resource.labels.job_id:"updateMarketPrices"))` — le 2ᵉ terme couvre les échecs hors de l'enveloppe (délai dépassé,
  mémoire), le 3ᵉ les échecs côté Cloud Scheduler (invocation refusée, fonction jamais exécutée). Une même panne
  peut donc produire plusieurs entrées (marqueur de l'enveloppe, erreur du runtime `onSchedule`, requête Cloud Run
  en échec, tentative échouée de Cloud Scheduler) ; la limite d'une notification par heure s'applique ;
- slot corrompu : `severity>=ERROR AND jsonPayload.code="data-loss" AND jsonPayload.alerte="slot-corrompu"` — le
  filtre vise le code (D-ETAPE19-010 Q1) ; le marqueur évite qu'un autre `logger.error` portant `code: "data-loss"`
  ne déclenche l'alerte.

À la création de `processWorldEventLifecycle` (ÉTAPE 20) : elle utilise l'enveloppe, et son service Cloud Run et son
job Cloud Scheduler sont ajoutés au filtre de `td021-cf-planifiees.json` (modification du dépôt, donc revue), puis
la politique déjà créée est mise à jour (action F3).

## Procédure d'activation — seulement après l'autorisation F3 du founder

Projet de production : `guildsandempires-ca543` (briefing Claude Code, « Déploiement des CF »). Les commandes se
lancent depuis la racine du dépôt. Syntaxes relevées le 2026-11-08 dans l'aide locale de Google Cloud SDK 591.0.0
(`gcloud <groupe> --help`) ; **à revérifier au moment de l'activation** (`--help` de chaque commande).

```bash
PROJECT=guildsandempires-ca543
```

### 1. Relevé en lecture seule des noms réels

```bash
gcloud run services list --project "$PROJECT"
gcloud scheduler jobs list --project "$PROJECT" --location us-central1
```

Aucune région n'est fixée dans le code des fonctions : région par défaut `us-central1`, à confirmer par la première
liste (colonne de région). Attendu : un service Cloud Run nommé `updatemarketprices`, et un job Cloud Scheduler dont
l'identifiant contient `updateMarketPrices`. **S'ils diffèrent**, ajuster le filtre de `td021-cf-planifiees.json`
(modification du dépôt : revue croisée et commit avant de continuer).

### 2. Canal de notification

Le **type** de canal et sa **cible** (par exemple une adresse e-mail) sont des options de la demande regroupée au
founder ; ils ne sont jamais versionnés. Exemple avec un e-mail (le groupe `channels` n'existe que sous `gcloud
beta`) :

```bash
gcloud beta monitoring channels create --project "$PROJECT" \
  --display-name="TD-021 — alertes Guilds & Empires" \
  --type=email \
  --channel-labels=email_address=<ADRESSE_CHOISIE_PAR_LE_FOUNDER>
```

La commande affiche le nom complet du canal (`projects/<projet>/notificationChannels/<id>`) : le garder pour
l'étape 3.

```bash
CANAL=projects/guildsandempires-ca543/notificationChannels/<id>
```

### 3. Création des deux politiques avec ce canal

```bash
gcloud monitoring policies create --project "$PROJECT" \
  --policy-from-file=firebase/monitoring/td021-cf-planifiees.json \
  --notification-channels="$CANAL"
gcloud monitoring policies create --project "$PROJECT" \
  --policy-from-file=firebase/monitoring/td021-slot-corrompu.json \
  --notification-channels="$CANAL"
```

Selon l'aide de la commande, un drapeau passé en plus du fichier remplace le réglage du fichier : ici, la liste des
canaux.

### 4. Vérification du canal — peut envoyer un message réel

Rangée avec les créations, après l'autorisation F3 : une vérification (code de vérification, notification de test)
peut envoyer un message réel à la cible du canal. **Aucune commande `gcloud` n'existe pour cette étape** dans l'aide
locale (le groupe `gcloud beta monitoring channels` ne propose que `create`, `delete`, `describe`, `list`,
`update`) : la vérification se fait par la méthode réelle du type de canal choisi (console Cloud Monitoring, page des
canaux de notification, ou e-mail reçu), **à vérifier au moment de l'activation**. Aucune commande n'est inventée
ici.

### 5. Contrôle en lecture seule

```bash
gcloud monitoring policies list --project "$PROJECT" --format="table(name,displayName,enabled)"
gcloud beta monitoring channels list --project "$PROJECT"
```

Attendu : les deux politiques « TD-021 — … », actives, et le canal créé à l'étape 2 (`gcloud monitoring policies
describe <nom>` montre le canal rattaché).

### 6. Retour arrière

```bash
gcloud monitoring policies delete <NOM_DE_LA_POLITIQUE> --project "$PROJECT"   # une fois par politique
gcloud beta monitoring channels delete "$CANAL" --project "$PROJECT"
```

Les noms des politiques sont ceux de la liste de l'étape 5 (`projects/<projet>/alertPolicies/<id>`). Ajouter
`--force` à la suppression du canal seulement s'il est encore rattaché à une politique. Le code (marqueur, enveloppe)
reste en place : sans politique, il n'a aucun effet visible.

### Coût

Tarif des politiques d'alerte de Cloud Monitoring **à vérifier au moment de l'activation** :
https://cloud.google.com/stackdriver/pricing
