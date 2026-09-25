// Test de bout en bout de la fonction depot, dans les émulateurs (functions, firestore, storage).
// Depuis functions/ : npm run test:e2e (démarre les émulateurs, lance ce fichier, puis les arrête).
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { MAX } = require('../lib');

const PROJECT = 'demo-chorale';
const BUCKET = `${PROJECT}.appspot.com`; // bucket par défaut des émulateurs pour un projet demo-
const DEPOT = process.env.DEPOT_URL || `http://127.0.0.1:5001/${PROJECT}/europe-west1/depot`;
const CLE = 'cle-e2e-0123456789';
const MEMBRE = 'telephone-e2e';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('Émulateurs absents : lancez « npm run test:e2e », qui les démarre.');
}
const STORAGE = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
const app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const m4a = (n = 200) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), crypto.randomBytes(n)]);
const ogg = () => Buffer.concat([Buffer.from('OggS'), crypto.randomBytes(100)]);
const latin1 = (s) => Buffer.from(s, 'utf8').toString('latin1'); // octets UTF-8 bruts dans un en-tête

function depot(body, { cle = CLE, headers = {}, method = 'POST' } = {}) {
  const url = new URL(DEPOT);
  if (cle) url.searchParams.set('cle', cle);
  return fetch(url, { method, headers, body });
}
async function send(body, opts) {
  const res = await depot(body, opts);
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
}
const fileDoc = async (h) => (await db.doc(`files/${h}`).get()).data();
const stored = async (h) => (await bucket.file(`audio/${h}`).exists())[0];

// Jeton d'un téléphone connecté (non signé : accepté par les émulateurs, comme dans rules-unit-testing)
function phoneToken(uid) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', type: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, iat: 0, exp: 3600, auth_time: 0,
    sub: uid, user_id: uid, firebase: { sign_in_provider: 'anonymous', identities: {} },
  })}.`;
}

before(async () => {
  await db.doc(`keys/${CLE}`).set({ note: 'e2e' }); // clé créée « dans la console »
  await db.doc(`members/${MEMBRE}`).set({ key: CLE, at: Timestamp.now() });
  // la fonction peut mettre quelques secondes à être chargée
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(DEPOT)).status === 405) return; } catch { /* pas encore prête */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Fonction injoignable : ${DEPOT}`);
});
after(() => deleteApp(app));

test('GET → 405', async () => {
  const r = await send(undefined, { method: 'GET' });
  assert.equal(r.status, 405);
  assert.equal(r.text, 'Utilisez POST');
});

test('clé absente, mal formée ou inconnue → 403', async () => {
  for (const cle of [null, 'court', '../keys/x-0123456789', 'cle-inconnue-0123456789']) {
    const r = await send(m4a(), { cle });
    assert.equal(r.status, 403, String(cle));
    assert.equal(r.text, 'Lien de la chorale invalide');
  }
});

test('dépôt brut (raccourci iPhone) → 200 ; files/{sha256} dans « À classer » ; audio/{sha256} dans Storage', async () => {
  const data = m4a();
  const h = sha256(data);
  const r = await send(data, { headers: { 'Content-Type': 'video/mp4', 'X-Nom': encodeURIComponent('WhatsApp Audio 2026-09-23 at 22.34.43.mp4') } });
  assert.equal(r.status, 200);
  assert.equal(r.type, 'text/plain; charset=utf-8');
  assert.equal(r.text, '1 audio envoyé dans « À classer »');

  const { createdAt, ...f } = await fileDoc(h);
  assert.deepEqual(f, { status: 'inbox', name: 'WhatsApp Audio 2026-09-23 at 22.34.43.mp4', size: data.length, type: 'audio/mp4', source: 'depot' });
  assert.ok(createdAt instanceof Timestamp);

  const file = bucket.file(`audio/${h}`);
  const [md] = await file.getMetadata();
  assert.equal(md.contentType, 'audio/mp4');
  assert.equal(Number(md.size), data.length);
  assert.ok((await file.download())[0].equals(data));
});

test('dépôt sans en-tête Content-Type → 200 (corps lu quand même)', async () => {
  const data = m4a();
  const r = await send(data, { headers: { 'X-Nom': 'sans-type.m4a' } });
  assert.equal(r.status, 200);
  assert.equal(r.text, '1 audio envoyé dans « À classer »');
  const f = await fileDoc(sha256(data));
  assert.equal(f.size, data.length);
  assert.equal(f.type, 'audio/mp4');
  assert.equal(f.name, 'sans-type.m4a');
});

test('même fichier une deuxième fois → 200 « déjà reçu », rien de réécrit', async () => {
  const data = m4a();
  const h = sha256(data);
  assert.equal((await send(data, { headers: { 'Content-Type': 'audio/mp4' } })).status, 200);
  const avant = await fileDoc(h);
  const r = await send(data, { headers: { 'X-Nom': 'autre-nom.m4a' } });
  assert.equal(r.status, 200);
  assert.equal(r.text, '1 déjà reçu');
  assert.deepEqual(await fileDoc(h), avant);
});

