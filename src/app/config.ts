// Configuration de l'application web Firebase du projet « onchantequoi »
// (Console Firebase > Paramètres du projet > Vos applications). Elle n'est pas secrète.
// Mode démo (données fictives, rien n'est enregistré) : ajouter ?demo à l'adresse,
// ou remettre apiKey: 'REMPLACER'.
export const firebaseConfig = {
  apiKey: 'AIzaSyBLn97O48fG9di0ejTeKZqyUj5kx5Y2eQQ',
  authDomain: 'onchantequoi.firebaseapp.com',
  projectId: 'onchantequoi',
  storageBucket: 'onchantequoi.firebasestorage.app',
  messagingSenderId: '889556654323',
  appId: '1:889556654323:web:1ff0f3b5c61c4ae49e3f86',
};

// Nom affiché en haut de l'app
export const choirName = 'Chorale';

// Lien iCloud du raccourci iPhone « Envoyer à la Chorale », une fois créé (voir docs/raccourci-iphone.md).
// Laissé vide, la page « Installer » explique comment le créer.
export const shortcutUrl = '';
