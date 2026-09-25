import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ChoraleStore } from './core/chorale.store';
import { PlayerService } from './core/player.service';
import { PwaService } from './core/pwa.service';
import { ToastService } from './core/toast.service';
import { UploadService } from './core/upload.service';
import { ACCEPT } from './core/utils';
import { Gate } from './features/gate/gate';
import { DialogHost } from './shared/dialog-host';
import { DropZone } from './shared/drop-zone';
import { PlayerBar } from './shared/player-bar';
import { Toast } from './shared/toast';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TablerIconComponent,
    Gate,
    DialogHost,
    DropZone,
    PlayerBar,
    Toast,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '[class.has-player]': '!!player.track()' },
})
export class App {
  protected readonly store = inject(ChoraleStore);
  protected readonly player = inject(PlayerService);
  protected readonly pwa = inject(PwaService);
  protected readonly uploads = inject(UploadService);
  protected readonly accept = ACCEPT;
  /** « Morceaux » reste actif avec ?cle=… ou ?demo dans l'adresse */
  protected readonly exactPath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  constructor() {
    this.store.init();
    if (new URLSearchParams(globalThis.location?.search).get('partage') === 'echec') {
      inject(ToastService).show("Le partage n'a pas pu être reçu : réessayez depuis WhatsApp", 6000);
    }
    // Audios partagés depuis WhatsApp (Android) : envoyés dès que l'accès est ouvert
    effect(() => {
      if (this.store.status() === 'ready') {
        untracked(() => this.uploads.takeShared().catch((e) => console.warn(e)));
      }
    });
  }

  protected onFiles(input: HTMLInputElement): void {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) this.uploads.upload(files);
  }
}