test('le client web peut lire l\'audio déposé (règles Storage + lien avec jeton, comme getDownloadURL)', async () => {
  const data = m4a();
  const h = sha256(data);
  await send(data);
  const meta = `${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(`audio/${h}`)}`;
  const refus = await fetch(meta, { headers: { Authorization: `Firebase ${phoneToken('inconnu')}` } });
  assert.equal(refus.status, 403); // téléphone qui n'a pas rejoint
  const res = await fetch(meta, { headers: { Authorization: `Firebase ${phoneToken(MEMBRE)}` } });
  assert.equal(res.status, 200);
  const { downloadTokens } = await res.json();
  assert.ok(downloadTokens, 'jeton de téléchargement présent');
  const audio = await fetch(`${meta}?alt=media&token=${downloadTokens.split(',')[0]}`);
  assert.equal(audio.status, 200);
  assert.ok(Buffer.from(await audio.arrayBuffer()).equals(data));
});

test('clé dans l\'en-tête X-Cle ; nom brut en UTF-8 (tel qu\'envoyé par iOS) ou mal encodé', async () => {
  const a = m4a();
  const r = await send(a, { cle: null, headers: { 'X-Cle': CLE, 'X-Nom': latin1('Audio WhatsApp 2026-09-23 à 22.34.43') } });
  assert.equal(r.status, 200);
  assert.equal((await fileDoc(sha256(a))).name, 'Audio WhatsApp 2026-09-23 à 22.34.43');

  const b = m4a();
  const r2 = await send(b, { headers: { 'X-Nom': 'Nom %E0%A4%A 100%.m4a' } });
  assert.equal(r2.status, 200);
  assert.equal((await fileDoc(sha256(b))).name, 'Nom %E0%A4%A 100%.m4a');
});

test('pas un audio (%PDF) → 415, rien d\'enregistré', async () => {
  const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(100));
  const r = await send(pdf, { headers: { 'Content-Type': 'application/pdf', 'X-Nom': 'partition.pdf' } });
  assert.equal(r.status, 415);
  assert.equal(r.text, '1 refusé (pas un audio ou trop gros)');
  assert.equal(await fileDoc(sha256(pdf)), undefined);
  assert.equal(await stored(sha256(pdf)), false);
});

test('multipart avec 2 fichiers → 2 créés', async () => {
  const a = m4a();
  const b = ogg();
  const form = new FormData();
  form.append('audio', new Blob([a], { type: 'video/mp4' }), 'WhatsApp Audio 1.mp4');
  form.append('audio', new Blob([b], { type: 'audio/ogg' }), 'Répétition « Tous ».opus');
  const r = await send(form);
  assert.equal(r.status, 200);
  assert.equal(r.text, '2 audios envoyés dans « À classer »');
  const fa = await fileDoc(sha256(a));
  const fb = await fileDoc(sha256(b));
  assert.equal(fa.name, 'WhatsApp Audio 1.mp4');
  assert.equal(fa.type, 'audio/mp4');
  assert.equal(fb.name, 'Répétition « Tous ».opus');
  assert.equal(fb.type, 'audio/ogg');
  assert.equal(fb.status, 'inbox');
  assert.ok(await stored(sha256(a)));
  assert.ok(await stored(sha256(b)));
});

test('multipart : un nouveau, un doublon, un refusé → 200 avec les trois comptes', async () => {
  const dejaLa = m4a();
  await send(dejaLa);
  const form = new FormData();
  form.append('audio', new Blob([m4a()]), 'nouveau.m4a');
  form.append('audio', new Blob([dejaLa]), 'doublon.m4a');
  form.append('audio', new Blob(['pas un audio du tout']), 'note.txt');
  const r = await send(form);
  assert.equal(r.status, 200);
  assert.equal(r.text, '1 audio envoyé dans « À classer » · 1 déjà reçu · 1 refusé (pas un audio ou trop gros)');
});

test('corps vide → 400 ; multipart illisible → 400', async () => {
  const vide = await send(Buffer.alloc(0));
  assert.equal(vide.status, 400);
  assert.equal(vide.text, 'Aucun fichier reçu');
  const casse = await send('--zz\r\nContent-Disposition: form-data; name="a"; filename="a.m4a"\r\n\r\nabc', {
    headers: { 'Content-Type': 'multipart/form-data; boundary=zz' },
  });
  assert.equal(casse.status, 400);
  assert.equal(casse.text, 'Envoi illisible');
  const sansFrontiere = await send('abc', { headers: { 'Content-Type': 'multipart/form-data' } });
  assert.equal(sansFrontiere.status, 400);
});

test('fichier de plus de 30 Mo → 415, rien d\'enregistré (avec ou sans Content-Type)', async () => {
  const gros = Buffer.concat([m4a(0), Buffer.alloc(MAX + 1 - 12)]);
  assert.equal(gros.length, MAX + 1);
  for (const headers of [{ 'Content-Type': 'audio/mp4' }, {}]) {
    const r = await send(gros, { headers });
    assert.equal(r.status, 415);
    assert.equal(r.text, '1 refusé (pas un audio ou trop gros)');
  }
  assert.equal(await stored(sha256(gros)), false);
  const juste = Buffer.concat([m4a(0), crypto.randomBytes(1024), Buffer.alloc(MAX - 12 - 1024)]);
  const r = await send(juste, { headers: { 'Content-Type': 'audio/mp4' } }); // 30 Mo tout juste : accepté
  assert.equal(r.status, 200);
  assert.equal((await fileDoc(sha256(juste))).size, MAX);
});
