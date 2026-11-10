// Crée une ou plusieurs chorales : fiche choirs/{n} { name, teacher } et une clé keys/{clé} { note, choir },
// puis affiche le lien à poster dans le groupe de chaque chorale.
// Une chorale qui existe déjà n'est pas touchée (pas de nouvelle clé).
//
//   node scripts/creer-chorale.mjs 2                         (émulateurs)
//   node scripts/creer-chorale.mjs 2 3 4 5 --production
//   node scripts/creer-chorale.mjs 2 --nom "Chorale du jeudi" --chef Anne --production
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { adminApp } from './admin.mjs';

const CHOIR = /^[0-9a-z-]{1,20}$/;
const SITE = 'https://onchantequoi.web.app';

/** Crée la chorale si elle n'existe pas ; renvoie { id, created, key? } */
export async function createChoir(db, id, { name = `Chorale ${id}`, teacher = 'Seb', key } = {}) {
  if (!CHOIR.test(id)) throw new Error(`Numéro de chorale invalide : ${id}`);
  const ref = db.doc(`choirs/${id}`);
  const k = key ?? randomBytes(16).toString('base64url'); // 22 caractères parmi A-Z a-z 0-9 _ -
  const created = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.create(ref, { name, teacher });
    tx.create(db.doc(`keys/${k}`), { note: `lien de la chorale ${id} (${new Date().toISOString().slice(0, 10)})`, choir: id });
    return true;
  });
  return created ? { id, created, key: k } : { id, created };
}

export const linkFor = (id, key, site = SITE) => `${site}/?cle=${key}&c=${id}`;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const name = opt('--nom');
  const teacher = opt('--chef');
  const ids = args.filter((a) => !a.startsWith('--'));
  if (!ids.length) throw new Error('Indiquez le numéro de la ou des chorales : node scripts/creer-chorale.mjs 2 3');
  if (name && ids.length > 1) throw new Error('--nom ne vaut que pour une seule chorale');
  const { db, production } = adminApp();
  const site = production ? SITE : 'http://localhost:4200';
  for (const id of ids) {
    const r = await createChoir(db, id, { name, teacher });
    if (r.created) console.log(`Chorale ${id} créée : ${linkFor(id, r.key, site)}${production ? '' : '&emu'}`);
    else console.log(`Chorale ${id} : existe déjà, rien changé`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  });
}
