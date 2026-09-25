// Règles Storage : audio/{sha256} réservé aux membres (clé encore valide), types audio, moins de 40 Mo.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, getDownloadURL, getMetadata, ref, uploadBytes } from 'firebase/storage';
import { addKey, KEY, NEW_KEY, phone, randomHash, removeKey, seed, setup } from './helpers.js';
import { client } from './client.js';

const MB = 1024 * 1024;
const audio = (n = 64) => new Uint8Array(n).fill(0x41);

let env;
before(async () => { env = await setup({ storage: true }); });
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, { members: { alice: KEY } });
});

// Un contexte (une app Firebase) par téléphone, réutilisé d'un test à l'autre
const phones = new Map();
const ctx = (uid) => {
  if (!phones.has(uid)) phones.set(uid, phone(env, uid));
  return phones.get(uid);
};
const st = (uid) => ctx(uid).storage();
const put = (uid, path, bytes = audio(), contentType = 'audio/mp4') => uploadBytes(ref(st(uid), path), bytes, { contentType });

// Un audio déjà présent (déposé sans les règles, comme par la fonction depot)
async function stored() {
  const h = randomHash();
  await env.withSecurityRulesDisabled((c) => uploadBytes(ref(c.storage(), `audio/${h}`), audio(), { contentType: 'audio/mp4' }));
  return h;
}

describe('Storage', () => {
  test('non-membre (connecté ou non) : envoi, lecture et suppression refusés', async () => {
    const h = await stored();
    for (const s of [env.unauthenticatedContext().storage(), st('eve')]) {
      await assertFails(uploadBytes(ref(s, `audio/${randomHash()}`), audio(), { contentType: 'audio/mp4' }));
      await assertFails(uploadBytes(ref(s, `audio/${h}`), audio(), { contentType: 'audio/mp4' }));
      await assertFails(getDownloadURL(ref(s, `audio/${h}`)));
      await assertFails(getMetadata(ref(s, `audio/${h}`)));
      await assertFails(deleteObject(ref(s, `audio/${h}`)));
    }
  });

  test('membre : dépôt complet (Storage puis Firestore), lien de lecture, suppression', async () => {
    const a = client(ctx('alice').firestore(), st('alice'));
    const h = randomHash();
    await assertSucceeds(a.upload(h, audio(1000), 'video/mp4', 'WhatsApp Audio.mp4'));
    const url = await assertSucceeds(a.url(h));
    assert.match(url, /token=/);
    const res = await fetch(url); // le lien de lecture fonctionne sans en-tête d'authentification
    assert.equal(res.status, 200);
    assert.equal((await res.arrayBuffer()).byteLength, 1000);
    await assertSucceeds(a.removeInbox(h));
    await assert.rejects(a.url(h), { code: 'storage/object-not-found' }); // autorisé, mais supprimé
  });

  test('membre : classer en remplaçant une voix supprime l\'ancien fichier du Storage', async () => {
    const a = client(ctx('alice').firestore(), st('alice'));
    const h1 = randomHash();
    const h2 = randomHash();
    await a.upload(h1, audio());
    await a.upload(h2, audio());
    const { songId } = await a.classify({ hash: h1, voice: 'S', newTitle: 'Ave Verum' });
    const r = await assertSucceeds(a.classify({ hash: h2, voice: 'S', songId }));
    assert.equal(r.oldHash, h1);
    await assert.rejects(a.url(h1), { code: 'storage/object-not-found' });
    await assertSucceeds(a.url(h2));
  });

  test('types de contenu acceptés', async () => {
    for (const type of ['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/aac', 'audio/ogg', 'audio/ogg; codecs=opus',
      'audio/wav', 'audio/webm', 'video/mp4', 'video/quicktime', 'application/ogg', 'application/octet-stream', 'Audio/MP4']) {
      await assertSucceeds(put('alice', `audio/${randomHash()}`, audio(), type));
    }
  });

  test('types de contenu refusés', async () => {
    for (const type of ['image/jpeg', 'image/heic', 'text/plain', 'text/html', 'application/pdf', 'application/json',
      'application/zip', 'audio', 'audio/', 'x-audio/mp4']) {
      await assertFails(put('alice', `audio/${randomHash()}`, audio(), type));
    }
  });

  test('nom : empreinte SHA-256 en hexadécimal minuscule ; tout autre chemin refusé', async () => {
    const h = randomHash();
    for (const path of ['audio/abc', `audio/${h.toUpperCase()}`, `audio/${h.slice(1)}`, `audio/${h}0`,
      `audio/${h}.m4a`, `audio/${h}/x`, `autre/${h}`, h, `members/${h}`]) {
      await assertFails(put('alice', path));
    }
    await assertFails(getDownloadURL(ref(st('alice'), `autre/${h}`)));
  });

  test('taille : vide refusé, moins de 40 Mo accepté, 40 Mo refusé', async () => {
    await assertFails(put('alice', `audio/${randomHash()}`, new Uint8Array(0)));
    await assertSucceeds(put('alice', `audio/${randomHash()}`, audio(40 * MB - 1)));
    await assertFails(put('alice', `audio/${randomHash()}`, audio(40 * MB)));
  });

  test('réenvoi du même fichier (écrasement) autorisé', async () => {
    const h = await stored();
    await assertSucceeds(put('alice', `audio/${h}`));
  });

  test('clé supprimée : accès coupé immédiatement, rétabli avec le nouveau lien', async () => {
    const h = await stored();
    await assertSucceeds(getDownloadURL(ref(st('alice'), `audio/${h}`)));
    await removeKey(env, KEY);
    await assertFails(put('alice', `audio/${randomHash()}`));
    await assertFails(getDownloadURL(ref(st('alice'), `audio/${h}`)));
    await assertFails(deleteObject(ref(st('alice'), `audio/${h}`)));

    await addKey(env, NEW_KEY);
    await client(ctx('alice').firestore()).join('alice', NEW_KEY);
    await assertSucceeds(getDownloadURL(ref(st('alice'), `audio/${h}`)));
    await assertSucceeds(put('alice', `audio/${randomHash()}`));
  });
});
