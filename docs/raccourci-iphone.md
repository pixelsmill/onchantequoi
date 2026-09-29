# Raccourci iPhone « Envoyer à la Chorale »

Sur Android, l'appli de la chorale peut recevoir directement les fichiers qu'on lui « partage » depuis n'importe quelle app (WhatsApp, Fichiers, Mail…). Sur iPhone, ce n'est malheureusement pas possible : une appli web (même installée sur l'écran d'accueil) ne peut pas apparaître comme destination dans la feuille de partage d'iOS. Il n'y a pas de contournement.

La solution d'Apple pour ce genre de cas s'appelle un **raccourci** (l'app Raccourcis, préinstallée sur tous les iPhone). Un raccourci peut, lui, apparaître dans la feuille de partage, récupérer un fichier audio et l'envoyer directement au serveur de la chorale.

Petite contrainte technique : on ne peut pas simplement générer un fichier de raccourci tout prêt et le distribuer, car Apple exige que les raccourcis partagés passent par leurs propres serveurs (iCloud) et n'accepte pas d'installer un fichier `.shortcut` fabriqué en dehors de l'app. Il faut donc :

1. **Construire le raccourci une seule fois**, à la main, dans l'app Raccourcis (recette ci-dessous) ;
2. Le **partager par un lien iCloud** dans le groupe WhatsApp de la chorale ;
3. Chaque choriste sur iPhone **installe ce raccourci** en un clic depuis le lien, une seule fois aussi.

Ensuite, au quotidien, envoyer un audio à la chorale depuis n'importe quelle app (WhatsApp, Fichiers, Mail, Messages…) ne prend que quelques secondes.

> Les libellés exacts de l'app Raccourcis ci-dessous ont été vérifiés sur la documentation officielle Apple (en français, versions iOS 18 et iOS 26). Quelques détails plus fins (certains noms de champs secondaires, et le comportement précis du menu de partage de WhatsApp, qui change souvent) n'ont pas pu être vérifiés à 100 % : ils sont signalés par ⚠️ et donnés avec leur équivalent anglais entre parenthèses, au cas où l'écran de votre iPhone afficherait un mot légèrement différent.

---

## Créer le raccourci (une seule fois)

Cette partie est à faire une seule fois, par une seule personne à l'aise avec un iPhone (le prof, vous, ou un·e volontaire). Une fois créé, le raccourci sera partagé à tout le monde (section suivante) — les autres choristes n'auront jamais à refaire cette partie.

**Avant de commencer**, notez quelque part l'adresse exacte du site de la chorale et sa clé secrète, sous la forme :

```
https://VOTRE-PROJET.web.app/api/depot?cle=VOTRE-CLE
```

(remplacez `VOTRE-PROJET` et `VOTRE-CLE` par les vraies valeurs de votre installation).

1. Ouvrez l'app **Raccourcis** sur l'iPhone.
2. Onglet **Raccourcis** en bas → bouton **+** (en haut à droite) pour créer un nouveau raccourci.
3. Touchez le nom en haut (« Nouveau raccourci ») et renommez-le **Envoyer à la Chorale**.
4. **Ajoutez une première action « Texte »** : touchez **Ajouter une action**, tapez « texte » dans la recherche, choisissez l'action **Texte**, et collez dedans votre adresse complète, par exemple :
   `https://VOTRE-PROJET.web.app/api/depot?cle=VOTRE-CLE`
   *Astuce : en mettant cette adresse toute seule dans une action tout en haut du raccourci, vous pourrez la retrouver et la modifier en deux secondes le jour où la clé changera — sans avoir à rouvrir l'action « Obtenir le contenu de l'URL » plus bas, plus difficile à relire.*
5. **Configurez la réception depuis la feuille de partage** :
   - Touchez l'icône ⓘ (ou le nom du raccourci puis l'icône de réglages) pour ouvrir **Détails**.
   - Activez **« Dans la feuille de partage »** (parfois notée « Afficher dans la feuille de partage » selon la version d'iOS). Touchez **OK**.
   - Une nouvelle action apparaît alors tout en haut du raccourci (avant même l'action Texte) : c'est elle qui définit ce que le raccourci peut recevoir depuis WhatsApp. Touchez **Tout** dans cette action pour ouvrir la liste des types.
   - **Décochez tout** (bouton **Effacer**), puis cochez uniquement **Fichiers** et **Supports** (c'est le nom officiel de la catégorie « audio et vidéo », parfois appelée « Médias » dans d'anciens tutoriels — cochez-la, c'est la même chose). Cela couvre les fichiers audio WhatsApp (`.m4a`, `.mp4`) et les messages vocaux (`.opus`). Touchez **OK**.
   - Toujours dans cette même action, touchez **Continuer** (juste en dessous) pour régler ce qui se passe **si aucune entrée n'est reçue** (par exemple si quelqu'un ouvre le raccourci par erreur sans rien partager). Choisissez **Arrêter et répondre**, touchez **Réponse** et écrivez un petit message du style : *« Partagez d'abord un ou plusieurs fichiers audio depuis WhatsApp, puis choisissez ce raccourci. »*
6. **Ajoutez la boucle** : touchez **Ajouter une action**, cherchez « répéter », choisissez **Répéter chaque élément**. Dans le champ de la boucle, choisissez la variable qui représente ce que le raccourci a reçu (elle s'appelle en général **Fichiers** ou **Entrée du raccourci** selon l'écran précédent — glissez-la ou sélectionnez-la dans la liste des variables proposées). Deux repères apparaissent : **Répéter pour chaque élément** et **Fin de la récurrence** ; toutes les actions suivantes doivent être placées **entre les deux**.
7. **Dans la boucle**, ajoutez l'action **Obtenir le contenu de l'URL** (cherchez « obtenir le contenu de l'url ») :
   - Dans le champ URL, mettez la variable magique produite par votre action **Texte** de l'étape 4 (touchez le champ, la variable doit apparaître au-dessus du clavier — sinon touchez l'icône de variables).
   - Touchez **En afficher plus** pour révéler les réglages avancés.
   - **Méthode** : choisissez **POST**.
   - **En-têtes** : ajoutez une ligne, avec comme clé `X-Nom` et comme valeur la variable magique **Répéter l'élément** — touchez cette variable une fois insérée pour choisir sa propriété **Nom** ⚠️ *(nom exact du réglage non retrouvé mot pour mot dans la documentation Apple, mais c'est la propriété standard pour le nom d'un fichier ; en anglais : Name)*.
   - **Demander le corps** (c'est le nom officiel du réglage souvent appelé « Corps de la requête » dans les tutoriels ; en anglais *Request Body*) : choisissez **Fichier**, puis sélectionnez la variable magique **Répéter l'élément** comme fichier à envoyer.
8. **Toujours dans la boucle**, juste après, ajoutez l'action **Afficher la notification** (cherchez « afficher la notification ») et mettez, comme texte, la variable magique renvoyée par l'action **Obtenir le contenu de l'URL** juste au-dessus (le texte que répond le serveur, par exemple *1 audio envoyé dans « À classer »*).
9. Vérifiez que ces deux actions (7 et 8) sont bien **entre** les repères **Répéter pour chaque élément** et **Fin de la récurrence** de l'étape 6.
10. Touchez **Terminé** en haut à droite pour enregistrer.
11. **Testez-le tout de suite** : depuis WhatsApp ou l'app Fichiers, partagez-vous un fichier audio à vous-même (ou utilisez un audio déjà reçu) et essayez le raccourci (voir la section *Envoyer des audios depuis WhatsApp* ci-dessous). Vous devez voir une notification avec la réponse du serveur.

---

## Partager le raccourci dans le groupe

Une fois le raccourci créé et testé, partagez-le à tout le monde via un lien iCloud :

1. Dans l'app Raccourcis, sur la tuile **Envoyer à la Chorale**, touchez **···** (ou appui long) puis l'icône de partage.
2. Touchez **Copier le lien iCloud**, puis **Copier le lien** dans la fenêtre qui apparaît.
3. Collez ce lien dans le groupe WhatsApp de la chorale, avec un petit mot du genre : *« Sur iPhone, installez ce raccourci une fois (cliquez sur le lien → Obtenir le raccourci), il permettra d'envoyer direct depuis WhatsApp. »*

> ⚠️ **Important : le lien contient la clé secrète de la chorale**, puisque le raccourci l'a en dur dans son action Texte. Ne le postez donc **que** dans le groupe privé de la chorale, jamais ailleurs (pas de story publique, pas de relais sur un autre groupe).
>
> Si un jour la clé change (parce qu'elle a fuité, ou pour tout autre motif), **tout le monde devra mettre à jour** : soit en rouvrant le raccourci et en modifiant l'action Texte de l'étape 4 (le plus simple, si la personne est à l'aise), soit en réinstallant une nouvelle version du raccourci que vous repartagerez avec un nouveau lien.

**Variante possible : demander l'adresse à l'installation.** L'app Raccourcis propose une fonctionnalité de **« questions à l'importation »** qui permet, quand quelqu'un installe votre raccourci partagé, de lui demander de saisir lui-même une valeur (au lieu de la recevoir déjà remplie). Elle existe toujours dans les versions récentes (vérifiée sur la doc iOS 18 / iOS 26). Pour l'activer : ouvrez le raccourci → touchez l'icône de partage → en haut de l'écran touchez **Configuration** → **Ajouter une nouvelle question** → touchez le champ concerné (votre action Texte de l'étape 4), puis retouchez son nom dans la zone **Questions à l'importation** → écrivez votre question dans **Texte de la question** → vous pouvez pré-remplir une **Réponse par défaut** (par exemple l'adresse actuelle, pour que la plupart des gens n'aient qu'à valider). **Pour cette recette, ce n'est pas recommandé** : tout le monde doit utiliser exactement la même adresse et la même clé, et faire ressaisir une URL à la main par des non-développeurs est une source d'erreurs (espace en trop, faute de frappe...). L'action Texte modifiable en un point unique (étape 4) reste la solution la plus simple à corriger en cas de changement.

---

## Installer le raccourci reçu

Pour chaque choriste qui reçoit le lien dans WhatsApp :

1. Touchez le lien reçu dans WhatsApp (il ressemble à `https://www.icloud.com/shortcuts/...`). Cela ouvre l'app Raccourcis avec un aperçu du raccourci **Envoyer à la Chorale**.
2. Touchez **Obtenir le raccourci**. Il est ajouté à votre collection de raccourcis (onglet **Raccourcis**).
3. La **première fois seulement** que vous l'utilisez, iOS va probablement afficher une ou deux fenêtres de confidentialité, du type *« Autoriser "Raccourcis" à se connecter à … ? »*. Touchez **Toujours autoriser** (sinon la question reviendra à chaque envoi).
4. C'est prêt : le raccourci est maintenant disponible dans la feuille de partage de toutes vos apps (voir ci-dessous). Si vous ne le voyez pas tout de suite dans la liste, regardez la section *En cas de souci*.

---

## Envoyer des audios

Depuis n'importe quelle app où se trouve l'audio (WhatsApp, Fichiers, Mail, Messages…) : touchez **Partager**, puis **Envoyer à la Chorale**. Deux exemples détaillés :

### Depuis une conversation WhatsApp

1. Dans la conversation où le prof a posté les audios, faites un **appui long** sur le message audio à envoyer.
2. Dans le menu qui s'affiche, touchez **Transférer**. ⚠️ *(Le menu exact de WhatsApp change assez régulièrement ; s'il propose directement une icône « Partager », vous pouvez l'utiliser à la place de « Transférer ».)*
3. Sur l'écran suivant, touchez l'icône de partage (carré avec une flèche vers le haut), en haut ou en bas de l'écran selon la version de WhatsApp — c'est ce qui ouvre la feuille de partage classique d'iOS (celle qui propose Messages, Mail, AirDrop...).
4. Faites glisser la première rangée d'icônes vers la gauche jusqu'à trouver **Envoyer à la Chorale**, ou touchez **Plus** pour la retrouver dans la liste complète (voir *En cas de souci* si elle n'apparaît pas).
5. Touchez **Envoyer à la Chorale**. Une notification apparaît quelques secondes après avec la réponse du serveur (par exemple `1 audio envoyé dans « À classer »`).

**Pour plusieurs audios à la fois** : dans WhatsApp, touchez et maintenez un premier message audio jusqu'à voir apparaître des cases à cocher, puis touchez les autres audios à envoyer pour les sélectionner aussi, et utilisez le bouton de transfert/partage de la barre du bas. Si cette sélection multiple ne propose pas d'aller directement vers la feuille de partage iOS chez vous, faites-le audio par audio comme ci-dessus (étapes 1 à 5) : le raccourci sait de toute façon traiter un ou plusieurs fichiers d'un coup grâce à sa boucle « Répéter chaque élément ».

### Depuis l'app Fichiers

Si un audio a déjà été enregistré dans l'app **Fichiers** (par exemple reçu par un autre moyen, ou sauvegardé depuis WhatsApp) :

1. Ouvrez l'app **Fichiers** et repérez le fichier audio.
2. Appui long dessus, puis touchez **Partager**.
3. Dans la feuille de partage, choisissez **Envoyer à la Chorale** comme ci-dessus (possible aussi de sélectionner plusieurs fichiers d'un coup avec **Sélectionner** en haut de l'app Fichiers, puis **Partager**).

---

## En cas de souci

**La notification affiche « Lien de la chorale invalide » (erreur 403)**
La clé secrète contenue dans le raccourci n'est plus valable (elle a été changée ou supprimée côté chorale). Il faut mettre à jour l'action Texte du raccourci avec la nouvelle adresse (voir *Partager le raccourci dans le groupe*), ou réinstaller la nouvelle version partagée par l'organisateur de la chorale.

**Rien ne se passe / aucune notification n'apparaît**
- Vérifiez votre connexion internet (Wi-Fi ou données mobiles).
- Vérifiez que vous avez bien touché **Toujours autoriser** lors du premier lancement (sinon iOS peut bloquer silencieusement la requête, ou la redemander sans que ce soit visible si vous avez touché trop vite ailleurs).
- Rouvrez le raccourci en mode édition et relancez un test simple pour voir à quelle étape ça bloque.

**Un fichier ne part pas (audio trop long ou trop lourd)**
Le serveur de la chorale refuse les fichiers de plus de **30 Mo** environ. Un message audio WhatsApp classique fait quelques Mo, donc ce cas est rare (cela peut arriver avec un enregistrement de répétition complète très long).

**Le raccourci n'apparaît pas dans la feuille de partage**
- Ouvrez l'app Raccourcis, vérifiez que **« Dans la feuille de partage »** est bien activé dans les Détails du raccourci, et que les types acceptés incluent bien **Fichiers** et **Supports**.
- Dans la feuille de partage, tout en bas de la première rangée d'icônes, touchez **Plus** (ou l'icône **···**) : une liste d'apps et de raccourcis s'affiche, avec des interrupteurs. Activez **Envoyer à la Chorale**, et si vous voulez, remontez-le en haut de la liste avec la poignée **☰** pour l'avoir toujours sous la main.

**Une fenêtre demande d'autoriser Raccourcis à se connecter à un site**
C'est normal la première fois : touchez **Toujours autoriser**. C'est la vérification de sécurité standard d'iOS quand un raccourci contacte un site internet pour la première fois ; elle ne redemandera plus ensuite.

---

## Version courte (pour la page d'aide de l'app)

1. Recevez le lien du raccourci dans le groupe WhatsApp de la chorale et touchez-le.
2. Touchez **Obtenir le raccourci** dans l'app Raccourcis.
3. Ouvrez l'app où se trouve l'audio (WhatsApp, Fichiers, Mail…).
4. Touchez **Partager** (dans WhatsApp : appui long sur l'audio, puis **Transférer** et l'icône de partage).
5. Choisissez **Envoyer à la Chorale** dans la liste (touchez **Plus** si vous ne la voyez pas).
6. La première fois, une fenêtre demande d'autoriser la connexion : touchez **Toujours autoriser**.
7. Attendez quelques secondes : une notification confirme l'envoi (par exemple « 1 audio envoyé »).
8. Si le message dit « déjà reçu », c'est normal, quelqu'un l'a déjà envoyé avant vous.
9. Si le message parle de « lien invalide », prévenez l'organisateur : la clé a changé, il faut réinstaller le raccourci.
10. Vous pouvez répéter l'opération pour plusieurs audios à la suite, un par un.
11. Ensuite, allez classer les audios reçus dans la webapp de la chorale (voix, puis morceau).
