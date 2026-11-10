// Accès administrateur (Firestore + Storage) pour les scripts : émulateurs par défaut, --production sinon.
// En production, les identifiants viennent de GOOGLE_APPLICATION_CREDENTIALS (clé de compte de service)
// s'il est défini, sinon de la connexion à la CLI Firebase de ce PC (npx firebase login) : un fichier
// d'identifiants temporaire est écrit puis supprimé à la fin du script. Aucun identifiant n'est affiché.
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

// firebase-admin est installé avec la fonction depot (npm run install:functions)
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const root = createRequire(new URL('../package.json', import.meta.url));

export const PROD_PROJECT = 'onchantequoi';

export function adminApp(production = process.argv.includes('--production')) {
  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getStorage } = require('firebase-admin/storage');
  if (!production) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
    console.log('Émulateurs (projet demo-chorale). Pour la production : --production');
    const app = initializeApp({ projectId: 'demo-chorale', storageBucket: 'demo-chorale.appspot.com' });
    return { db: getFirestore(app), bucket: getStorage(app).bucket(), production };
  }
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) useCliLogin();
  console.log(`PRODUCTION : projet ${PROD_PROJECT}`);
  const app = initializeApp({
    projectId: PROD_PROJECT,
    storageBucket: `${PROD_PROJECT}.firebasestorage.app`,
    credential: applicationDefault(),
  });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(), production };
}

/** Identifiants « par défaut » temporaires à partir de la connexion de la CLI Firebase */
function useCliLogin() {
  let refresh;
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    refresh = cfg.tokens?.refresh_token;
  } catch {
    // pas de connexion
  }
  if (!refresh) throw new Error('Pas de connexion à la CLI Firebase : lancez « npx firebase login ».');
  const { clientId, clientSecret } = root('firebase-tools/lib/api');
  const file = join(tmpdir(), `chorale-adc-${randomBytes(6).toString('hex')}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      type: 'authorized_user',
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refresh,
      quota_project_id: PROD_PROJECT,
    }),
    { mode: 0o600 },
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  process.on('exit', () => {
    try {
      unlinkSync(file);
    } catch {
      // déjà supprimé
    }
  });
}
