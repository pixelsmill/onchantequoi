// Règles Firestore : non-membres refusés, clés illisibles, clé supprimée = accès coupé,
// et toutes les opérations du client web autorisées pour un membre.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { asAdmin, addKey, KEY, NEW_KEY, phone, randomHash, read, removeKey, seed, setup } from './helpers.js';
import { client } from './client.js';

let env;
before(async () => { env = await setup(); });
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, { members: { alice: KEY, bob: KEY } });
});

// Un contexte (une app Firebase) par téléphone, réutilisé d'un test à l'autre
const phones = new Map();
const db = (uid) => {
  if (!phones.has(uid)) phones.set(uid, phone(env, uid).firestore());
  return phones.get(uid);
};
const app = (uid) => client(db(uid));
const alice = () => app('alice');

// Un audio dans « À classer », déposé par alice
async function inboxFile() {
  const h = randomHash();
  await alice().addToInbox(h);
  return h;
}
// Un morceau avec une voix, créé par alice
async function songWith(voice = 'S', title = 'Ave Verum Corpus') {
  const hash = await inboxFile();
  const r = await alice().classify({ hash, voice, newTitle: title });
  assert.equal(r.ok, true);
  return { songId: r.songId, hash };
}

describe('Non-membre', () => {
  test('sans connexion : tout est refusé', async () => {
    const { songId, hash } = await songWith();
    const anon = client(env.unauthenticatedContext().firestore());
    await assertFails(anon.songs());
    await assertFails(anon.inbox());
    await assertFails(anon.exists(hash));
    await assertFails(anon.addToInbox(randomHash()));
    await assertFails(anon.renameSong(songId, 'Pirate'));
    await assertFails(anon.join('x', KEY));
  });

  test('connecté anonymement sans avoir rejoint : lecture et écriture refusées', async () => {
    const { songId, hash } = await songWith();
    const h = await inboxFile();
    const eve = app('eve');
    await assertFails(eve.songs());
    await assertFails(eve.onSongs());
    await assertFails(eve.inbox());
    await assertFails(eve.onInbox());
    await assertFails(eve.exists(hash));
    await assertFails(getDoc(doc(db('eve'), 'songs', songId)));
    await assertFails(eve.addToInbox(randomHash()));
    await assertFails(eve.classify({ hash: h, voice: 'A', songId }));
    await assertFails(eve.unclassify(songId, 'S'));
    await assertFails(eve.renameSong(songId, 'Pirate'));
    await assertFails(eve.deleteSong(songId));
    await assertFails(eve.removeInbox(h));
    await assertFails(setDoc(doc(db('eve'), 'songs', 'nouveau'), { title: 'Pirate', voices: {}, createdAt: 1, updatedAt: 1 }));
  });

  test('une fiche members écrite à la main avec une clé inexistante ne donne aucun accès', async () => {
    await seed(env, { keys: [], members: { mallory: 'cle-inexistante-0000' } });
    await assertFails(app('mallory').songs());
    await assertFails(app('mallory').inbox());
  });
});

describe('Rejoindre avec le lien', () => {
  test('clé valide : fiche créée, puis lecture test des morceaux', async () => {
    const zoe = app('zoe');
    await assertSucceeds(zoe.join('zoe', KEY));
    const snap = await assertSucceeds(zoe.myMember('zoe'));
    assert.equal(snap.data().key, KEY);
    assert.ok(snap.data().at instanceof Timestamp);
    await assertSucceeds(zoe.songs());
    await assertSucceeds(zoe.join('zoe', KEY)); // rejoindre à nouveau (réouverture du lien)
  });

  test('lire sa propre fiche avant de rejoindre : autorisé (document absent)', async () => {
    const snap = await assertSucceeds(app('zoe').myMember('zoe'));
    assert.equal(snap.exists(), false);
  });

  test('clé inconnue : refusé', async () => {
    await assertFails(app('zoe').join('zoe', 'cle-inconnue-123456'));
    await assertFails(app('zoe').songs());
  });

  test('clé trop courte ou avec des caractères interdits : refusé, même si le document existe', async () => {
    await seed(env, { keys: ['court', 'avec.point-1234'] });
    await assertFails(app('zoe').join('zoe', 'court'));
    await assertFails(app('zoe').join('zoe', 'avec.point-1234'));
    await assertFails(app('zoe').join('zoe', `${KEY}/../x`));
  });

  test('fiche : exactement { key, at: serverTimestamp() }', async () => {
    const ref = doc(db('zoe'), 'members', 'zoe');
    await assertFails(setDoc(ref, { key: KEY }));
    await assertFails(setDoc(ref, { key: KEY, at: Date.now() }));
    await assertFails(setDoc(ref, { key: KEY, at: serverTimestamp(), admin: true }));
    await assertFails(setDoc(ref, { key: 12345678901, at: serverTimestamp() }));
    await assertSucceeds(setDoc(ref, { key: KEY, at: serverTimestamp() }));
    await assertFails(updateDoc(ref, { admin: true }));
  });

  test('impossible d\'écrire ou de lire la fiche d\'un autre', async () => {
    await assertFails(setDoc(doc(db('zoe'), 'members', 'bob'), { key: KEY, at: serverTimestamp() }));
    await assertFails(setDoc(doc(db('alice'), 'members', 'zoe'), { key: KEY, at: serverTimestamp() }));
    await assertFails(getDoc(doc(db('alice'), 'members', 'bob')));
  });

  test('impossible de lister les fiches ou de supprimer la sienne', async () => {
    await assertFails(getDocs(collection(db('alice'), 'members')));
    await assertFails(deleteDoc(doc(db('alice'), 'members', 'alice')));
  });
});

