import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ChoraleStore } from '../core/chorale.store';
import { LYRICS_SIZES, LyricsService } from '../core/lyrics.service';
import { VOICE_NAME, VoiceKey, VOICES } from '../core/models';
import { PlayerService } from '../core/player.service';
import { clock } from '../core/utils';
import { closeModal, openModal } from './dialog-host';

/** Paroles en plein écran, façon lecteur de musique : grand texte, lecteur en bas */
@Component({
  selector: 'app-lyrics-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TablerIconComponent],
  template: `
    <dialog
      #dlg
      class="lyrics"
      aria-labelledby="lyrics-title"
      [style.--bg]="background()"
      (cancel)="$event.preventDefault(); lyrics.close()"
      (close)="lyrics.close()"
    >
      @if (song(); as s) {
        <header>
          <button
            type="button"
            class="round"
            (click)="lyrics.close()"
            aria-label="Fermer les paroles"
          >
            <tabler-icon icon="chevron-down" [size]="24" />
          </button>
          <div class="titles">
            <h2 id="lyrics-title">{{ s.title }}</h2>
            <p>{{ voiceLabel() }}</p>
          </div>
          <button
            type="button"
            class="round size"
            (click)="lyrics.cycleSize()"
            [attr.aria-label]="'Taille du texte : ' + sizeName()"
          >
            <span aria-hidden="true">A<span>A</span></span>
          </button>
        </header>

        <div class="text" [style.font-size.px]="fontSize()" tabindex="0" aria-label="Paroles">
          @for (stanza of stanzas(); track $index) {
            <p>{{ stanza }}</p>
          } @empty {
            <p class="none">
              Pas encore de paroles pour ce morceau.<br />
              Menu ⋯ du morceau › « Ajouter les paroles ».
            </p>
          }
        </div>

        <footer>
          @if (here()) {
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
            <div class="times">
              <span>{{ clock(player.time()) }}</span>
              <span>{{ player.duration() ? clock(player.duration()) : '' }}</span>
            </div>
            <div class="controls">
              <button type="button" class="ctl" (click)="player.back()">−10 s</button>
              <button
                type="button"
                class="ctl"
                (click)="player.cycleSpeed()"
                [attr.aria-label]="player.speedLabel()"
              >
                {{ speedShort() }}
              </button>
              <button
                type="button"
                class="play"
                (click)="player.toggle()"
                [attr.aria-label]="player.playing() ? 'Pause' : 'Lecture'"
              >
                <tabler-icon
                  [icon]="player.playing() ? 'player-pause-filled' : 'player-play-filled'"
                  [size]="26"
                />
              </button>
              <button
                type="button"
                class="ctl"
                [attr.aria-pressed]="player.loop()"
                (click)="player.toggleLoop()"
                aria-label="Répéter cet enregistrement"
              >
                <tabler-icon icon="repeat-once" [size]="22" />
              </button>
              @if (player.playlist()) {
                <button
                  type="button"
                  class="ctl"
                  (click)="player.next()"
                  aria-label="Morceau suivant de la boucle"
                >
                  <tabler-icon icon="player-skip-forward-filled" [size]="22" />
                </button>
              } @else {
                <span class="ctl" aria-hidden="true"></span>
              }
            </div>
          } @else {
            <p class="listen" id="listen-label">Écouter</p>
            <div class="voices" role="group" aria-labelledby="listen-label">
              @for (v of voices; track v.key) {
                @let rec = s.voices[v.key];
                <button
                  type="button"
                  [disabled]="!rec"
                  [attr.aria-label]="v.long + (rec ? '' : ', pas encore reçu')"
                  (pointerdown)="rec && player.prefetch(rec.hash)"
                  (click)="listen(v.key)"
                >
                  {{ v.short }}
                </button>
              }
            </div>
          }
        </footer>
      }
    </dialog>
  `,
  styles: `
    .lyrics {
      --fg: #ffffff;
      --soft: rgba(255, 255, 255, 0.8);
      border: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      background: var(--bg);
      color: var(--fg);
      transition: background-color 0.3s;
    }
    .lyrics[open] {
      display: flex;
      flex-direction: column;
    }
    .lyrics::backdrop {
      background: rgba(20, 10, 30, 0.6);
    }
    header,
    .text,
    footer {
      width: 100%;
      max-width: var(--max);
      margin: 0 auto;
    }
    header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
    }
    .titles {
      flex: 1;
      min-width: 0;
      text-align: center;
    }
    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .titles p {
      margin: 0;
      font-size: 13px;
      color: var(--soft);
    }
    .round {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 0;
      background: rgba(0, 0, 0, 0.2);
      color: var(--fg);
      display: grid;
      place-items: center;
      flex: none;
    }
    .size {
      font-weight: 700;
      font-size: 13px;
    }
    .size span span {
      font-size: 18px;
    }
    .text {
      flex: 1;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      padding: 12px 22px 32px;
      font-weight: 750;
      line-height: 1.3;
      letter-spacing: -0.01em;
    }
    .text p {
      margin: 0 0 0.9em;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .text .none {
      font-size: 18px;
      font-weight: 600;
      color: var(--soft);
    }
    .lyrics :focus-visible {
      outline: 2.5px solid var(--fg);
      outline-offset: 2px;
    }
    footer {
      padding: 10px 18px calc(14px + env(safe-area-inset-bottom));
      background: rgba(0, 0, 0, 0.22);
      border-radius: 18px 18px 0 0;
    }
    .seek {
      display: block;
      width: 100%;
      margin: 6px 0 2px;
      accent-color: var(--fg);
    }
    .times {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--soft);
      font-variant-numeric: tabular-nums;
    }
    .controls {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      align-items: center;
      justify-items: center;
      margin-top: 4px;
    }
    .ctl {
      min-width: 48px;
      min-height: 44px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--fg);
      font-weight: 700;
      font-size: 14px;
      display: grid;
      place-items: center;
    }
    .ctl[aria-pressed='true'] {
      background: rgba(255, 255, 255, 0.24);
    }
    .play {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 0;
      background: var(--fg);
      color: var(--bg);
      display: grid;
      place-items: center;
    }
    .listen {
      margin: 2px 0 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--soft);
    }
    .voices {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .voices button {
      min-height: 48px;
      border-radius: 12px;
      border: 0;
      background: var(--fg);
      color: var(--bg);
      font-weight: 700;
    }
    .voices button:disabled {
      background: transparent;
      color: var(--soft);
      border: 1.5px dashed var(--soft);
    }
  `,
})
export class LyricsView {
  protected readonly lyrics = inject(LyricsService);
  protected readonly player = inject(PlayerService);
  private readonly store = inject(ChoraleStore);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly voices = VOICES;
  protected readonly clock = clock;

