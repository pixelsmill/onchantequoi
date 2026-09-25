import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ChoraleStore } from '../core/chorale.store';
import { DialogService } from '../core/dialog.service';
import { VOICE_NAME } from '../core/models';
import { PlayerService, Track } from '../core/player.service';
import { ToastService } from '../core/toast.service';
import { clock } from '../core/utils';

@Component({
  selector: 'app-player-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TablerIconComponent],
  template: `
    @if (player.track(); as t) {
      <section class="player" aria-label="Lecteur">
        <div class="row">
          <button
            type="button"
            class="play-circle"
            (click)="player.toggle()"
            [attr.aria-label]="player.playing() ? 'Pause' : 'Lecture'"
          >
            <tabler-icon
              [icon]="player.playing() ? 'player-pause-filled' : 'player-play-filled'"
              [size]="20"
            />
          </button>
          <div class="info">
            <div class="title">{{ t.title }}</div>
            <div class="sub">
              {{ t.voice ? voiceName[t.voice] : t.sub }} · {{ clock(player.time()) }}
              @if (player.duration()) {
                / {{ clock(player.duration()) }}
              }
            </div>
          </div>
          <button type="button" class="icon-btn" (click)="player.stop()" aria-label="Fermer le lecteur">
            <tabler-icon icon="x" [size]="22" />
          </button>
        </div>
        <input
          class="seek"
          type="range"
          min="0"
          max="1000"
          aria-label="Position dans l'enregistrement"
          [value]="position()"
          [attr.aria-valuetext]="clock(player.time())"
          (input)="seek($event)"
        />
        <div class="row small">
          <button type="button" class="chip-btn" (click)="player.back()">−10 s</button>
          <button
            type="button"
            class="chip-btn"
            [class.on]="player.speedIndex() > 0"
            (click)="player.cycleSpeed()"
          >
            {{ player.speedLabel() }}
          </button>
          <button
            type="button"
            class="chip-btn"
            [attr.aria-pressed]="player.loop()"
            (click)="player.toggleLoop()"
          >
            Boucle
          </button>
          @if (t.songId && t.voice) {
            <button type="button" class="link-btn wrong" (click)="wrong(t)">Mal classé ?</button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .player {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 7;
      background: var(--card);
      border-top: 1px solid var(--line);
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
      box-shadow: 0 -4px 16px rgba(40, 20, 60, 0.08);
    }
    .player > * {
      max-width: var(--max);
      margin-left: auto;
      margin-right: auto;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .row.small {
      gap: 8px;
      margin-top: 4px;
      flex-wrap: wrap;
    }
    .play-circle {
      width: 44px;
      height: 44px;
    }
    .info {
      flex: 1;
      min-width: 0;
    }
    .title {
      font-weight: 650;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      color: var(--muted);
      font-size: 13px;
    }
    .seek {
      display: block;
      width: 100%;
      margin: 10px 0 6px;
      accent-color: var(--accent);
    }
    .chip-btn.on {
      background: var(--accent-soft);
      color: var(--accent);
      border-color: var(--accent);
    }
    .wrong {
      margin-left: auto;
    }
  `,
})
export class PlayerBar {
  protected readonly player = inject(PlayerService);
  private readonly store = inject(ChoraleStore);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  protected readonly voiceName = VOICE_NAME;
  protected readonly clock = clock;

  protected position(): number {
    return Math.round(this.player.progress() * 1000);
  }

  protected seek(e: Event): void {
    this.player.seek(Number((e.target as HTMLInputElement).value) / 1000);
  }

  /** « Mal classé ? » : l'audio retourne dans À classer */
  protected async wrong(t: Track): Promise<void> {
    if (!t.songId || !t.voice) return;
    const ok = await this.dialog.confirm(
      'Mal classé ?',
      `« ${t.title} · ${VOICE_NAME[t.voice]} » retournera dans « À classer » pour être reclassé.`,
      'Remettre à classer',
    );
    if (!ok) return;
    this.player.stop();
    try {
      await this.store.unclassify(t.songId, t.voice, t.hash);
      this.toast.show('Remis dans « À classer »');
    } catch (e) {
      console.warn(e);
      this.toast.show('Oups, réessayez');
    }
  }
}
