import { computed, inject, Injectable, signal } from '@angular/core';
import { ChoraleStore } from './chorale.store';
import { Song, VOICE_NAME, VoiceKey } from './models';
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

/** Sélection lue en boucle : les morceaux dans l'ordre, pour une voix */
export interface Playlist {
  ids: string[];
  voice: VoiceKey;
  /** Morceau en cours dans ids */
  index: number;
}

/**
 * Enregistrement à jouer pour un morceau de la sélection : la voix choisie,
 * sinon « Tous ». null si le morceau n'a ni l'une ni l'autre.
 */
export function pickVoice(song: Song | undefined, voice: VoiceKey): VoiceKey | null {
  if (!song) return null;
  if (song.voices[voice]) return voice;
  return song.voices.T ? 'T' : null;
}

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
  /** Sélection en cours de lecture (null = un seul enregistrement) */
  readonly playlist = signal<Playlist | null>(null);
  /** « 2/3 » quand une sélection est lue */
  readonly playlistLabel = computed(() => {
    const p = this.playlist();
    return p ? `${p.index + 1}/${p.ids.length}` : '';
  });
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
    a.addEventListener('ended', () => {
      this.playing.set(false);
      // Sélection : morceau suivant (le dernier repart au premier)
      if (this.playlist() && this.track()) this.next();
    });
    a.addEventListener('timeupdate', () => active() && this.time.set(a.currentTime));
    const dur = () => active() && this.duration.set(Number.isFinite(a.duration) ? a.duration : 0);
    a.addEventListener('durationchange', dur);
    a.addEventListener('loadedmetadata', dur);
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

  /** À appeler dans le geste de l'utilisateur (toucher d'un bouton de lecture) */
  play(t: Track): Promise<void> {
    this.setPlaylist(null);
    return this.load(t);
  }

  /**
   * Lit une sélection de morceaux en boucle, pour une voix (« Tous » si elle manque).
   * false si aucun morceau n'a d'enregistrement à jouer.
   */
  playList(ids: string[], voice: VoiceKey, from = 0): boolean {
    const p = { ids: [...ids], voice, index: from };
    const i = this.playable(p, from, 1);
    if (i < 0) return false;
    this.setPlaylist({ ...p, index: i });
    this.loadIndex();
    return true;
  }

  /** Morceau suivant (ou précédent) de la sélection */
  next(step: 1 | -1 = 1): void {
    const p = this.playlist();
    if (!p) return;
    const i = this.playable(p, p.index + step, step);
    if (i < 0) {
      this.stop();
      return;
    }
    this.playlist.set({ ...p, index: i });
    this.loadIndex();
  }

  /** Premier morceau jouable à partir de start (en tournant), -1 s'il n'y en a aucun */
  private playable(p: Playlist, start: number, step: 1 | -1): number {
    const n = p.ids.length;
    for (let k = 0; k < n; k++) {
      const i = (((start + k * step) % n) + n) % n;
      if (pickVoice(this.store.songById(p.ids[i]), p.voice)) return i;
    }
    return -1;
  }

  private loadIndex(): void {
    const p = this.playlist();
    if (!p) return;
    const song = this.store.songById(p.ids[p.index]);
    const voice = pickVoice(song, p.voice);
    const rec = voice && song?.voices[voice];
    if (!song || !voice || !rec) return;
    this.load({ hash: rec.hash, title: song.title, sub: '', songId: song.id, voice });
    // Le suivant est préparé : il démarre sans attendre à la fin de celui-ci
    const after = this.store.songById(p.ids[this.playable(p, p.index + 1, 1)]);
    const v2 = pickVoice(after, p.voice);
    if (after && v2) this.prefetch(after.voices[v2]!.hash);
  }

  private setPlaylist(p: Playlist | null): void {
    this.playlist.set(p);
    const ms = globalThis.navigator?.mediaSession;
    if (!ms) return;
    // Écran verrouillé : « suivant / précédent » seulement pendant une sélection
    for (const [action, fn] of [
      ['nexttrack', () => this.next(1)],
      ['previoustrack', () => this.next(-1)],
    ] as const) {
      try {
        ms.setActionHandler(action, p ? fn : null);
      } catch {
        // action non gérée par ce navigateur
      }
    }
  }

  private async load(t: Track): Promise<void> {
    const a = this.audio;
    if (!a) return;
    this.track.set(t);
    this.time.set(0);
    this.duration.set(0);
    this.updateMediaSession(t);
    // iOS n'autorise la lecture que dans le geste : si l'adresse n'est pas encore connue,
    // on lance tout de suite un silence sur le même élément pour le « débloquer »
    if (!this.known.has(t.hash)) this.unlock(a);
    try {
      await this.start(a, t, false);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      try {
        // Adresse périmée (fichier redéposé) : une seconde chance avec une adresse neuve
        await this.start(a, t, true);
      } catch (e2) {
        if (e2 instanceof DOMException && e2.name === 'AbortError') return;
        console.warn(e2);
        if (this.track() !== t) return;
        this.playing.set(false);
        this.toast.show(
          globalThis.navigator?.onLine === false
            ? 'Pas de connexion : impossible d’écouter pour le moment'
            : 'Lecture impossible sur ce téléphone',
        );
      }
    }
  }

  private async start(a: HTMLAudioElement, t: Track, refresh: boolean): Promise<void> {
    if (refresh) this.known.delete(t.hash);
    const url = this.known.get(t.hash) ?? (await this.store.url(t.hash, refresh));
    this.known.set(t.hash, url);
    if (this.track() !== t) return; // autre choix entre-temps
    a.src = url;
    a.loop = this.loop();
    a.defaultPlaybackRate = a.playbackRate = this.speed();
    await a.play();
  }

  toggle(): void {
    const a = this.audio;
    if (!a || !this.track()) return;
    if (a.paused) a.play().catch((e) => console.warn(e));
    else a.pause();
  }

  stop(): void {
    const a = this.audio;
    this.setPlaylist(null);
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

  private unlock(a: HTMLAudioElement): void {
    this.silent ||= URL.createObjectURL(silentWav());
    const silent = this.silent;
    a.src = silent;
    a.play()
      .then(() => {
        if (a.src === silent) a.pause();
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
      artist: t.voice ? VOICE_NAME[t.voice] : this.store.choirName(),
      album: this.store.choirName(),
      artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}
