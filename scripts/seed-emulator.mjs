// Crée deux chorales et leurs clés dans l'émulateur Firestore (développement local).
// Usage : npm run emulators   (dans un terminal)
//         npm run emulators:seed   (dans un autre), puis ouvrir les liens affichés
const project = 'demo-chorale';
const base = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const key = process.argv[2] || 'cle-de-test-chorale';
const key2 = `${key}-2`;

// « owner » : contourne les règles de sécurité (émulateur uniquement)
async function put(path, id, fields) {
  const res = await fetch(`${base}/${path}?documentId=${id}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])),
    }),
  });
  if (!res.ok && res.status !== 409) {
    console.error(`Échec (${res.status}) : l'émulateur Firestore tourne-t-il ? (npm run emulators)`);
    console.error(await res.text());
    process.exit(1);
  }
}

await put('choirs', '1', { name: 'On chante quoi ?', teacher: 'Seb' });
await put('choirs', '2', { name: 'Chorale du jeudi', teacher: 'Anne' });
await put('keys', key, { note: 'clé de test (émulateur)', choir: '1' });
await put('keys', key2, { note: 'clé de test, chorale 2 (émulateur)', choir: '2' });
console.log(`Chorale 1 : http://localhost:4200/?emu&cle=${key}`);
console.log(`Chorale 2 : http://localhost:4200/?emu&cle=${key2}&c=2`);
