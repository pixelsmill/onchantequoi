// Migration vers plusieurs chorales : les données actuelles deviennent la chorale « 1 ».
//   songs/{id}        → choirs/1/songs/{id}
//   files/{sha256}    → choirs/1/files/{sha256}
//   audio/{sha256}    → audio/1/{sha256}   (Storage, copie avec le même jeton de téléchargement)
//   keys/{clé}        : choir = '1' si absent
//   choirs/1          : { name, teacher } si absent
// Relançable : ce qui existe déjà à la destination n'est jamais écrasé. Rien n'est supprimé.
//
// Émulateurs (par défaut) :   npm run emulators   puis   node scripts/migrer-multi-chorales.mjs
// Production (Hubert, après l'essai sur les émulateurs) :
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\chemin\cle-compte-de-service.json"
//   node scripts/migrer-multi-chorales.mjs --production
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// firebase-admin est installé avec la fonction depot (npm run install:functions)
const require = createRequire(new URL('../functions/package.json', import.meta.url));

const CHOIR = '1';
const HASH = /^[0-9a-f]{64}$/;

/** Copie les données de la chorale actuelle dans choirs/1 ; renvoie les comptes */
export async function migrate({ db, bucket, name = 'On chante quoi ?', teacher = 'Seb', log = console.log }) {
  const n = { songs: 0, files: 0, audio: 0, keys: 0, choir: 0, skipped: 0 };

  const choirRef = db.doc(`choirs/${CHOIR}`);
  if (!(await choirRef.get()).exists) {
    await choirRef.set({ name, teacher });
    n.choir++;
  }

  for (const k of (await db.collection('keys').get()).docs) {
    if (k.get('choir') == null) {
      await k.ref.update({ choir: CHOIR });
      n.keys++;
    }
  }

  for (const [from, to] of [
    ['songs', 'songs'],
    ['files', 'files'],
  ]) {
    for (const d of (await db.collection(from).get()).docs) {
      const dest = db.doc(`choirs/${CHOIR}/${to}/${d.id}`);
      try {
        await dest.create(d.data()); // échoue si le document existe déjà
        n[to]++;
      } catch (e) {
        if (e.code !== 6) throw e; // 6 = ALREADY_EXISTS
        n.skipped++;
      }
    }
  }

  const [objects] = await bucket.getFiles({ prefix: 'audio/' });
  for (const f of objects) {
    const hash = f.name.slice('audio/'.length);
    if (!HASH.test(hash)) continue; // déjà rangé dans une chorale (audio/1/…)
    const dest = bucket.file(`audio/${CHOIR}/${hash}`);
    if ((await dest.exists())[0]) {
      n.skipped++;
      continue;
    }
    await f.copy(dest); // les métadonnées (type, jeton) suivent
    n.audio++;
  }

  log(
    `Copiés : ${n.songs} morceaux, ${n.files} fichiers, ${n.audio} audios ; ` +
      `${n.keys} clés et ${n.choir} fiche de chorale complétées ; ${n.skipped} déjà présents.`,
  );
  return n;
}

/** Compare les anciens et les nouveaux emplacements ; renvoie la liste des écarts */
export async function check({ db, bucket, log = console.log }) {
  const ids = async (path) => new Set((await db.collection(path).get()).docs.map((d) => d.id));
  const gaps = [];
  for (const c of ['songs', 'files']) {
    const before = await ids(c);
    const after = await ids(`choirs/${CHOIR}/${c}`);
    const missing = [...before].filter((id) => !after.has(id));
    log(`${c} : ${before.size} avant, ${after.size} dans la chorale ${CHOIR}, ${missing.length} manquant(s)`);
    gaps.push(...missing.map((id) => `${c}/${id}`));
  }
  const [objects] = await bucket.getFiles({ prefix: 'audio/' });
  const names = new Set(objects.map((f) => f.name));
  const old = objects.map((f) => f.name.slice(6)).filter((h) => HASH.test(h));
  const missing = old.filter((h) => !names.has(`audio/${CHOIR}/${h}`));
  log(`audio : ${old.length} avant, ${missing.length} manquant(s) dans audio/${CHOIR}`);
  gaps.push(...missing.map((h) => `audio/${h}`));
  return gaps;
}

async function main() {
  const production = process.argv.includes('--production');
  const projectId = production ? 'onchantequoi' : 'demo-chorale';
  if (!production) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
    console.log('Émulateurs (projet demo-chorale). Pour la production : --production');
  } else {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    console.log('PRODUCTION : projet onchantequoi');
  }
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getStorage } = require('firebase-admin/storage');
  const app = initializeApp({
    projectId,
    storageBucket: production ? 'onchantequoi.firebasestorage.app' : 'demo-chorale.appspot.com',
    ...(production ? { credential: applicationDefault() } : {}),
  });
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();
  await migrate({ db, bucket });
  const gaps = await check({ db, bucket });
  if (gaps.length) {
    console.error(`Écarts (${gaps.length}) :\n  ${gaps.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('Tout est copié.');
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
