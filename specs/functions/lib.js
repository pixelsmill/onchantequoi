// Logique pure (testable sans Firebase) : lecture du fichier reçu et détection du format.
const crypto = require('crypto');
const Busboy = require('busboy');

const MAX = 30 * 1024 * 1024; // limite des fonctions HTTP : 32 Mo

// Reconnaît le format à partir des premiers octets (le nom/type envoyé n'est pas fiable)
function detectType(buf, fallback = '') {
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4';
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0)) return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return 'audio/aac';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'audio/webm';
  if (/^(audio|video)\//.test(fallback)) return fallback.split(';')[0].replace(/^video\//, 'audio/');
  return null; // pas un audio reconnu
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Récupère le ou les fichiers de la requête : corps brut (raccourci iPhone) ou formulaire multipart.
function readFiles(req) {
  const ct = String(req.headers['content-type'] || '');
  const body = req.rawBody || Buffer.alloc(0);
  if (!ct.startsWith('multipart/form-data')) {
    const name = decodeURIComponent(String(req.headers['x-nom'] || req.query?.nom || 'audio'));
    return Promise.resolve(body.length ? [{ name, type: ct, data: body }] : []);
  }
  return new Promise((resolve, reject) => {
    const files = [];
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX, files: 20 } });
    bb.on('file', (_field, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        const data = Buffer.concat(chunks);
        if (data.length) files.push({ name: info.filename || 'audio', type: info.mimeType || '', data });
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve(files));
    bb.end(body);
  });
}

module.exports = { detectType, sha256, readFiles, MAX };