  protected readonly song = computed(() => this.store.songById(this.lyrics.songId()));
  protected readonly stanzas = computed(() => splitStanzas(this.song()?.lyrics ?? ''));
  /** Voix en cours de lecture si c'est ce morceau qui joue, sinon null */
  protected readonly here = computed((): VoiceKey | null => {
    const t = this.player.track();
    return t?.songId && t.songId === this.lyrics.songId() ? t.voice : null;
  });
  protected readonly voiceLabel = computed(() => {
    const v = this.here();
    if (!v) return 'Paroles';
    const loop = this.player.playlistLabel();
    return VOICE_NAME[v] + (loop ? ` · boucle ${loop}` : '');
  });
  protected readonly background = computed(() => {
    const v = this.here();
    return v ? `var(--deep-${v})` : 'var(--deep-accent)';
  });
  protected readonly fontSize = computed(() => LYRICS_SIZES[this.lyrics.sizeIndex()]);
  protected readonly sizeName = computed(
    () => ['normale', 'grande', 'très grande'][this.lyrics.sizeIndex()],
  );
  protected readonly speedShort = computed(
    () => String(this.player.speed()).replace('.', ',') + '×',
  );
  private opener: HTMLElement | null = null;

  constructor() {
    // Sélection en boucle : quand le morceau suivant démarre, ses paroles suivent
    let lastSong: string | null = null;
    effect(() => {
      const now = this.player.track()?.songId ?? null;
      untracked(() => {
        if (now && lastSong && now !== lastSong && this.lyrics.songId() === lastSong) {
          this.lyrics.open(now);
        }
      });
      lastSong = now;
    });
    // Ouverture / fermeture ; le focus revient au bouton qui a ouvert les paroles
    afterRenderEffect(() => {
      const open = !!this.song();
      const el = this.dlg().nativeElement;
      if (open && !el.hasAttribute('open')) {
        this.opener = document.activeElement as HTMLElement | null;
        openModal(el);
        el.querySelector<HTMLElement>('.round')?.focus();
      } else if (!open && el.hasAttribute('open')) {
        closeModal(el);
        this.opener?.focus?.();
        this.opener = null;
      }
    });
  }

  protected position(): number {
    return Math.round(this.player.progress() * 1000);
  }

  protected seek(e: Event): void {
    this.player.seek(Number((e.target as HTMLInputElement).value) / 1000);
  }

  protected listen(voice: VoiceKey): void {
    const s = this.song();
    const rec = s?.voices[voice];
    if (!s || !rec) return;
    this.player.play({ hash: rec.hash, title: s.title, sub: '', songId: s.id, voice });
  }
}

/** Couplets : séparés par une ligne vide */
export function splitStanzas(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
