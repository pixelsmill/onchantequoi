// Essai de la migration sur les émulateurs (npm run test:migration) : jamais en production.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { check, migrate } from './migrer-multi-chorales.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('Émulateurs absents : lancez « npm run test:migration ».');
}
const app = initializeApp({ projectId: 'demo-chorale', storageBucket: 'demo-chorale.appspot.com' }, 'migration');
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const sha = () => createHash('sha256').update(randomBytes(16)).digest('hex');
const quiet = () => undefined;

const h1 = sha();
const h2 = sha();

before(async () => {
  // Données comme en production avant la migration
  await db.doc('keys/cle-actuelle-0123456').set({ note: 'lien de septembre' });
  await db.doc('keys/cle-chorale-deux-0123').set({ note: 'jeudi', choir: '2' });
  await db.doc('songs/s1').set({
    title: 'Ave Verum Corpus',
    voices: { S: { hash: h1, at: 1 } },
    lyrics: 'Ave verum',
    createdAt: 1,
    updatedAt: 2,
  });
  await db.doc(`files/${h1}`).set({ status: 'classified', song: 's1', voice: 'S', createdAt: Timestamp.now() });
  await db.doc(`files/${h2}`).set({ status: 'inbox', name: 'a.mp4', createdAt: Timestamp.now() });
  for (const h of [h1, h2]) {
    await bucket.file(`audio/${h}`).save(Buffer.from('audio ' + h), {
      contentType: 'audio/mp4',
      metadata: { metadata: { firebaseStorageDownloadTokens: `jeton-${h}` } },
    });
  }
});
after(() => deleteApp(app));

test('copie tout dans la chorale 1, sans rien supprimer', async () => {
  const n = await migrate({ db, bucket, log: quiet });
  assert.deepEqual(n, { songs: 1, files: 2, audio: 2, keys: 1, choir: 1, skipped: 0 });
  assert.deepEqual((await db.doc('choirs/1').get()).data(), { name: 'On chante quoi ?', teacher: 'Seb' });
  assert.equal((await db.doc('keys/cle-actuelle-0123456').get()).get('choir'), '1');
  assert.equal((await db.doc('keys/cle-chorale-deux-0123').get()).get('choir'), '2'); // inchangée
  const song = (await db.doc('choirs/1/songs/s1').get()).data();
  assert.equal(song.lyrics, 'Ave verum');
  assert.equal(song.voices.S.hash, h1);
  assert.equal((await db.doc(`choirs/1/files/${h2}`).get()).get('status'), 'inbox');
  const [meta] = await bucket.file(`audio/1/${h1}`).getMetadata();
  assert.equal(meta.contentType, 'audio/mp4');
  assert.equal(meta.metadata.firebaseStorageDownloadTokens, `jeton-${h1}`); // mêmes liens de lecture
  // Les anciens emplacements sont toujours là
  assert.equal((await db.doc('songs/s1').get()).exists, true);
  assert.equal((await bucket.file(`audio/${h1}`).exists())[0], true);
  assert.deepEqual(await check({ db, bucket, log: quiet }), []);
});

test('relançable : rien n’est écrasé (un morceau classé entre-temps dans la chorale 1 est gardé)', async () => {
  await db.doc('choirs/1/songs/s1').update({ title: 'Ave Verum (modifié après migration)' });
  await db.doc('choirs/1').update({ name: 'Chorale renommée' });
  const h3 = sha();
  await db.doc(`files/${h3}`).set({ status: 'inbox', createdAt: Timestamp.now() }); // déposé par une ancienne version
  await bucket.file(`audio/${h3}`).save(Buffer.from('nouveau'), { contentType: 'audio/ogg' });

  const n = await migrate({ db, bucket, log: quiet });
  assert.deepEqual(n, { songs: 0, files: 1, audio: 1, keys: 0, choir: 0, skipped: 5 });
  assert.equal((await db.doc('choirs/1/songs/s1').get()).get('title'), 'Ave Verum (modifié après migration)');
  assert.equal((await db.doc('choirs/1').get()).get('name'), 'Chorale renommée');
  assert.equal((await db.doc(`choirs/1/files/${h3}`).get()).exists, true);
  assert.deepEqual(await check({ db, bucket, log: quiet }), []);
});
