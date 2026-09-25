// Crée une clé d'accès dans l'émulateur Firestore (développement local).
// Usage : npm run emulators   (dans un terminal)
//         npm run emulators:seed   (dans un autre), puis http://localhost:4200/?emu&cle=cle-de-test-chorale
const project = 'demo-chorale';
const key = process.argv[2] || 'cle-de-test-chorale';
const url = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/keys?documentId=${key}`;

const res = await fetch(url, {
  method: 'POST',
  // « owner » : contourne les règles de sécurité (émulateur uniquement)
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { note: { stringValue: 'clé de test (émulateur)' } } }),
});
if (res.ok || res.status === 409) {
  console.log(`Clé prête : http://localhost:4200/?emu&cle=${key}`);
} else {
  console.error(`Échec (${res.status}) : l'émulateur Firestore tourne-t-il ? (npm run emulators)`);
  console.error(await res.text());
  process.exit(1);
}
