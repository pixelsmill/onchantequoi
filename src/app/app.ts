import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ChoraleStore } from './core/chorale.store';
import { DialogService } from './core/dialog.service';
import { LyricsService } from './core/lyrics.service';
import { PlayerService } from './core/player.service';
import { PwaService } from './core/pwa.service';
import { ToastService } from './core/toast.service';
import { UploadService } from './core/upload.service';
import { ACCEPT } from './core/utils';
import { Gate } from './features/gate/gate';
import { DialogHost } from './shared/dialog-host';
import { DropZone } from './shared/drop-zone';
import { LyricsView } from './shared/lyrics-view';
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
    LyricsView,
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
  private readonly dialog = inject(DialogService);
  private readonly lyrics = inject(LyricsService);
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
      inject(ToastService).show("Le partage n'a pas pu être reçu : réessayez", 6000);
    }
    // Audios partagés depuis une autre app (Android) : envoyés dès que l'accès est ouvert
    effect(() => {
      if (this.store.status() === 'ready') {
        untracked(() => this.uploads.takeShared().catch((e) => console.warn(e)));
      }
    });
  }

  /** Menu de l'en-tête : passer à une autre chorale de ce téléphone */
  protected async changeChoir(): Promise<void> {
    const others = this.store.otherChoirs();
    const id = await this.dialog.menu(
      'Changer de chorale',
      others.map((c) => ({ id: c.id, label: c.name })),
      `Vous êtes dans « ${this.store.choirName()} ». Pour en ajouter une, ouvrez son lien.`,
    );
    if (!id) return;
    this.player.stop();
    this.lyrics.close();
    await this.store.switchChoir(id);
    // L'en-tête a été redessiné : le focus revient sur le nom de la chorale
    setTimeout(() => document.querySelector<HTMLElement>('.choir-btn')?.focus());
  }

  protected onFiles(input: HTMLInputElement): void {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) this.uploads.upload(files);
  }
}
