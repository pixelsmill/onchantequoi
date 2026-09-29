// Tests de la logique pure (sans Firebase) : npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { detectType, sha256, cleanName, decodeName, readFiles, audioDuration, MAX, KEY_FORMAT } = require('../lib');

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(20)]);
const latin1 = (s) => Buffer.from(s, 'utf8').toString('latin1'); // UTF-8 brut tel que Node lit un en-tête
const multipart = (b, parts) => Buffer.concat([
  ...parts.flatMap(([head, data]) => [Buffer.from(`--${b}\r\n${head}\r\n\r\n`), Buffer.from(data), Buffer.from('\r\n')]),
  Buffer.from(`--${b}--\r\n`),
]);
const part = (filename, type) => `Content-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: ${type}`;

test('detectType : formats audio reconnus par les premiers octets', () => {
  assert.equal(detectType(mp4, 'video/mp4'), 'audio/mp4');
  assert.equal(detectType(mp4), 'audio/mp4');
  assert.equal(detectType(Buffer.from('OggS\0\0\0\0')), 'audio/ogg');
  assert.equal(detectType(Buffer.from('ID3\x03\0\0')), 'audio/mpeg');
  assert.equal(detectType(Buffer.from([0xff, 0xfb, 0x90, 0x64])), 'audio/mpeg');
  assert.equal(detectType(Buffer.from([0xff, 0xf1, 0x50, 0x80])), 'audio/aac');
  assert.equal(detectType(Buffer.from('RIFF\0\0\0\0WAVE')), 'audio/wav');
  assert.equal(detectType(Buffer.from('fLaC\0\0\0\x22')), 'audio/flac');
  assert.equal(detectType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01])), 'audio/webm');
});

test('detectType : refuse ce qui n\'est pas un audio', () => {
  assert.equal(detectType(Buffer.from('%PDF-1.4 xxxxx')), null);
  assert.equal(detectType(Buffer.from('%PDF-1.4 xxxxx'), 'application/octet-stream'), null);
  assert.equal(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), null);
  // photo HEIC d'iPhone : même conteneur que le MP4
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);
  assert.equal(detectType(heic, 'image/heic'), null);
  assert.equal(detectType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypavif'), Buffer.alloc(8)])), null);
  // fichiers minuscules : pas d'erreur
  for (const n of [0, 1, 2, 3, 11]) assert.equal(detectType(Buffer.alloc(n, 0x41)), null);
});

test('detectType : format inconnu, on se fie au type envoyé s\'il est audio/vidéo', () => {
  const inconnu = Buffer.from('xxxxxxxxxxxxxxxx');
  assert.equal(detectType(inconnu, 'video/mp4'), 'audio/mp4');
  assert.equal(detectType(inconnu, 'audio/x-m4a; charset=binary'), 'audio/x-m4a');
  assert.equal(detectType(inconnu, 'audio/amr'), 'audio/amr');
  assert.equal(detectType(inconnu, 'text/plain'), null);
  assert.equal(detectType(inconnu), null);
});

test('sha256 : empreinte hexadécimale', () => {
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(sha256(mp4), /^[0-9a-f]{64}$/);
});

test('decodeName : ne lève jamais d\'erreur', () => {
  assert.equal(decodeName('WhatsApp%20Audio.mp4'), 'WhatsApp Audio.mp4');
  assert.equal(decodeName('Audio%20WhatsApp%20%C3%A0%2022.34.m4a'), 'Audio WhatsApp à 22.34.m4a');
  assert.equal(decodeName('100% chorale.m4a'), '100% chorale.m4a'); // % isolé : valeur brute
  assert.equal(decodeName('Nom %E0%A4%A.m4a'), 'Nom %E0%A4%A.m4a'); // séquence invalide : valeur brute
  assert.equal(decodeName('%C3%28'), '%C3%28'); // UTF-8 invalide une fois décodé
  assert.equal(decodeName(latin1('Audio WhatsApp 2026-09-23 à 22.34.43')), 'Audio WhatsApp 2026-09-23 à 22.34.43');
  assert.equal(decodeName('caf\xe9.m4a'), 'caf\xe9.m4a'); // vrai latin1 : gardé tel quel
  assert.equal(decodeName(undefined), 'audio');
  assert.equal(decodeName(''), 'audio');
  assert.equal(decodeName('%0D%0A'), 'audio');
});

