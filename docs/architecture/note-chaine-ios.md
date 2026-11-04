# Note — chaîne iOS de Guilds & Empires (préparation seulement)

> Demandée par le founder le 2026-11-04 (décision F1 « plateformes de sortie = iOS et Android », journal
> D-PLATEFORMES-001) : « Prépare seulement une note (compte Apple Developer, compilation macOS dans le cloud,
> TestFlight, app iOS dans Firebase, actions F3 du founder, ta recommandation de service), sans rien créer ni payer. »
>
> **Rien n'a été créé, payé, essayé ni configuré** : aucun compte, aucun essai gratuit, aucun formulaire, aucune
> action sur une console (Apple, Firebase, services de build). Sources consultées en lecture seule le **2026-11-04**.
> **Tous les prix et conditions ci-dessous sont à vérifier au moment de la souscription** : ils changent souvent.
> Priorité du founder : Android d'abord ; la chaîne iOS sera mise en place plus tard.

## En bref (pour le founder)

- Pour publier sur iPhone, il faut un **compte Apple Developer payant** (99 USD par an, prix affiché en euros à
  l'inscription), ouvert à votre nom ou au nom d'une société.
- Une app iPhone ne se compile que sur un **Mac**. Vous n'en avez pas besoin : un service loue un Mac dans le cloud,
  à la minute.
- **TestFlight** (outil gratuit d'Apple) installe les versions de test sur iPhone : jusqu'à 100 testeurs de
  l'équipe (pas de revue d'Apple mentionnée par les sources, à vérifier), jusqu'à 10 000 testeurs externes après
  une revue d'Apple.
- Côté Firebase, **une app iOS semble déjà déclarée** (un fichier de configuration iOS est présent sur le poste) :
  à confirmer dans la console, sans rien y changer.
- **Recommandation** : GitHub Actions avec les outils libres GameCI et fastlane, parce que l'envoi automatique à
  TestFlight avec la licence Unity gratuite (Personal) y est documenté de bout en bout, avec un
  coffre de secrets, pour quelques dollars par mois ; Unity Build Automation est une alternative proche (gratuite
  pour commencer, envoi par script à vérifier) (détail plus bas).

## 1. Compte Apple Developer

| Point | Ce que disent les sources (2026-11-04) |
|---|---|
| Programme | Apple Developer Program : donne accès à App Store Connect, à TestFlight et à la publication sur l'App Store. Un compte Apple gratuit ne permet que des tests sur son propre appareil, limités à 7 jours. |
| Coût | 99 USD par année d'adhésion ; le prix varie selon la région et est affiché en monnaie locale à l'inscription. **À vérifier au moment de la souscription.** |
| Compte « individuel » | Compte Apple avec authentification à deux facteurs ; nom légal (pas de pseudonyme ni de nom de société) ; vérification de l'identité, de l'adresse (pas de boîte postale), de l'e-mail et du téléphone. **Votre nom légal apparaît comme vendeur sur l'App Store.** |
| Compte « organisation » | Entité légale capable de signer des contrats ; numéro **D-U-N-S** (identifiant à 9 chiffres de Dun & Bradstreet) obligatoire ; site web public au domaine de l'organisation ; e-mail au même domaine ; pouvoir de signature. Le nom de la société apparaît comme vendeur. |
| Délais | Non chiffrés par Apple : la vérification précède l'acceptation des conditions et le paiement ; un nom non conforme retarde l'approbation. Délai d'obtention d'un D-U-N-S : **à vérifier**. |

Choix à faire par le founder (F3, voir § 5) : compte individuel (plus rapide, votre nom affiché comme vendeur) ou
compte d'organisation (nom de la société affiché, demande un D-U-N-S et un site web).

## 2. Compilation macOS dans le cloud pour Unity

Pourquoi : Unity (sur Windows) sait produire un **projet Xcode**, mais la compilation finale, la signature et
l'envoi à Apple demandent macOS (Xcode, Transporter et `altool` sont des outils macOS ; App Store Connect n'accepte
aucun envoi de build par son site web — seule l'API d'App Store Connect est indépendante du système).

