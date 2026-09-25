// Logique pure (testable sans Firebase) : lecture du fichier reçu et détection du format.
const crypto = require('node:crypto');
const Busboy = require('busboy');

const MAX = 30 * 1024 * 1024; // limite des fonctions HTTP : 32 Mo
const KEY_FORMAT = /^[A-Za-z0-9_-]{10,128}$/; // clé d'accès = id d'un document keys/… (mêmes règles côté Firestore)

// Reconnaît le format à partir des premiers octets (le nom/type envoyé n'est pas fiable)
function detectType(buf, fallback = '') {
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    // Conteneur MP4 (m4a, mp4…), sauf les photos HEIC/AVIF qui utilisent le même format
    return /^(hei[cmsx]|hev[cmsx]|mif1|msf1|avi[fs])$/.test(buf.toString('ascii', 8, 12)) ? null : 'audio/mp4';
  }
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0)) return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return 'audio/aac';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'audio/webm';
  if (/^(audio|video)\//.test(fallback)) return fallback.split(';')[0].trim().replace(/^video\//, 'audio/');
  return null; // pas un audio reconnu
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Nom affichable : sans caractères de contrôle, 200 caractères au plus
function cleanName(s) {
  const t = String(s ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim();
  return Array.from(t).slice(0, 200).join('') || 'audio';
}

// Nom reçu dans l'en-tête X-Nom : encodé (encodeURIComponent) ou brut (le raccourci iPhone envoie
// le nom tel quel, en UTF-8). Ne lève jamais d'erreur : en cas de doute, on garde la valeur reçue.
function decodeName(v) {
  let s = String(v ?? '');
  // Node lit les en-têtes en latin1 : on retrouve l'UTF-8 d'origine (« à » au lieu de « Ã  »)
  if (/[\x80-\xff]/.test(s) && !/[^\x00-\xff]/.test(s)) {
    const u = Buffer.from(s, 'latin1').toString('utf8');
    if (!u.includes('\ufffd')) s = u;
  }
  try { s = decodeURIComponent(s); } catch { /* « 100% » ou séquence invalide : valeur brute */ }
  return cleanName(s);
}

// Corps de la requête. Cloud Functions le range dans req.rawBody, sauf s'il n'y a pas d'en-tête
// Content-Type : on lit alors le flux nous-mêmes (au-delà de max, la suite n'est pas gardée).
async function readBody(req, max = MAX) {
  if (req.rawBody) return req.rawBody;
  if (!req.readable) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    if (size <= max) chunks.push(c);
    size += c.length;
  }
  return Buffer.concat(chunks);
}

// Récupère le ou les fichiers de la requête : corps brut (raccourci iPhone) ou formulaire multipart.
// Un fichier multipart plus gros que max est marqué tooBig (il sera refusé).
async function readFiles(req, max = MAX) {
  const ct = String(req.headers['content-type'] || '');
  const body = await readBody(req, max);
  if (!/^multipart\/form-data/i.test(ct)) {
    const name = decodeName(req.headers['x-nom'] ?? req.query?.nom ?? 'audio');
    return body.length ? [{ name, type: ct, data: body }] : [];
  }
  return new Promise((resolve, reject) => {
    const files = [];
    // defParamCharset : les navigateurs envoient les noms de fichiers en UTF-8
    const bb = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { fileSize: max, files: 20 } });
    bb.on('file', (_field, stream, info) => {
      const chunks = [];
      stream.on('error', reject); // formulaire coupé en plein fichier (sinon exception non rattrapée)
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        const data = Buffer.concat(chunks);
        if (data.length) files.push({ name: cleanName(info.filename), type: info.mimeType || '', data, tooBig: !!stream.truncated });
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve(files));
    bb.end(body);
  });
}

module.exports = { detectType, sha256, cleanName, decodeName, readFiles, MAX, KEY_FORMAT };
