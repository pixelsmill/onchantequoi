// Outils communs aux tests des règles (lancés dans l'émulateur par « npm test »)
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, setLogLevel } from 'firebase/firestore';

// Le SDK journalise chaque refus (attendu ici) ; DEBUG_RULES=1 les affiche, avec la ligne de règle en cause
if (!process.env.DEBUG_RULES) setLogLevel('error');

export const PROJECT = 'demo-chorale';
export const KEY = 'cle-valide-0123456789'; // clé du lien de la chorale
export const NEW_KEY = 'nouvelle-cle-9876543210'; // nouveau lien, après une fuite

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const randomHash = () => sha256(randomBytes(16));

const rules = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

export function setup({ storage = false } = {}) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Émulateurs absents : lancez « npm test », qui les démarre (ou « firebase emulators:start »).');
  }
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: rules('firestore.rules') },
    ...(storage && { storage: { rules: rules('storage.rules') } }),
  });
}

// Un téléphone connecté anonymement (Auth anonyme de l'app)
export const phone = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });

// Écritures « console » : règles désactivées
export const asAdmin = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore(), ctx));

export async function seed(env, { keys = [KEY], members = {} } = {}) {
  await asAdmin(env, async (db) => {
    for (const k of keys) await setDoc(doc(db, 'keys', k), { note: 'test' });
    for (const [uid, key] of Object.entries(members)) {
      await setDoc(doc(db, 'members', uid), { key, at: serverTimestamp() });
    }
  });
}

export const addKey = (env, key) => asAdmin(env, (db) => setDoc(doc(db, 'keys', key), { note: 'test' }));
export const removeKey = (env, key) => asAdmin(env, (db) => deleteDoc(doc(db, 'keys', key)));

// Lecture sans les règles : données du document, ou null s'il n'existe pas
export async function read(env, path) {
  let data = null;
  await asAdmin(env, async (db) => {
    const snap = await getDoc(doc(db, path));
    data = snap.exists() ? snap.data() : null;
  });
  return data;
}