describe('Clés (collection keys)', () => {
  test('illisibles et non modifiables, même pour un membre', async () => {
    const a = db('alice');
    await assertSucceeds(alice().songs()); // alice est bien membre
    await assertFails(getDoc(doc(a, 'keys', KEY)));
    await assertFails(getDoc(doc(a, 'keys', 'autre-cle-0123456789')));
    await assertFails(getDocs(collection(a, 'keys')));
    await assertFails(setDoc(doc(a, 'keys', 'ma-propre-cle-0123'), { note: 'x' }));
    await assertFails(updateDoc(doc(a, 'keys', KEY), { note: 'x' }));
    await assertFails(deleteDoc(doc(a, 'keys', KEY)));
    await assertFails(getDoc(doc(db('eve'), 'keys', KEY)));
  });
});

describe('Clé supprimée', () => {
  test('accès coupé immédiatement pour tous ceux qui l\'ont utilisée, rétabli avec le nouveau lien', async () => {
    const { songId, hash } = await songWith();
    const h = await inboxFile();
    await assertSucceeds(alice().songs());
    await assertSucceeds(app('bob').inbox());

    await removeKey(env, KEY);

    for (const uid of ['alice', 'bob']) {
      const a = app(uid);
      await assertFails(a.songs());
      await assertFails(a.onSongs());
      await assertFails(a.inbox());
      await assertFails(a.exists(hash));
      await assertFails(a.addToInbox(randomHash()));
      await assertFails(a.classify({ hash: h, voice: 'A', songId }));
      await assertFails(a.unclassify(songId, 'S'));
      await assertFails(a.renameSong(songId, 'Pirate'));
      await assertFails(a.deleteSong(songId));
      await assertFails(a.removeInbox(h));
    }
    await assertFails(alice().join('alice', KEY)); // l'ancien lien ne permet plus de rejoindre

    await addKey(env, NEW_KEY); // nouveau lien posté dans le groupe
    await assertSucceeds(alice().join('alice', NEW_KEY));
    await assertSucceeds(alice().songs());
    await assertFails(app('bob').songs()); // bob n'a pas encore ouvert le nouveau lien
  });
});