test('cleanName : sans caractères de contrôle, 200 caractères au plus', () => {
  assert.equal(cleanName(' a\u0000b\nc\t '), 'abc');
  assert.equal(cleanName('é'.repeat(300)).length, 200);
  assert.equal(Array.from(cleanName('🎵'.repeat(300))).length, 200); // pas d'emoji coupé en deux
  assert.equal(cleanName(null), 'audio');
});

test('KEY_FORMAT : format des clés d\'accès', () => {
  assert.ok(KEY_FORMAT.test('VMgkUrmfd6r0nNB4RdSrow'));
  assert.ok(KEY_FORMAT.test('cle_de-test-01'));
  for (const k of ['', 'court', '../keys/x', 'avec espace 123', 'a'.repeat(129), 'clé-accentuée-123']) {
    assert.ok(!KEY_FORMAT.test(k), k);
  }
});

test('readFiles : corps brut avec en-tête X-Nom', async () => {
  const raw = await readFiles({ headers: { 'content-type': 'application/octet-stream', 'x-nom': 'WhatsApp%20Audio.mp4' }, rawBody: mp4, query: {} });
  assert.equal(raw.length, 1);
  assert.equal(raw[0].name, 'WhatsApp Audio.mp4');
  assert.equal(raw[0].type, 'application/octet-stream');
  assert.equal(raw[0].data.length, mp4.length);

  const brut = await readFiles({ headers: { 'content-type': 'audio/mp4', 'x-nom': latin1('Répétition à 20 h') }, rawBody: mp4, query: {} });
  assert.equal(brut[0].name, 'Répétition à 20 h');
  const invalide = await readFiles({ headers: { 'x-nom': '%E0%A4%A' }, rawBody: mp4, query: {} });
  assert.equal(invalide[0].name, '%E0%A4%A');
  const parUrl = await readFiles({ headers: {}, rawBody: mp4, query: { nom: 'depuis-url.m4a' } });
  assert.equal(parUrl[0].name, 'depuis-url.m4a');
  const sansNom = await readFiles({ headers: {}, rawBody: mp4, query: {} });
  assert.equal(sansNom[0].name, 'audio');
  assert.deepEqual(await readFiles({ headers: {}, rawBody: Buffer.alloc(0), query: {} }), []);
  assert.deepEqual(await readFiles({ headers: {}, query: {} }), []);
});

test('readFiles : requête sans Content-Type (pas de rawBody) → flux lu directement', async () => {
  const req = (chunks, headers = {}) => Object.assign(Readable.from(chunks), { headers, query: {} });
  const [f] = await readFiles(req([mp4.subarray(0, 10), mp4.subarray(10)], { 'x-nom': 'a.m4a' }));
  assert.ok(f.data.equals(mp4));
  assert.equal(f.name, 'a.m4a');
  // au-delà de max, la suite n'est pas gardée, mais la taille gardée dépasse max (→ refusé)
  const [g] = await readFiles(req([Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)]), 10);
  assert.ok(g.data.length > 10 && g.data.length < 24, String(g.data.length));
  assert.deepEqual(await readFiles(req([])), []);
});

test('readFiles : multipart avec plusieurs fichiers', async () => {
  const b = 'XX';
  const body = multipart(b, [
    [part('a.mp4', 'video/mp4'), mp4],
    [part('b.ogg', 'audio/ogg'), 'OggS1234'],
    [part('vide.m4a', 'audio/mp4'), ''], // fichier vide : ignoré
    ['Content-Disposition: form-data; name="note"', 'un champ texte'], // champ texte : ignoré
  ]);
  const mp = await readFiles({ headers: { 'content-type': `multipart/form-data; boundary=${b}` }, rawBody: body, query: {} });
  assert.equal(mp.length, 2);
  assert.equal(mp[0].name, 'a.mp4');
  assert.equal(mp[0].type, 'video/mp4');
  assert.equal(mp[0].data.length, mp4.length);
  assert.equal(mp[0].tooBig, false);
  assert.equal(detectType(mp[1].data), 'audio/ogg');
});

