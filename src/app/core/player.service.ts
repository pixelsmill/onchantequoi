import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { choirName } from '../config';
import { ChoraleStore } from './chorale.store';
import { VOICE_NAME, VoiceKey } from './models';
import { ToastService } from './toast.service';

export interface Track {
  hash: string;
  title: string;
  /** Sous-titre quand ce n'est pas une voix classée (« reçu il y a 5 min ») */
  sub: string;
  songId: string | null;
  voice: VoiceKey | null;
}

export const SPEEDS = [1, 0.85, 0.7] as const;

/** 0,1 s de silence : sert à « débloquer » l'audio sur iPhone au premier toucher */
function silentWav(): Blob {
  const n = 800;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  return new Blob([v.buffer], { type: 'audio/wav' });
}

/** Lecteur unique de l'app : −10 s, vitesses 1 / 0,85 / 0,7 (même hauteur de notes), boucle */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly store = inject(ChoraleStore);
  private readonly toast = inject(ToastService);
  private readonly doc = inject(DOCUMENT);
  private readonly audio: HTMLAudioElement | null =
    typeof Audio === 'undefined' ? null : new Audio();
  /** Adresses déjà connues : la lecture démarre dans le geste même (exigé par iOS) */
  private readonly known = new Map<string, string>();
  private silent = '';

  readonly track = signal<Track | null>(null);
  readonly playing = signal(false);
  readonly time = signal(0);
  readonly duration = signal(0);
  readonly speedIndex = signal(0);
  readonly speed = computed(() => SPEEDS[this.speedIndex()]);
  readonly speedLabel = computed(() => `Vitesse ${String(this.speed()).replace('.', ',')}×`);
  readonly loop = signal(false);
  readonly progress = computed(() => (this.duration() ? this.time() / this.duration() : 0));

  constructor() {
    const a = this.audio;
    if (!a) return;
    a.preload = 'auto';
    Object.assign(a, { preservesPitch: true, webkitPreservesPitch: true });
    const active = () => !!this.track();
    a.addEventListener('playing', () => active() && this.playing.set(true));
    a.addEventListener('play', () => active() && this.playing.set(true));
    a.addEventListener('pause', () => this.playing.set(false));
    a.addEventListener('ended', () => this.playing.set(false));
    a.addEventListener('timeupdate', () => active() && this.time.set(a.currentTime));
    const dur = () => active() && this.duration.set(Number.isFinite(a.duration) ? a.duration : 0);
    a.addEventListener('durationchange', dur);
    a.addEventListener('loadedmetadata', dur);
    // Débloque l'audio au premier geste. Pour un doigt, seuls touchend et click comptent
    // comme geste sur iOS (pas pointerdown) ; en capture, avant le bouton touché.
    const gestures = ['touchend', 'click', 'keydown'];
    const unlock = () => {
      this.unlock();
      gestures.forEach((g) => this.doc.removeEventListener(g, unlock, true));
    };
    gestures.forEach((g) => this.doc.addEventListener(g, unlock, true));
    this.setupMediaSession();
  }

  isCurrent(songId: string, voice: VoiceKey): boolean {
    const t = this.track();
    return !!t && t.songId === songId && t.voice === voice;
  }

  isPlayingHash(hash: string): boolean {
    return this.track()?.hash === hash && this.playing();
  }

  /** À appeler dès le toucher (pointerdown) pour connaître l'adresse avant le clic */
  prefetch(hash: string): void {
    if (this.known.has(hash)) return;
    this.store
      .url(hash)
      .then((u) => this.known.set(hash, u))
      .catch(() => undefined);
  }

  async play(t: Track): Promise<void> {
    const a = this.audio;
    if (!a) return;
    this.track.set(t);
    this.time.set(0);
    this.duration.set(0);
    this.updateMediaSession(t);
    try {
      const url = this.known.get(t.hash) ?? (await this.store.url(t.hash));
      this.known.set(t.hash, url);
      if (this.track() !== t) return; // autre choix entre-temps
      a.src = url;
      a.loop = this.loop();
      a.defaultPlaybackRate = a.playbackRate = this.speed();
      await a.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.warn(e);
      this.playing.set(false);
      this.toast.show('Lecture impossible sur ce téléphone');
    }
  }

  toggle(): void {
    const a = this.audio;
    if (!a || !this.track()) return;
    if (a.paused) a.play().catch((e) => console.warn(e));
    else a.pause();
  }

  stop(): void {
    const a = this.audio;
    this.track.set(null);
    this.playing.set(false);
    if (!a) return;
    a.pause();
    a.removeAttribute('src');
    a.load();
  }

  back(seconds = 10): void {
    if (this.audio) this.audio.currentTime = Math.max(0, this.audio.currentTime - seconds);
  }

  forward(seconds = 10): void {
    const a = this.audio;
    if (a && a.duration) a.currentTime = Math.min(a.duration, a.currentTime + seconds);
  }

  cycleSpeed(): void {
    this.speedIndex.update((i) => (i + 1) % SPEEDS.length);
    if (this.audio) this.audio.defaultPlaybackRate = this.audio.playbackRate = this.speed();
  }

  toggleLoop(): void {
    this.loop.update((l) => !l);
    if (this.audio) this.audio.loop = this.loop();
  }

  /** fraction entre 0 et 1 */
  seek(fraction: number): void {
    const a = this.audio;
    if (a && a.duration) {
      a.currentTime = fraction * a.duration;
      this.time.set(a.currentTime);
    }
  }

  private unlock(): void {
    const a = this.audio;
    if (!a || this.silent) return;
    this.silent = URL.createObjectURL(silentWav());
    a.src = this.silent;
    a.play()
      .then(() => {
        if (a.src === this.silent) a.pause();
      })
      .catch(() => undefined);
  }

  private setupMediaSession(): void {
    const ms = globalThis.navigator?.mediaSession;
    if (!ms) return;
    const on = (action: MediaSessionAction, fn: () => void) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // action non gérée par ce navigateur
      }
    };
    on('play', () => this.toggle());
    on('pause', () => this.toggle());
    on('seekbackward', () => this.back());
    on('seekforward', () => this.forward());
    on('stop', () => this.stop());
  }

  private updateMediaSession(t: Track): void {
    const ms = globalThis.navigator?.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    ms.metadata = new MediaMetadata({
      title: t.title,
      artist: t.voice ? VOICE_NAME[t.voice] : choirName,
      album: choirName,
      artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}
