# Chorale

Webapp privée de répétition pour choristes : une liste de morceaux avec 4 boutons chacun (**S · A · H · Tous**) et un onglet **À classer** où tout le monde dépose les audios envoyés par le prof sur WhatsApp.

- Angular 21 (composants autonomes, signals, sans zone.js), PWA installable, partage Android depuis WhatsApp
- Firebase : Hosting, Firestore, Storage, Auth anonyme, Cloud Function `depot` (europe-west1) pour le raccourci iPhone
- Mode démo sans backend tant que `src/app/config.ts` contient `apiKey: 'REMPLACER'`

```bash
npm install
npm start          # http://localhost:4200 (mode démo)
npm test           # tests unitaires (Vitest)
```

Mise en ligne, lien d'accès, raccourci iPhone, tests des règles : voir **[LISEZMOI.md](LISEZMOI.md)**.