describe('Membre : opérations de l\'app', () => {
  test('lit les morceaux (getDocs, onSnapshot) et la liste « À classer »', async () => {
    const { hash } = await songWith();
    const h = await inboxFile();
    const a = alice();
    assert.equal((await assertSucceeds(a.songs())).size, 1);
    assert.equal((await assertSucceeds(a.onSongs())).size, 1);
    const inbox = await assertSucceeds(a.inbox());
    assert.deepEqual(inbox.docs.map((d) => d.id), [h]);
    assert.equal((await assertSucceeds(a.onInbox())).size, 1);
    assert.equal(await a.exists(hash), true);
    assert.equal(await a.exists(randomHash()), false);
  });

  test('dépôt : la transaction crée files/{sha256} dans « À classer »', async () => {
    const h = randomHash();
    await assertSucceeds(alice().addToInbox(h, { name: 'AUD-20260925-WA0001.m4a', size: 52341, type: 'audio/mp4' }));
    const f = await read(env, `files/${h}`);
    assert.equal(f.status, 'inbox');
    assert.equal(f.name, 'AUD-20260925-WA0001.m4a');
    assert.equal(f.size, 52341);
    assert.equal(f.type, 'audio/mp4');
    assert.ok(f.createdAt instanceof Timestamp);
    await assertSucceeds(app('bob').addToInbox(h)); // déjà là : la transaction n'écrit rien
    assert.equal((await read(env, `files/${h}`)).name, 'AUD-20260925-WA0001.m4a');
    await assertSucceeds(alice().addToInbox(randomHash(), { name: '', type: 'video/mp4' })); // nom vide accepté
  });

  test('dépôt : refusé si le document n\'a pas le bon format', async () => {
    const a = db('alice');
    const ok = { status: 'inbox', name: 'a.m4a', size: 10, type: 'audio/mp4', createdAt: serverTimestamp() };
    const h = randomHash();
    await assertFails(alice().addToInbox('abc'));
    await assertFails(alice().addToInbox(h.toUpperCase()));
    await assertFails(alice().addToInbox(h.slice(1)));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, status: 'classified', song: 'x', voice: 'S' }));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, status: 'pirate' }));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, createdAt: Date.now() }));
    const { createdAt, ...sansDate } = ok;
    await assertFails(setDoc(doc(a, 'files', h), sansDate));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, extra: true }));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, name: 'x'.repeat(501) }));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, size: '10' }));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, size: -1 }));
    await assertFails(setDoc(doc(a, 'files', h), { ...ok, type: 'a'.repeat(201) }));
    await assertSucceeds(setDoc(doc(a, 'files', h), { ...ok, source: 'web' }));
  });

  test('classement dans un nouveau morceau', async () => {
    const hash = await inboxFile();
    const r = await alice().classify({ hash, voice: 'S', newTitle: '  Le Lion est mort ce soir  ' });
    assert.equal(r.ok, true);
    const song = await read(env, `songs/${r.songId}`);
    assert.equal(song.title, 'Le Lion est mort ce soir');
    assert.deepEqual(Object.keys(song.voices), ['S']);
    assert.equal(song.voices.S.hash, hash);
    assert.equal(typeof song.voices.S.at, 'number');
    assert.equal(typeof song.createdAt, 'number');
    assert.equal(typeof song.updatedAt, 'number');
    const f = await read(env, `files/${hash}`);
    assert.equal(f.status, 'classified');
    assert.equal(f.song, r.songId);
    assert.equal(f.voice, 'S');
    assert.equal(f.name, 'WhatsApp Audio 2026-09-23 at 22.34.43.mp4');
  });

  test('classement dans un morceau existant : remplace l\'ancienne voix et supprime son document', async () => {
    const { songId, hash: h1 } = await songWith('A', 'Hallelujah');
    const h2 = await inboxFile();
    const r = await app('bob').classify({ hash: h2, voice: 'A', songId });
    assert.equal(r.ok, true);
    assert.equal(r.oldHash, h1);
    assert.equal(await read(env, `files/${h1}`), null);
    assert.equal((await read(env, `songs/${songId}`)).voices.A.hash, h2);

    const h3 = await inboxFile();
    assert.equal((await alice().classify({ hash: h3, voice: 'T', songId })).ok, true);
    const song = await read(env, `songs/${songId}`);
    assert.deepEqual(Object.keys(song.voices).sort(), ['A', 'T']);
    assert.equal(song.title, 'Hallelujah');
  });

  test('le premier qui classe gagne', async () => {
    const hash = await inboxFile();
    const r1 = await alice().classify({ hash, voice: 'H', newTitle: 'Premier' });
    assert.equal(r1.ok, true);
    assert.deepEqual(await app('bob').classify({ hash, voice: 'S', newTitle: 'Second' }), { ok: false, reason: 'already' });
    // Les règles l'imposent aussi : un fichier déjà classé ne peut pas être reclassé directement,
    // même avec un morceau qui le contient
    const b = db('bob');
    const batch = writeBatch(b);
    batch.set(doc(b, 'songs', 'second'), { title: 'Second', voices: { S: { hash, at: 1 } }, createdAt: 1, updatedAt: 1 });
    batch.update(doc(b, 'files', hash), { status: 'classified', song: 'second', voice: 'S' });
    await assertFails(batch.commit());
  });

  test('classement : refusé si les données sont invalides', async () => {
    const hash = await inboxFile();
    const a = alice();
    await assertFails(a.classify({ hash, voice: 'X', newTitle: 'Voix inconnue' }));
    await assertFails(a.classify({ hash, voice: 'S', newTitle: '   ' }));
    await assertFails(a.classify({ hash, voice: 'S', newTitle: 'x'.repeat(121) }));
    assert.equal((await read(env, `files/${hash}`)).status, 'inbox'); // rien n'a été écrit
    assert.equal((await a.classify({ hash, voice: 'S', newTitle: 'é'.repeat(120) })).ok, true);

    // fichier marqué « classé » sans être dans le morceau (il disparaîtrait des deux listes)
    const { songId } = await songWith('S', 'Morceau');
    const h = await inboxFile();
    const f = doc(db('alice'), 'files', h);
    await assertFails(updateDoc(f, { status: 'classified', song: songId, voice: 'S' }));
    await assertFails(updateDoc(f, { status: 'classified', song: 'inexistant', voice: 'S' }));
    await assertFails(updateDoc(f, { status: 'classified' }));

    // format des morceaux
    const s = doc(db('alice'), 'songs', 'test');
    const ok = { title: 'Titre', voices: { S: { hash: h, at: 1 } }, createdAt: 1, updatedAt: 1 };
    await assertFails(setDoc(s, { ...ok, pirate: true }));
    await assertFails(setDoc(s, { ...ok, voices: { S: { hash: 'demo1', at: 1 } } }));
    await assertFails(setDoc(s, { ...ok, voices: { S: { hash: h, at: 1, by: 'alice' } } }));
    await assertFails(setDoc(s, { ...ok, voices: { S: { hash: h } } }));
    await assertFails(setDoc(s, { ...ok, voices: { Basse: { hash: h, at: 1 } } }));
    await assertFails(setDoc(s, { ...ok, voices: 'S' }));
    await assertFails(setDoc(s, { ...ok, createdAt: '2026-09-25' }));
    await assertFails(setDoc(s, { ...ok, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(s, { ...ok, title: 42 }));
    await assertSucceeds(setDoc(s, ok));
  });

  test('« Mal classé ? » : l\'audio retourne dans « À classer »', async () => {
    const { songId, hash } = await songWith('S', 'Hallelujah');
    const h2 = await inboxFile();
    await alice().classify({ hash: h2, voice: 'T', songId });
    await assertSucceeds(app('bob').unclassify(songId, 'S'));
    const song = await read(env, `songs/${songId}`);
    assert.deepEqual(Object.keys(song.voices), ['T']);
    const f = await read(env, `files/${hash}`);
    assert.equal(f.status, 'inbox');
    assert.ok(f.createdAt instanceof Timestamp);
    const inbox = await alice().inbox();
    assert.deepEqual(inbox.docs.map((d) => d.id), [hash]);
    // et il peut être reclassé
    assert.equal((await alice().classify({ hash, voice: 'A', songId })).ok, true);
  });

  test('« Mal classé ? » fonctionne même si le document du fichier a disparu', async () => {
    const { songId, hash } = await songWith('H', 'Orphelin');
    await asAdmin(env, (d) => deleteDoc(doc(d, 'files', hash)));
    await assertSucceeds(alice().unclassify(songId, 'H'));
    const f = await read(env, `files/${hash}`);
    assert.equal(f.status, 'inbox');
    assert.deepEqual((await read(env, `songs/${songId}`)).voices, {});
  });

  test('supprimer un audio de « À classer »', async () => {
    const h = await inboxFile();
    await assertSucceeds(app('bob').removeInbox(h));
    assert.equal(await read(env, `files/${h}`), null);
  });

  test('renommer un morceau : 1 à 120 caractères', async () => {
    const { songId } = await songWith();
    const a = alice();
    await assertSucceeds(a.renameSong(songId, '  Nouveau titre '));
    assert.equal((await read(env, `songs/${songId}`)).title, 'Nouveau titre');
    await assertFails(a.renameSong(songId, '   '));
    await assertFails(a.renameSong(songId, 'x'.repeat(121)));
    await assertSucceeds(a.renameSong(songId, 'x'.repeat(120)));
    await assertFails(updateDoc(doc(db('alice'), 'songs', songId), { title: 'Titre', pirate: true }));
  });

  test('supprimer un morceau', async () => {
    const { songId } = await songWith();
    await assertSucceeds(app('bob').deleteSong(songId));
    assert.equal(await read(env, `songs/${songId}`), null);
  });

  test('fichier : seuls statut, morceau, voix et date (du serveur) peuvent changer', async () => {
    const h = await inboxFile();
    const f = doc(db('alice'), 'files', h);
    await assertFails(updateDoc(f, { name: 'renommé.m4a' }));
    await assertFails(updateDoc(f, { size: 1 }));
    await assertFails(updateDoc(f, { type: 'audio/ogg' }));
    await assertFails(updateDoc(f, { source: 'pirate' }));
    await assertFails(updateDoc(f, { status: 'pirate' }));
    await assertFails(updateDoc(f, { createdAt: Date.now() }));
    await assertFails(updateDoc(f, { voice: 'Z' }));
    await assertFails(updateDoc(f, { extra: 1 }));
    await assertSucceeds(updateDoc(f, { createdAt: serverTimestamp() }));
  });
});