| Service | Coût (2026-11-04, **à vérifier au moment de la souscription**) | Intégration Unity | Publication TestFlight |
|---|---|---|---|
| **Unity Build Automation** (Unity DevOps) | Unity annonce un accès gratuit à Build Automation pour toute personne qui a un Unity ID, sans inscription supplémentaire (annonce du 10 novembre 2025), avec 100 minutes Mac (Standard) gratuites par mois (builds iOS compris) depuis le 1er mars 2026 ; au-delà, facturation à l'usage (0,07 USD par minute Mac selon l'article de support) ; plafond mensuel de minutes réglable. Quota gratuit dépassé sans carte enregistrée : accès bloqué et données exposées à la suppression, selon Unity. | Native : service d'Unity, branché sur le dépôt ; certificat de distribution et profil de provisionnement Apple téléversés dans le service. Accès gratuit avec un Unity ID annoncé ; usage avec la licence Personal du projet : **à vérifier**. Scripts personnalisés documentés : méthodes C# avant et après l'export, scripts bash avant et après la compilation ; les valeurs secrètes passent par des variables d'environnement masquées dans les journaux (pas de coffre de secrets décrit sur cette page). | L'article de support d'Unity décrit un envoi **manuel** de l'IPA vers App Store Connect (impossible sans Mac : pas d'outil Apple d'envoi sous Windows). La documentation des scripts indique qu'un script lancé après la compilation peut servir à un envoi automatique vers une boutique et renvoie à une page sur fastlane pour iOS : envoi automatique à TestFlight par ce moyen **à vérifier**. |
| **Codemagic** | Offre « individus » : 500 minutes macOS M2 gratuites par mois, 1 build à la fois ; au-delà 0,095 USD par minute (M2) ; forfait annuel à partir de 3 990 USD. | Guide Unity officiel ; **exige une licence Unity payante** pour les builds dans le cloud (son guide nomme « Plus or Pro » ; l'offre Plus n'apparaît plus parmi les offres annoncées par Unity — Personal, Pro, Enterprise, Industry —, donc aujourd'hui une licence Pro ou supérieure, à vérifier) — coût Unity supplémentaire (Unity annonce Pro à 2 310 USD par an et par siège, hausse de 5 % au renouvellement à partir du 12 janvier 2026), **à vérifier**. | Automatique : section `app_store_connect` du fichier `codemagic.yaml`, avec une clé d'API App Store Connect ; l'app doit déjà exister dans App Store Connect ; le guide recommande d'envoyer la première version à la main. |
| **GitHub Actions** (+ GameCI et fastlane, outils libres) | Dépôt privé (offre gratuite) : 12 USD de calcul inclus par mois ; Linux 2 cœurs 0,006 USD par minute ; macOS 3-4 cœurs 0,062 USD par minute. | GameCI exporte le projet Xcode sur une machine **Linux** (moins chère), puis une machine macOS compile, signe et envoie. **Licence Unity Personal acceptée** (fichier de licence `.ulf` + e-mail et mot de passe du compte Unity en secrets GitHub). Le dépôt est déjà sur GitHub (`origin`). | Automatique : `fastlane` (`upload_to_testflight`) avec une clé d'API App Store Connect ; certificats gérés par `fastlane match` dans un dépôt Git privé. |
| Xcode Cloud (Apple, pour mémoire) | 25 heures de calcul par mois incluses dans l'adhésion Apple Developer ; au-delà, abonnements mensuels (49,99 USD pour 100 h). | **Non retenu** : il compile un projet Xcode présent dans le dépôt ; il n'exporte pas un projet Unity (pas d'Unity sur ses machines). Il faudrait générer et versionner le projet Xcode ailleurs. | Native (service d'Apple). |

Ordre de grandeur, à titre indicatif (hypothèses de Claude Code, non vérifiées) : un build iOS d'un petit projet
Unity dure de l'ordre de 15 à 40 minutes de machine. Les durées réelles se mesurent au premier build.

Points communs aux trois services :
- les fichiers de configuration Firebase (`GoogleService-Info.plist` pour iOS, `google-services.json` pour Android)
  sont **ignorés par git** (`.gitignore`, l. 39-40) : un build dans le cloud ne les trouve pas dans le dépôt ; il
  faudra les fournir comme **secrets** du service de build, jamais les versionner ;
- les secrets Apple (clé d'API `.p8`, certificats) sont stockés dans le service choisi, jamais dans le dépôt.

## 3. TestFlight (distribution de test sur iPhone)

- Gratuit, inclus dans l'adhésion Apple Developer ; l'app de test « TestFlight » s'installe sur l'iPhone.
- **Testeurs internes** : jusqu'à 100 membres de l'équipe App Store Connect ; pas de revue d'Apple mentionnée.
- **Testeurs externes** : jusqu'à 10 000 ; le **premier build** ajouté à un groupe externe passe la revue bêta
  d'Apple (App Review) ; les suivants peuvent ne pas en avoir besoin. Il faut une description de la version bêta,
  des informations de revue et un e-mail de retour. Un **lien public** d'invitation est possible.
- Un build reste testable **90 jours**, puis expire.
- Lien avec le projet : un testeur externe sur iPhone est un « testeur externe » au sens de la jauge Phase 1 ; les
  TD « avant tout testeur externe » (dont TD-036, test sur un vrai téléphone Android) s'appliquent avant.

## 4. App iOS dans Firebase — constat en lecture seule

Constaté dans le dépôt et sur le poste, le 2026-11-04 (console Firebase **non consultée**) :
- **Contenu local (poste du founder), non versionné** : `Assets/StreamingAssets/GoogleService-Info.plist` est
  présent. C'est le fichier de configuration d'une app iOS déclarée dans Firebase, ce qui suggère qu'**une app iOS
  existe déjà** dans le projet Firebase. Seule valeur relevée (consigne du ticket) : identifiant de bundle
  (`BUNDLE_ID`) = `com.gne.guildsandempires`. Aucune autre valeur du fichier n'est reprise ici.
- **Contenu versionné** : le `.plist` lui-même est ignoré par git (`.gitignore`, l. 40) ; seul son fichier
  `Assets/StreamingAssets/GoogleService-Info.plist.meta` est versionné (`git ls-files`).
- `ProjectSettings/ProjectSettings.asset` : l'identifiant d'application Android vaut `com.gne.guildsandempires`
  (même valeur que le bundle iOS ci-dessus) ; **aucun identifiant iOS n'y est encore renseigné**, et la version
  minimale iOS y est 13.0.
- Le SDK Firebase du projet (`Assets/Firebase/Editor/AppDependencies.xml`) demande iOS 15.0 au minimum
  (`minTargetSdk="15.0"`, pod `Firebase/Core` 12.0.0) : écart à corriger quand la chaîne iOS sera montée (réglage
  Unity, hors de cette note). La documentation Firebase pour Unity indique aussi Xcode 26.2 et CocoaPods 1.12.0 ou
  plus récents pour la version courante du SDK : **à vérifier pour la version du SDK du projet**.
- Selon Firebase, l'identifiant de bundle saisi à l'enregistrement de l'app iOS **ne peut plus être modifié** :
  le même identifiant devra être utilisé dans App Store Connect et dans Unity. À confirmer dans la console
  Firebase (lecture par le founder) : l'app iOS existe bien, avec cet identifiant.

## 5. Actions F3 du founder (le jour où la chaîne iOS sera montée)

Toutes irréversibles ou payantes : chacune sera une question oui / non, regroupée, au ticket concerné. Aucune
n'est à faire maintenant.

1. **Choisir le type de compte Apple** : individuel (votre nom légal affiché comme vendeur) ou organisation (nom
   de la société, D-U-N-S et site web requis).
2. Si organisation : **obtenir un numéro D-U-N-S** (coût et délai à vérifier).
3. **Activer l'authentification à deux facteurs** sur le compte Apple qui servira à l'inscription.
4. **S'inscrire et payer** l'Apple Developer Program (99 USD par an, à vérifier ; renouvellement annuel).
5. **Créer l'app dans App Store Connect** (nom de l'app, identifiant de bundle `com.gne.guildsandempires`, à
   confirmer ; langue principale).
6. **Créer la clé d'API App Store Connect** (fichier `.p8`, téléchargeable **une seule fois** ; l'« Account
   Holder » demande d'abord l'accès à l'API) et la remettre au service de build par son coffre de secrets.
7. **Créer le certificat de distribution et le profil de provisionnement** (ou autoriser `fastlane match` à les
   créer), et le dépôt privé qui les stocke.
8. **Ouvrir le compte du service de build** choisi et y enregistrer un moyen de paiement si l'offre gratuite ne
   suffit pas ; fixer un plafond de dépense.
9. **Confirmer l'app iOS dans la console Firebase** (lecture), et fournir son `GoogleService-Info.plist` au
   service de build comme secret.
10. **Inviter les testeurs TestFlight** ; pour des testeurs externes : remplir les informations de revue bêta,
    après fermeture des TD « avant tout testeur externe ».

## 6. Recommandation

**GitHub Actions avec GameCI et fastlane**, parce que l'envoi automatique à TestFlight avec la licence Unity
gratuite y est documenté de bout en bout, avec un coffre de secrets, sur le dépôt GitHub existant, pour un coût à la minute faible (la partie Unity tourne sur Linux, la moins chère).

Mise à jour après la revue (2026-11-04) : Unity annonce un accès gratuit à Build Automation avec un Unity ID et
documente des scripts lancés pendant ou après la compilation, qui peuvent servir à un envoi automatique (renvoi à
fastlane pour iOS). L'écart avec GitHub Actions se réduit, mais la recommandation ne change pas : l'envoi à
TestFlight par ce moyen et l'usage avec la licence Personal restent à vérifier, les secrets passent par des
variables d'environnement plutôt que par un coffre, et un quota gratuit dépassé sans carte bloque l'accès.

Alternatives : Unity Build Automation (alternative proche ; le plus simple à brancher, 100 minutes Mac gratuites par
mois), si l'envoi automatique à TestFlight par un script après la compilation est confirmé ; Codemagic si une
licence Unity payante (Pro ou supérieure, à vérifier) est prise un jour pour une autre raison (500 minutes macOS
gratuites par mois, publication la plus simple).

Coût de mise en place à prévoir côté Claude Code (pas côté founder) : écrire le flux GitHub Actions (export Linux,
compilation et envoi macOS), le fichier `fastlane`, et le réglage des secrets ; à découper en sous-étapes le jour
où la chaîne iOS sera ouverte.

## Points à vérifier

- Prix et conditions de tous les services (Apple, Unity, Codemagic, GitHub) au moment de la souscription.
- Délais de vérification Apple et d'obtention d'un D-U-N-S (non chiffrés par Apple).
- Unity Build Automation : usage avec la licence Personal du projet (accès gratuit avec un Unity ID annoncé), et
  envoi automatique vers App Store Connect par un script lancé après la compilation (l'article de support ne décrit
  qu'un envoi manuel ; la documentation des scripts renvoie à fastlane pour iOS).
- Codemagic : exigence d'une licence Unity payante (Pro ou supérieure ; son guide nomme « Plus or Pro », offre Plus
  absente des offres annoncées par Unity) et prix actuel de ces licences.
- TestFlight : absence de revue d'Apple pour les testeurs internes (non mentionnée par les sources).
- Configuration requise par le SDK Firebase du projet (Xcode, CocoaPods, iOS minimal 15.0 contre 13.0 dans
  `ProjectSettings.asset`).
- Existence de l'app iOS dans la console Firebase, avec l'identifiant `com.gne.guildsandempires`.
- Durées réelles d'un build iOS (inconnues avant le premier build).

## Sources (consultées le 2026-11-04, lecture seule)

- Apple — comparaison des adhésions : https://developer.apple.com/support/compare-memberships/
- Apple — inscription au programme (prérequis, coût) : https://developer.apple.com/programs/enroll/
- Apple — TestFlight : https://developer.apple.com/testflight/
- Apple — vue d'ensemble de TestFlight (90 jours, revue) :
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- Apple — clés d'API App Store Connect :
  https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/
- Apple — envoi des builds : https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- Apple — Xcode Cloud (heures incluses, prix) : https://developer.apple.com/xcode-cloud/
- Unity — frais de Unity DevOps (minutes gratuites, prix au-delà, 1er mars 2026) :
  https://support.unity.com/hc/en-us/articles/34748492914964-Understanding-Unity-DevOps-charges
- Unity — Build Automation pour iOS (procédure, envoi manuel) :
  https://support.unity.com/hc/en-us/articles/32998687849108
- Unity — plafonds de builds simultanés : https://docs.unity.com/en-us/build-automation/manage-consumption-costs
- Unity — mises à jour des prix (accès gratuit à Build Automation avec un Unity ID, quotas, offres Personal / Pro,
  annonce du 10 novembre 2025) : https://unity.com/products/pricing-updates
- Unity — scripts personnalisés pendant la compilation (Build Automation) :
  https://docs.unity.com/en-us/build-automation/advanced-build-configuration/run-custom-scripts-during-the-build-process
- Codemagic — tarifs : https://codemagic.io/pricing/
- Codemagic — build d'une app Unity : https://docs.codemagic.io/yaml-quick-start/building-a-unity-app/
- GitHub — facturation d'Actions (calcul inclus, dépôts publics) :
  https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitHub — prix par minute des machines : https://docs.github.com/en/billing/reference/actions-minute-multipliers
- GameCI — chaîne iOS (export Linux, fastlane) : https://game.ci/docs/github/deployment/ios/
- GameCI — activation de la licence Unity (Personal acceptée) : https://game.ci/docs/github/activation/
- Firebase — ajouter Firebase à un projet Unity (bundle, plist, Xcode, CocoaPods, iOS 15) :
  https://firebase.google.com/docs/unity/setup

Les pages ont été lues par un outil de lecture automatique qui en a extrait un résumé ; les chiffres viennent de
ces résumés. Ils sont à reconfirmer sur la page avant toute souscription.