test('readFiles : multipart, nom UTF-8 et fichier trop gros', async () => {
  const b = 'frontiere';
  const body = multipart(b, [[part('Répétition à 20 h.m4a', 'audio/mp4'), mp4], [part('petit.ogg', 'audio/ogg'), 'OggS']]);
  const headers = { 'content-type': `multipart/form-data; boundary=${b}` };
  const [f] = await readFiles({ headers, rawBody: body, query: {} });
  assert.equal(f.name, 'Répétition à 20 h.m4a');
  const [gros, petit] = await readFiles({ headers, rawBody: body, query: {} }, 10);
  assert.equal(gros.tooBig, true);
  assert.equal(petit.tooBig, false);
});

test('readFiles : multipart illisible → erreur (400 dans la fonction)', async () => {
  await assert.rejects(readFiles({ headers: { 'content-type': 'multipart/form-data' }, rawBody: Buffer.from('x'), query: {} }));
  await assert.rejects(readFiles({ headers: { 'content-type': 'multipart/form-data; boundary=zz' }, rawBody: Buffer.from('--zz\r\nContent-Disposition: form-data; name="a"; filename="a"\r\n\r\nabc'), query: {} }));
});

test('MAX : 30 Mo', () => {
  assert.equal(MAX, 30 * 1024 * 1024);
});

// Fichiers minimaux : seuls les en-têtes comptent
const box = (type, ...content) => {
  const body = Buffer.concat(content.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))));
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const mvhd = (timescale, duration) => {
  const b = Buffer.alloc(100);
  b.writeUInt32BE(timescale, 12);
  b.writeUInt32BE(duration, 16);
  return b;
};
const oggPage = (granule, payload) => {
  const h = Buffer.alloc(27);
  h.write('OggS', 0, 'latin1');
  h.writeBigUInt64LE(BigInt(granule), 6);
  h[26] = 1;
  return Buffer.concat([h, Buffer.from([payload.length]), payload]);
};

test('audioDuration : MP4/M4A (moov › mvhd), même si moov est en fin de fichier', () => {
  const ftyp = box('ftyp', 'M4A ', Buffer.alloc(4), 'M4A ');
  const moov = box('moov', box('mvhd', mvhd(44100, 44100 * 157.5)));
  assert.equal(audioDuration(Buffer.concat([ftyp, box('mdat', Buffer.alloc(64)), moov])), 157.5);
  assert.equal(audioDuration(Buffer.concat([ftyp, moov, box('mdat', Buffer.alloc(8))])), 157.5);
});

test('audioDuration : Ogg Opus (dernière page, moins le pré-saut)', () => {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head.writeUInt16LE(312, 10);
  const file = Buffer.concat([oggPage(0, head), oggPage(48000 * 221.5 + 312, Buffer.from([1, 2, 3]))]);
  assert.equal(audioDuration(file), 221.5);
});

test('audioDuration : WAV', () => {
  const wav = Buffer.alloc(44 + 32000);
  wav.write('RIFF', 0, 'latin1');
  wav.writeUInt32LE(36 + 32000, 4);
  wav.write('WAVEfmt ', 8, 'latin1');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28); // octets par seconde
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'latin1');
  wav.writeUInt32LE(32000, 40);
  assert.equal(audioDuration(wav), 2);
});

test('audioDuration : rien pour un format inconnu ou un fichier tronqué', () => {
  assert.equal(audioDuration(Buffer.from('ID3  ')), undefined);
  assert.equal(audioDuration(Buffer.from('%PDF-1.4 xxxxx')), undefined);
  assert.equal(audioDuration(mp4), undefined); // ftyp seul, sans moov
  assert.equal(audioDuration(Buffer.alloc(0)), undefined);
});
