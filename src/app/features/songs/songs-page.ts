import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { teacherName } from '../../config';
import { ChoraleStore } from '../../core/chorale.store';
import { ClockService } from '../../core/clock.service';
import { DialogService, MenuAction } from '../../core/dialog.service';
import { Song, VOICE_NAME, VoiceKey, VOICES } from '../../core/models';
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
  protected readonly teacher = teacherName;
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
    // Enregistrements du morceau, dans l'ordre S · A · H · Tous
    const recs = VOICES.flatMap((v) => {
      const r = song.voices?.[v.key];
      return r ? [{ voice: v.key, hash: r.hash }] : [];
    });
    const actions: MenuAction[] = [
      { id: 'rename', label: 'Renommer' },
      {
        id: 'delete',
        label: recs.length ? 'Supprimer le morceau et ses enregistrements' : 'Supprimer le morceau',
        danger: true,
      },
    ];
    const note = recs.length ? 'Pour corriger une voix, lancez-la puis touchez « Mal classé ? ».' : '';
    const choice = await this.dialog.menu(song.title, actions, note);
    try {
      if (choice === 'rename') {
        const title = await this.dialog.prompt('Renommer', song.title);
        if (title && title !== song.title) {
          await this.store.renameSong(song.id, title);
          this.toast.show('Morceau renommé');
        }
      }
      if (choice === 'delete') {
        const voices = recs.map((r) => VOICE_NAME[r.voice]).join(', ');
        const what = recs.length === 1 ? 'son enregistrement' : `ses ${recs.length} enregistrements`;
        const text = recs.length
          ? `« ${song.title} » et ${what} (${voices}) seront supprimés pour tout le monde.`
          : `« ${song.title} » sera supprimé.`;
        const ok = await this.dialog.confirm(
          'Supprimer ce morceau ?',
          text,
          recs.length ? 'Tout supprimer' : 'Supprimer',
          true,
        );
        if (!ok) return;
        const hashes = recs.map((r) => r.hash);
        if (hashes.includes(this.player.track()?.hash ?? '')) this.player.stop();
        const done = await this.store.deleteSong(song.id, hashes);
        this.toast.show(
          done ? 'Morceau supprimé' : 'Le morceau vient de changer : vérifiez, puis recommencez',
        );
      }
    } catch (e) {
      console.warn(e);
      this.toast.show('Oups, réessayez');
    }
  }
}
