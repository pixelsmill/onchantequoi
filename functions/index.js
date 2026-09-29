// Porte d'entrée : POST https://<projet>.web.app/api/depot?cle=<clé> (ou en-tête X-Cle)
// Corps = le fichier audio (brut, nom dans l'en-tête X-Nom) ou un formulaire multipart (un ou plusieurs fichiers).
// Utilisée par le raccourci iPhone, et plus tard par le relevé e-mail ou un bot.
// Réponse en texte brut : le raccourci l'affiche telle quelle dans une notification.
const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/https');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { detectType, sha256, readFiles, audioDuration, MAX, KEY_FORMAT } = require('./lib');

initializeApp();
const db = getFirestore();
const bucket = () => getStorage().bucket();

const s = (n) => (n > 1 ? 's' : ''); // pluriel

exports.depot = onRequest(
  // invoker public : appelée sans compte Google (raccourci iPhone, réécriture Hosting /api/depot)
  { region: 'europe-west1', cors: true, memory: '512MiB', timeoutSeconds: 120, maxInstances: 3, invoker: 'public' },
  async (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').send('Utilisez POST');

    try {
      const cle = String(req.query.cle || req.headers['x-cle'] || '');
      if (!KEY_FORMAT.test(cle) || !(await db.doc(`keys/${cle}`).get()).exists) {
        return res.status(403).send('Lien de la chorale invalide');
      }

      let files;
      try { files = await readFiles(req); } catch { return res.status(400).send('Envoi illisible'); }
      if (!files.length) return res.status(400).send('Aucun fichier reçu');

      let ajoutes = 0, doublons = 0, refuses = 0;
      for (const f of files) {
        const type = detectType(f.data, f.type);
        if (!type || f.tooBig || f.data.length > MAX) { refuses++; continue; }
        const hash = sha256(f.data);
        const ref = db.doc(`files/${hash}`);
        if ((await ref.get()).exists) { doublons++; continue; }
        // Jeton de téléchargement, comme pour un envoi depuis l'app (getDownloadURL côté client)
        await bucket().file(`audio/${hash}`).save(f.data, {
          resumable: false, contentType: type,
          metadata: { metadata: { firebaseStorageDownloadTokens: crypto.randomUUID() } },
        });
        try {
          // create() échoue si le document existe déjà (même fichier envoyé au même moment)
          const duration = audioDuration(f.data);
          await ref.create({
            status: 'inbox', name: f.name, size: f.data.length, type,
            ...(duration ? { duration } : {}),
            source: 'depot', createdAt: FieldValue.serverTimestamp(),
          });
          ajoutes++;
        } catch (e) {
          if (e.code !== 6) throw e; // 6 = ALREADY_EXISTS
          doublons++;
        }
      }

      const msg = [];
      if (ajoutes) msg.push(`${ajoutes} audio${s(ajoutes)} envoyé${s(ajoutes)} dans « À classer »`);
      if (doublons) msg.push(`${doublons} déjà reçu${s(doublons)}`);
      if (refuses) msg.push(`${refuses} refusé${s(refuses)} (pas un audio ou trop gros)`);
      return res.status(ajoutes || doublons ? 200 : 415).send(msg.join(' · '));
    } catch (e) {
      logger.error('depot', e);
      return res.status(500).send('Erreur du serveur, réessayez dans un moment');
    }
  }
);
