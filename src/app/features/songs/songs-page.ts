import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ChoraleStore } from '../../core/chorale.store';
import { ClockService } from '../../core/clock.service';
import { DialogService, MenuAction } from '../../core/dialog.service';
import { Song, VoiceKey, VOICES } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ToastService } from '../../core/toast.service';
import { ago, dateShort, isFresh, norm } from '../../core/utils';

/** Onglet « Morceaux » : chaque morceau avec ses 4 boutons S · A · H · Tous */
@Component({
  selector: 'app-songs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TablerIconComponent],
  templateUrl: './songs-page.html',
  styleUrl: './songs-page.scss',
})
export class SongsPage {
  protected readonly store = inject(ChoraleStore);
  protected readonly player = inject(PlayerService);
  private readonly clock = inject(ClockService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  protected readonly voices = VOICES;
  protected readonly dateShort = dateShort;
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const q = norm(this.query());
    return this.store.sortedSongs().filter((s) => !q || norm(s.title).includes(q));
  });

  protected ago(ms: number): string {
    return ago(ms, this.clock.now());
  }

  protected fresh(song: Song): boolean {
    return isFresh(song, this.clock.now());
  }

  protected play(song: Song, voice: VoiceKey): void {
    const rec = song.voices[voice];
    if (!rec) return;
    if (this.player.isCurrent(song.id, voice)) {
      this.player.toggle();
      return;
    }
    this.player.play({ hash: rec.hash, title: song.title, sub: '', songId: song.id, voice });
  }

  protected async menu(song: Song): Promise<void> {
    const empty = !Object.keys(song.voices ?? {}).length;
    const actions: MenuAction[] = [{ id: 'rename', label: 'Renommer' }];
    if (empty) actions.push({ id: 'delete', label: 'Supprimer le morceau', danger: true });
    const note = empty ? '' : 'Pour corriger une voix, lancez-la puis touchez « Mal classé ? ».';
    const choice = await this.dialog.menu(song.title, actions, note);
    try {
      if (choice === 'rename') {
        const title = await this.dialog.prompt('Renommer', song.title);
        if (title && title !== song.title) {
          await this.store.renameSong(song.id, title);
          this.toast.show('Morceau renommé');
        }
      }
      if (
        choice === 'delete' &&
        (await this.dialog.confirm('Supprimer ce morceau ?', song.title, 'Supprimer', true))
      ) {
        const done = await this.store.deleteSong(song.id);
        this.toast.show(
          done ? 'Morceau supprimé' : "Une voix vient d'y être classée : le morceau est gardé",
        );
      }
    } catch (e) {
      console.warn(e);
      this.toast.show('Oups, réessayez');
    }
  }
}
