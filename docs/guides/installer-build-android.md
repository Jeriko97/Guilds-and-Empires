# Installer le jeu sur votre téléphone Android — guide pour le founder

Ce guide vous explique, pas à pas, comment installer la version de test du jeu sur un téléphone Android et ce qu'il
faut nous renvoyer. Il a été préparé en 19.5c (TD-036), avant que vous ayez un appareil : les étapes marquées
« à vérifier avec l'appareil » n'ont pas pu être essayées sur ce poste.

## Avant tout : avertissement

- **N'installez pas et ne jouez pas ce fichier maintenant.** Cette version du jeu parle à la **production** Firebase
  (les vrais serveurs du jeu). Elle ne doit être installée et jouée qu'**après** le déploiement de 19.5 (serveurs et
  jeu mis à jour ensemble, condition (a) de D-ETAPE19-008) et après la sous-étape de corrections (D-ETAPE19-018).
- Le fichier produit en 19.5c sert seulement à vérifier que la fabrication du fichier fonctionne. **Il sera
  reconstruit** au moment du déploiement : c'est ce nouveau fichier que vous installerez, au même endroit et sous le
  même nom.
- **Ne partagez pas le fichier `.apk`** (ni par courriel, ni par messagerie, ni sur un cloud) : il contient la
  configuration de production du jeu. Il est pour vous seul.

## 1. Ce qu'il vous faut

- Ce PC Windows, avec Unity installé (le dossier `G:\Unity\6000.2.2f1` existe). L'outil d'installation
  (`adb.exe`) est fourni avec Unity ; en principe, aucun autre logiciel n'est à installer, mais Windows peut avoir
  besoin du pilote USB du fabricant du téléphone (voir l'étape 4). À vérifier avec l'appareil.
- Votre téléphone Android (Android 7.0 ou plus récent).
- Un **câble USB de données** (pas un câble « charge seule » : en cas de doute, utilisez le câble livré avec le
  téléphone).
- Le fichier du jeu, sur ce PC :
  `G:\Unity\GuildsAndEmpires\Builds\Android\GuildsAndEmpires-dev.apk`

## 2. Réglages à activer sur le téléphone (une seule fois)

Les noms des menus changent un peu selon la marque ; les étapes ci-dessous sont celles d'Android standard, avec les
noms Samsung entre parenthèses. À vérifier avec l'appareil.

1. **Activer les options pour les développeurs.** Ouvrez **Paramètres** › **À propos du téléphone** (Samsung :
   **À propos du téléphone** › **Informations sur le logiciel**). Touchez **sept fois** la ligne **Numéro de build**
   (Samsung : **Numéro de version**). Le téléphone peut vous demander votre code de déverrouillage. Un message
   indique alors « Vous êtes maintenant développeur » (ou « Le mode Développeur a été activé »).
2. **Activer le débogage USB.** Revenez dans **Paramètres** ; ouvrez **Système** › **Options pour les développeurs**
   (Samsung : **Options de développement**, en bas de la liste des Paramètres). Activez **Débogage USB** et
   confirmez avec **OK**.

## 3. Brancher le téléphone et autoriser ce PC

1. Déverrouillez le téléphone et branchez-le au PC avec le câble de données.
2. Sur le téléphone, une fenêtre « **Autoriser le débogage USB ?** » s'affiche, avec l'empreinte de ce PC. Cochez
   **Toujours autoriser sur cet ordinateur**, puis touchez **Autoriser**. Si la fenêtre ne s'affiche pas :
   débranchez, rebranchez, et regardez le volet des notifications du téléphone.
3. Si le téléphone demande l'usage de la connexion USB, choisissez **Transfert de fichiers**.

À vérifier avec l'appareil.

## 4. Installer le jeu

1. Sur le PC, ouvrez **Windows PowerShell** (menu Démarrer, tapez « PowerShell », puis Entrée).
2. Vérifiez que le PC voit le téléphone. Copiez la ligne suivante, collez-la dans PowerShell (clic droit), puis
   appuyez sur Entrée :

   ```powershell
   & "G:\Unity\6000.2.2f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe" devices
   ```

   Résultat attendu : une ligne avec un numéro suivi du mot `device`. Si vous lisez `unauthorized`, regardez le
   téléphone et autorisez ce PC (étape 3). Si la liste est vide, changez de câble ou de prise USB ; si elle reste
   vide, Windows n'a peut-être pas le pilote USB du fabricant du téléphone (cas fréquent avec les téléphones
   Samsung) : dites-le-nous avant d'installer quoi que ce soit. À vérifier avec l'appareil.
3. Installez le jeu :

   ```powershell
   & "G:\Unity\6000.2.2f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe" install -r "G:\Unity\GuildsAndEmpires\Builds\Android\GuildsAndEmpires-dev.apk"
   ```

   Résultat attendu, après quelques secondes : `Success`. L'option `-r` permet de remplacer une version déjà
   installée sans perdre vos données de jeu. À vérifier avec l'appareil.

Seule commande essayée sur ce poste (19.5c), sans téléphone : `adb.exe version`, qui répond
`Android Debug Bridge version 1.0.41` (version 34.0.5) ; l'outil est donc bien présent à ce chemin.

## 5. Vérifier que le jeu est installé

- Sur le téléphone : une icône du jeu apparaît dans la liste des applications.
- Sur le PC (facultatif) :

  ```powershell
  & "G:\Unity\6000.2.2f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe" shell pm list packages com.gne.guildsandempires
  ```

  Résultat attendu : `package:com.gne.guildsandempires`. À vérifier avec l'appareil.

Si le fichier installé est une version de développement (ce point sera décidé avant le déploiement), la mention
« Development Build » en bas de l'écran du jeu est normale.

## 6. Ce qu'il faut jouer

Une fois le déploiement de 19.5 fait (voir l'avertissement), lancez le jeu et faites la boucle complète :

1. **Produire** : ouvrez la production.
2. **Lancer un lot** de planches, puis de kits.
3. **Arrêter** un lot en cours.
4. **Collecter** ce qui a été produit.
5. **Vendre** au marché.

À chaque écran, regardez aussi la **lisibilité** : textes coupés ou trop petits, boutons hors de l'écran ou difficiles
à toucher, éléments cachés par l'encoche ou par la barre du bas du téléphone.

## 7. Ce qu'il faut nous renvoyer

- Des **captures d'écran** de chaque étape de la boucle (sur la plupart des téléphones : bouton **Marche** et bouton
  **Volume bas** en même temps).
- Le **modèle** du téléphone et sa **version d'Android** (Paramètres › À propos du téléphone).
- Un court **constat** : pour chaque étape, « ça marche » ou ce qui ne va pas (message affiché, écran figé, texte
  illisible), et l'heure approximative.

## 8. Désinstaller le jeu

- Sur le téléphone : appui long sur l'icône du jeu › **Désinstaller** (ou Paramètres › Applications › le jeu ›
  **Désinstaller**).
- Ou depuis le PC :

  ```powershell
  & "G:\Unity\6000.2.2f1\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe" uninstall com.gne.guildsandempires
  ```

  Résultat attendu : `Success`. À vérifier avec l'appareil.
- Quand vous avez fini les essais, vous pouvez désactiver **Débogage USB** dans les options pour les développeurs.

## Repères techniques (pour Claude Code)

Fichier de 19.5c : version de développement (Development Build), signée avec la clé de débogage de Unity
(`%USERPROFILE%\.android\debug.keystore`), aucune clé de publication ; identifiant `com.gne.guildsandempires`. Toute
clé de publication, toute publication (Google Play) ou action sur une console reste F3.
