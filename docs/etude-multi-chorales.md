# Étude : 2 ou 3 chorales dans la même app

Étude seulement, rien n'est codé. Novembre 2026.

**But** : une seule app (onchantequoi.web.app), chaque chorale a son lien secret, ses morceaux, ses audios et son « À classer ». Un choriste d'une chorale ne voit rien des autres.

## En bref

- **Modèle recommandé** : un document par chorale, et ses morceaux et audios **dans** ce document (sous-collections). La clé d'accès dit à quelle chorale elle donne accès.
- **Les liens actuels restent valables** : la chorale actuelle devient la chorale `1`, et une clé sans chorale indiquée y mène.
- **Migration** : un script copie les morceaux et les audios actuels dans la chorale `1`. Les téléphones n'ont rien à faire.
- **Effort** : environ 2 à 2,5 jours, en une session de développement, plus la migration de la production faite par toi.
- **Coût Firebase** : inchangé en pratique (une lecture de plus par vérification des règles, déjà en cache).

## 1. Modèle de données

| Aujourd'hui | Demain |
|---|---|
| `songs/{id}` | `choirs/{chorale}/songs/{id}` |
| `files/{sha256}` | `choirs/{chorale}/files/{sha256}` |
| Storage `audio/{sha256}` | Storage `audio/{chorale}/{sha256}` |
| `keys/{clé}` : `{ note }` | `keys/{clé}` : `{ note, choir }` |
| `members/{uid}` : `{ key, at }` | `members/{uid}` : `{ keys: { {chorale}: clé }, at }` |
| `config.ts` : `choirName`, `teacherName` | `choirs/{chorale}` : `{ name, teacher }` |

- `{chorale}` est un identifiant court choisi à la création (`1`, `2`, `3`…).
- Un même téléphone peut être membre de plusieurs chorales (une clé par chorale dans `members`). L'app propose alors de passer de l'une à l'autre dans l'en-tête. S'il n'y en a qu'une, rien ne change à l'écran.
- L'empreinte SHA-256 ne dédoublonne plus qu'**à l'intérieur** d'une chorale : le même audio déposé dans deux chorales existe deux fois. C'est voulu : pas de fuite d'une chorale à l'autre.

### Pourquoi des sous-collections plutôt qu'un champ `choir` sur chaque document

- Le cloisonnement est dans le chemin : une règle oubliée ne peut pas ouvrir les données d'une autre chorale par une requête mal filtrée.
- Les requêtes de l'app ne changent pas (seul le chemin est préfixé).
- Avec un champ `choir`, l'identifiant des audios devrait devenir `{chorale}_{sha256}` : autant de changements, pour une isolation plus fragile.

## 2. Le lien et l'entrée dans la chorale

- Lien d'une nouvelle chorale : `https://onchantequoi.web.app/?cle=<clé>&c=<chorale>`.
- Lien actuel sans `c` : l'app considère `c=1`. Les liens déjà postés dans WhatsApp restent bons.
- Rejoindre : l'app écrit `members/{uid}.keys.{chorale} = clé`. La règle vérifie que `keys/{clé}.choir == chorale`.
- Les fiches `members` actuelles (`{ key, at }`) sont lues comme `{ keys: { 1: key } }` par les règles : aucune migration des téléphones.

## 3. Règles (Firestore et Storage)

```
function memberOf(c) {
  let m = get(/databases/$(database)/documents/members/$(request.auth.uid)).data;
  let k = m.get('keys', {}).get(c, c == '1' ? m.get('key', '') : '');
  return request.auth != null && k != ''
    && get(/databases/$(database)/documents/keys/$(k)).data.choir == c;
}
match /choirs/{c} {
  allow get: if memberOf(c);
  match /songs/{id} { ... mêmes règles qu'aujourd'hui, isMember() devient memberOf(c) ... }
  match /files/{hash} { ... idem, inSong() cherche dans choirs/{c}/songs ... }
}
```

