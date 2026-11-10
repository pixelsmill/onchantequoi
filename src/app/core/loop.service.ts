import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ChoraleStore } from './chorale.store';
import { FIRST_CHOIR, VoiceKey } from './models';
import { pickVoice, PlayerService } from './player.service';

/** Sélection retenue par chorale : chorale-boucle-1, chorale-boucle-2… */
const IDS_STORE = 'chorale-boucle';
const VOICE_STORE = 'chorale-boucle-voix';
const VOICE_KEYS: readonly VoiceKey[] = ['S', 'A', 'H', 'T'];

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // navigation privée : la sélection ne sera pas retenue
  }
}

function readIds(choir: string): string[] {
  // Avant plusieurs chorales, la sélection de la chorale 1 était sous « chorale-boucle »
  const raw = read(`${IDS_STORE}-${choir}`) ?? (choir === FIRST_CHOIR ? read(IDS_STORE) : null);
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Morceaux choisis (picto boucle) et voix, retenus sur ce téléphone */
@Injectable({ providedIn: 'root' })
export class LoopService {
  private readonly store = inject(ChoraleStore);
  private readonly player = inject(PlayerService);
  private readonly ids = signal<string[]>(readIds(this.store.choir()));
  readonly voice = signal<VoiceKey>(
    VOICE_KEYS.find((v) => v === read(VOICE_STORE)) ?? 'T',
  );
  /** Morceaux choisis qui existent encore, dans l'ordre de la liste */
  readonly songs = computed(() => {
    const chosen = new Set(this.ids());
    return this.store.sortedSongs().filter((s) => chosen.has(s.id));
  });
  /** Morceaux choisis sans la voix demandée : joués en « Tous » (ou sautés) */
  readonly fallbacks = computed(() =>
    this.songs().filter((s) => pickVoice(s, this.voice()) !== this.voice()),
  );
  /** La sélection est en cours de lecture */
  readonly active = computed(() => !!this.player.playlist());

  constructor() {
    // Autre chorale ouverte : sa propre sélection
    effect(() => {
      const c = this.store.choir();
      untracked(() => this.ids.set(readIds(c)));
    });
  }

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  toggle(id: string): void {
    this.ids.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    this.save();
    if (this.active()) this.restart();
  }

  setVoice(v: VoiceKey): void {
    this.voice.set(v);
    write(VOICE_STORE, v);
    if (this.active()) this.restart();
  }

  clear(): void {
    if (this.active()) this.player.stop();
    this.ids.set([]);
    this.save();
  }

  /** À appeler dans le geste de l'utilisateur. false si rien n'est jouable. */
  start(): boolean {
    return this.player.playList(
      this.songs().map((s) => s.id),
      this.voice(),
    );
  }

  /** Sélection ou voix changée pendant la lecture : on repart du morceau en cours */
  private restart(): void {
    const ids = this.songs().map((s) => s.id);
    const current = this.player.track()?.songId;
    const voice = this.voice();
    const at = Math.max(0, current ? ids.indexOf(current) : 0);
    const t = this.player.track();
    // Même morceau, même voix jouée : on ne coupe pas, on met juste la liste à jour
    if (t && ids[at] === t.songId && pickVoice(this.store.songById(t.songId), voice) === t.voice) {
      this.player.playlist.set({ ids, voice, index: at });
      return;
    }
    if (!this.player.playList(ids, voice, at)) this.player.stop();
  }

  private save(): void {
    // On ne garde que les morceaux qui existent encore
    const known = new Set(this.store.songs().map((s) => s.id));
    const ids = this.store.songsLoaded() ? this.ids().filter((id) => known.has(id)) : this.ids();
    write(`${IDS_STORE}-${this.store.choir()}`, JSON.stringify(ids));
  }
}
