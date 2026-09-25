// Porte d'entrée : POST https://<projet>.web.app/api/depot?cle=<clé>
// Corps = le fichier audio (brut) ou un formulaire multipart (un ou plusieurs fichiers).
// Utilisée par le raccourci iPhone, et plus tard par le relevé e-mail ou un bot.
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { detectType, sha256, readFiles, MAX } = require('./lib');

admin.initializeApp();
const db = admin.firestore();
const bucket = () => admin.storage().bucket();

exports.depot = onRequest(
  { region: 'europe-west1', cors: true, memory: '512MiB', timeoutSeconds: 120, maxInstances: 3 },
  async (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    if (req.method !== 'POST') return res.status(405).send('Utilisez POST');

    const cle = String(req.query.cle || req.headers['x-cle'] || '');
    if (!/^[A-Za-z0-9_-]{10,}$/.test(cle) || !(await db.doc(`keys/${cle}`).get()).exists) {
      return res.status(403).send('Lien de la chorale invalide');
    }

    let files;
    try { files = await readFiles(req); } catch (e) { return res.status(400).send('Envoi illisible'); }
    if (!files.length) return res.status(400).send('Aucun fichier reçu');

    let ajoutes = 0, doublons = 0, refuses = 0;
    for (const f of files) {
      const type = detectType(f.data, f.type);
      if (!type || f.data.length > MAX) { refuses++; continue; }
      const hash = sha256(f.data);
      const ref = db.doc(`files/${hash}`);
      if ((await ref.get()).exists) { doublons++; continue; }
      await bucket().file(`audio/${hash}`).save(f.data, { contentType: type, resumable: false });
      const created = await db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref, {
          status: 'inbox', name: f.name, size: f.data.length, type,
          source: 'depot', createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      });
      created ? ajoutes++ : doublons++;
    }

    const msg = [];
    if (ajoutes) msg.push(`${ajoutes} audio${ajoutes > 1 ? 's' : ''} envoyé${ajoutes > 1 ? 's' : ''} dans « À classer »`);
    if (doublons) msg.push(`${doublons} déjà reçu${doublons > 1 ? 's' : ''}`);
    if (refuses) msg.push(`${refuses} refusé${refuses > 1 ? 's' : ''} (pas un audio ou trop gros)`);
    res.status(ajoutes || doublons ? 200 : 415).send(msg.join(' · '));
  }
);