- Supprimer une clé coupe toujours l'accès immédiatement (même principe qu'aujourd'hui).
- La clé de la chorale actuelle reçoit `choir: '1'` (à la main dans la console, ou par le script de migration).
- Storage : `match /audio/{c}/{hash}` avec le même `memberOf(c)` lu par `firestore.get`.
- Tests : reprendre les 36 tests de règles pour une chorale, puis ajouter « membre de A, refusé sur B » pour chaque opération, et « ancienne fiche members encore acceptée sur 1 ».

## 4. Code de l'app

- `Backend` : un identifiant de chorale à la création ; tous les chemins sont préfixés. Même chose dans `demo-backend.ts`, qui peut proposer deux chorales fictives pour montrer le changement.
- `ChoraleStore` : la chorale active (retenue dans le téléphone), la liste des chorales du téléphone, le nom et le chef lus dans `choirs/{chorale}` au lieu de `config.ts`.
- Sélection en boucle et paroles : la sélection est retenue **par chorale** (`chorale-boucle-{chorale}`). Les paroles sont déjà rangées dans le morceau, rien à faire.
- En-tête : le nom de la chorale active ; un menu pour passer à une autre si le téléphone en a plusieurs.
- Fonction `depot` (raccourci iPhone) : elle lit `keys/{clé}.choir` et range l'audio dans la bonne chorale. Le lien du raccourci ne change pas.
- Partage Android : inchangé (les audios partagés vont dans la chorale active).
- `manifest.webmanifest` garde le nom générique « On chante quoi ? ».

## 5. Migration des données actuelles

1. **Règles de transition** : déployer des règles qui acceptent à la fois les anciens chemins (`songs`, `files`, `audio/{sha256}`) et les nouveaux. Les téléphones qui ont encore l'ancienne version de l'app continuent de marcher.
2. **Script de copie** (Node + Admin SDK, dans `scripts/`), **essayé d'abord sur les émulateurs** avec une copie des données :
   - `songs/*` → `choirs/1/songs/*`, `files/*` → `choirs/1/files/*` (mêmes identifiants, donc relançable sans doublon) ;
   - `audio/{sha256}` → `audio/1/{sha256}` (copie dans le même bucket) ;
   - `choirs/1` = `{ name: 'On chante quoi ?', teacher: 'Seb' }`, et `choir: '1'` sur la clé actuelle ;
   - à la fin, il compte les documents et les fichiers des deux côtés et affiche les écarts.
3. **Déployer la nouvelle app** : le bandeau « nouvelle version » s'affiche sur les téléphones.
4. **Après une ou deux semaines** sans dépôt sur les anciens chemins : retirer les anciens chemins des règles et supprimer les anciennes données (script séparé, avec confirmation).

Le script écrit en production : c'est toi qui le lances, après l'essai sur les émulateurs. Aucun test automatique n'écrit en production.

## 6. Effort

| Lot | Durée |
|---|---|
| Règles Firestore et Storage + tests (dont isolation entre chorales) | 0,5 j |
| Backends Firebase et démo, store, sélection par chorale | 0,5 j |
| Fonction `depot` + ses tests | 0,3 j |
| En-tête, changement de chorale, écran d'accueil | 0,3 j |
| Script de migration + essai sur émulateurs | 0,5 j |
| LISEZMOI (créer une chorale, migration) | 0,2 j |
| **Total** | **≈ 2,3 j** |

Ajouter une chorale ensuite : créer `choirs/{chorale}` et une clé avec `choir`, dans la console, puis poster le lien. Cinq minutes.

## 7. Décisions (Hubert, 10 novembre 2026)

- Chorales numérotées `1`, `2`, `3`… La chorale actuelle devient `1`, et le nom affiché reste celui du document `choirs/{chorale}`.
- Plusieurs chorales sur le même téléphone : **oui** (menu de changement dans l'en-tête).
- Chef de chœur : `Seb` par défaut dans `choirs/{chorale}.teacher`, à changer dans la console pour une chorale qui a un autre chef.
