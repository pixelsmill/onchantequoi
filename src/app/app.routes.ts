import { Routes } from '@angular/router';
import { choirName } from './config';

export const routes: Routes = [
  {
    path: '',
    title: choirName,
    loadComponent: () => import('./features/songs/songs-page').then((m) => m.SongsPage),
  },
  {
    path: 'a-classer',
    title: `À classer · ${choirName}`,
    loadComponent: () => import('./features/inbox/inbox-page').then((m) => m.InboxPage),
  },
  {
    path: 'installer',
    title: `Installer sur mon téléphone · ${choirName}`,
    loadComponent: () => import('./features/install/install-page').then((m) => m.InstallPage),
  },
  { path: '**', redirectTo: '' },
];
