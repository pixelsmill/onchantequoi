# Brief : webapp « Chorale » (répétitions par voix)

## Contexte
Je suis choriste. Après chaque cours, le prof envoie sur un groupe WhatsApp 4 fichiers audio par morceau : Soprane, Alto, Hommes, Tous.
Ces fichiers n'ont pas de titre, ils arrivent dans un ordre variable, et au début de chaque enregistrement le prof annonce à voix haute de quelle voix il s'agit.
Les fichiers reçus portent des noms comme « AUD-20260925-WA0001 » (Android) ou « WhatsApp Audio 2026-09-23 at 22.34.43.mp4 » (ordinateur ou iPhone).
Ce sont des fichiers audio joints (AAC en conteneur .mp4 ou .m4a), pas des messages vocaux Opus.
Le prof a probablement un iPhone.

But : une webapp privée, pensée pour le smartphone, qui affiche une liste de morceaux avec 4 boutons chacun (S · A · H · Tous) pour réviser.
Contrainte forte : le prof ne doit pas changer ses habitudes. Au plus, on lui demande un « Partager vers Chorale » en plus de WhatsApp.

## Décisions déjà prises (à respecter)
- Stack : Firebase (Hosting, Firestore, Storage, Auth anonyme, Cloud Functions gen2 en europe-west1). Le forfait Blaze est accepté, avec une alerte budget à 1 €.
- **Pas de comptes ni de mot de passe.** L'accès se fait par lien secret `https://<projet>.web.app/?cle=<clé>`, et la clé est retenue dans le localStorage.
  Les clés valides sont des documents `keys/{clé}` créés à la main dans la console. Chaque téléphone s'inscrit dans `members/{uid}` avec `{key}`.
  Les règles vérifient que `members/uid` existe et que `keys/<sa clé>` existe encore. Supprimer une clé coupe donc l'accès de tous ceux qui l'ont utilisée.
- **Tout le monde peut déposer et classer.** Le premier qui classe gagne (transaction), et un bouton « Mal classé ? » renvoie l'audio dans « À classer ».
- **Classement manuel (phase 1)** : on écoute, on touche la voix, puis on choisit ou crée le morceau. Le dernier morceau choisi est pré-rempli pour les audios suivants.
- **Pas d'historique** : un nouvel audio remplace l'ancien pour la même voix du même morceau, et l'ancien fichier est supprimé du Storage.
- **Dédoublonnage** : l'id du fichier est son empreinte SHA-256 (`files/{sha256}`, Storage `audio/{sha256}`).
- **Pas de prénom ni de « classé par » pour l'instant** (peut-être plus tard, stocké uniquement en local).
- L'interface est en français, mobile d'abord, avec thème clair et sombre, sans framework (HTML/CSS/JS en modules ES).

## Modèle de données
- `songs/{id}` : `{ title, voices: { S|A|H|T: { hash, at } }, createdAt, updatedAt }`
- `files/{sha256}` : `{ status: 'inbox'|'classified', name, size, type, createdAt, song?, voice?, source? }`
- `keys/{clé}` : les clés d'accès, jamais lisibles côté client
- `members/{uid}` : `{ key, at }`

## Ce qui existe déjà (dans ce dossier)
- `public/` : la webapp. `index.html`, `style.css`, `app.js` (vues Morceaux et À classer, dépôt, lecteur avec −10 s, vitesses 1 / 0,85 / 0,7, boucle et « Mal classé ? »), `config.js` (config Firebase ; tant que `apiKey:"REMPLACER"`, l'app tourne en mode démo), `backend-firebase.js`, `backend-demo.js` (en mémoire, même interface), `sw.js` (coquille hors-ligne et **share target** Android sur POST `/share`), `manifest.webmanifest`, `icons/`.
- `firestore.rules`, `storage.rules` : écrits mais **pas encore testés** avec l'émulateur.
- `functions/` : fonction HTTP `depot`, joignable via la réécriture Hosting `/api/depot`, `POST ?cle=…`.
  Elle accepte le corps brut (en-tête `X-Nom` facultatif) ou du multipart, détecte le format par les premiers octets, dédoublonne et crée `files/{hash}` en `inbox`.
  `lib.js` contient la logique pure et `test.js` ses tests (`npm test`, qui passe). **Pas encore déployée ni testée de bout en bout.**
- `LISEZMOI.md` : guide de mise en ligne et d'utilisation, à mettre à jour.
- Le mode démo a été testé avec Playwright en viewport mobile : dépôt, classement, remplacement, doublons, lecture, « Mal classé », sans erreur console.

## À faire, dans l'ordre
1. **Raccourci iPhone « Envoyer à la Chorale »** (le prof et les choristes sur iPhone ; une PWA ne peut pas être cible de partage sur iOS).
   Un fichier .shortcut ne peut pas être généré (signature Apple). Il faut donc rédiger une recette pas à pas en français pour le créer une fois dans l'app Raccourcis :
   « Afficher dans la feuille de partage », entrée = Fichiers/Médias → Répéter avec chaque élément → Obtenir le contenu de l'URL, en POST sur `https://<projet>.web.app/api/depot?cle=<clé>`, corps = Fichier, en-tête `X-Nom` = nom de l'élément → Afficher la notification avec la réponse texte.
   Il faut ensuite pouvoir le partager par lien iCloud dans le groupe. Ajouter aussi dans la webapp une petite page d'aide « Installer sur mon téléphone » (Android : installation de la PWA ; iPhone : lien du raccourci).
2. **Glisser-déposer sur ordinateur** dans la webapp (zone de dépôt sur toute la page quand on glisse des fichiers).
3. **Tester les règles** Firestore et Storage avec l'émulateur Firebase (`@firebase/rules-unit-testing`) : non-membre refusé, clé supprimée → accès coupé, `keys` illisible.
4. Mettre à jour `LISEZMOI.md` : déploiement des functions, recette du raccourci.
5. Plus tard :
   - relevé e-mail : une adresse Gmail dédiée et un Google Apps Script qui, toutes les 5 min, poste les pièces jointes sur `/api/depot` ;
   - pré-cochage automatique de la voix par transcription du début de l'audio (le prof dit « sopranes », « altos »…) ;
   - éventuel bot WhatsApp (Baileys) avec un numéro dédié, un fixe en WhatsApp Business par exemple ;
   - prénom local.

## Points d'attention
- La limite des requêtes HTTP des Cloud Functions est de 32 Mo (MAX est fixé à 30 Mo dans `lib.js`).
- Les fichiers `.mp4` audio arrivent souvent en `video/mp4` : l'input file, le share target et `guessType` les acceptent déjà. Garder ce comportement.
- Si la fonction et les règles Storage lisent Firestore, il faut accepter l'autorisation inter-services au déploiement.
- Toujours conserver le mode démo fonctionnel (il sert à montrer l'app sans backend).
