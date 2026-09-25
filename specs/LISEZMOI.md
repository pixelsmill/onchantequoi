# Chorale – webapp de répétition

Une liste de morceaux avec 4 boutons chacun (**S · A · H · Tous**), et un onglet **À classer** que tous les choristes peuvent remplir.

## Essayer tout de suite (mode démo)

Tant que `public/config.js` contient `apiKey: "REMPLACER"`, l'app tourne avec des données fictives.

```bash
cd public && python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Mise en ligne sur Firebase (environ 20 min, une seule fois)

1. **Créer le projet** sur https://console.firebase.google.com, par exemple « chorale-xxx ».
2. **Passer au forfait Blaze**, ce qui demande une carte bancaire. C'est obligatoire pour le stockage des audios, mais ça reste gratuit sous 5 Go.
   → Dans *Google Cloud Console > Facturation > Budgets*, créez un budget de 1 € avec une alerte e-mail.
3. **Authentication** > Commencer > Méthode de connexion : activez **Anonyme**.
4. **Firestore Database** > Créer une base : mode production, région `europe-west1` ou `eur3`.
5. **Storage** > Commencer : même région.
6. **Paramètres du projet** > *Vos applications* > ajoutez une **application Web** (icône `</>`).
   Copiez la configuration dans `public/config.js`, et mettez aussi le nom de la chorale dans `choirName`.
7. Dans `.firebaserc`, remplacez `REMPLACER-par-id-du-projet` par l'ID du projet.
8. Déployez :
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy
   ```
   Si la console vous le demande, acceptez l'autorisation qui permet aux règles de Storage de lire Firestore.

## Créer le lien d'accès de la chorale

Dans **Firestore**, cliquez sur *Commencer une collection* :

- ID de la collection : `keys`
- ID du document : une clé secrète, par exemple `VMgkUrmfd6r0nNB4RdSrow` (ou inventez-en une longue, uniquement avec des lettres et des chiffres)
- champ : `note` (texte) = `lien de septembre 2026`, par exemple

Le lien à poster dans le groupe WhatsApp est ensuite :

```
https://<id-du-projet>.web.app/?cle=VMgkUrmfd6r0nNB4RdSrow
```

Chacun l'ouvre une fois, puis fait *Ajouter à l'écran d'accueil* : Chrome sur Android, ou Partager > Sur l'écran d'accueil dans Safari sur iPhone. Le téléphone retient la clé.
Sur iPhone, l'app installée peut redemander le lien une seule fois : il suffit de le coller.

**Changer le lien** (s'il a fuité) : créez un nouveau document dans `keys`, supprimez l'ancien, et postez le nouveau lien. Les anciens accès sont coupés immédiatement.

## Utilisation

- **Déposer** : bouton en bas à droite, pour choisir un ou plusieurs audios.
  - *Android* : une fois l'app installée, on peut aussi partir de WhatsApp. On sélectionne les audios, on touche **Partager**, puis **Chorale**.
  - *iPhone* : dans WhatsApp, on enregistre d'abord les audios dans *Fichiers*, puis on utilise **Déposer**.
- **À classer** : on écoute, on touche la voix annoncée par le prof, on choisit le morceau (ou on tape un nouveau titre), puis on touche **Classer**. Le morceau choisi est pré-rempli pour les audios suivants.
- Si deux personnes déposent le même audio, il n'est gardé qu'une fois. Si deux personnes classent le même audio en même temps, c'est le premier qui compte.
- Un nouvel enregistrement **remplace** l'ancien pour la même voix du même morceau, et l'ancien fichier est supprimé.
- **Mal classé ?** : dans le lecteur, ce bouton renvoie l'audio dans « À classer ».
- Le lecteur propose aussi un retour de 10 s, une vitesse 1× / 0,85× / 0,7× (sans changer la hauteur des notes) et une boucle.
- Le menu **⋯** d'un morceau permet de le renommer, ou de le supprimer s'il est vide.

## Fichiers

| Fichier | Rôle |
|---|---|
| `public/index.html`, `style.css`, `app.js` | l'app |
| `public/backend-firebase.js` | accès Firebase (connexion anonyme, Firestore, Storage) |
| `public/backend-demo.js` | mode démo en mémoire |
| `public/sw.js`, `manifest.webmanifest` | installation sur le téléphone, réception des partages WhatsApp |
| `firestore.rules`, `storage.rules` | sécurité : accès uniquement avec une clé valide |

## À vérifier au premier essai

- Les messages vocaux WhatsApp sont au format Opus/Ogg. Ils se lisent sans problème sur Android et sur les iPhone récents, mais un iPhone ancien (iOS 17 ou moins) pourrait ne pas les lire. Si le cas se présente, on ajoutera une conversion automatique.

## Pistes pour la suite

- Transcription automatique du début de l'audio pour pré-cocher la voix, puisque le prof l'annonce.
- Un bot WhatsApp qui dépose les audios tout seul.
- Le prénom de la personne qui a classé l'audio.
