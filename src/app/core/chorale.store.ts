import { computed, Injectable, signal } from '@angular/core';
import { choirName, firebaseConfig } from '../config';
import { Backend, ClassifyRequest, ClassifyResult, InboxFile, Song, VoiceKey } from './models';
import { keyFromText, sortSongs } from './utils';

export const KEY_STORE = 'chorale-cle';
const EMU_STORE = 'chorale-emu';

const INVALID =
  "Ce lien n'est pas (ou plus) valide. Demandez le lien à jour dans le groupe WhatsApp.";
const OFFLINE = 'Pas de connexion internet. Réessayez une fois connecté.';

/** Projet fictif des émulateurs locaux (npm run emulators, puis http://localhost:4200/?emu) */
const EMULATOR_CONFIG = {
  apiKey: 'demo-key',
  authDomain: 'localhost',
  projectId: 'demo-chorale',
  storageBucket: 'demo-chorale.appspot.com',
  appId: 'demo-app',
};

export type Status = 'loading' | 'gate' | 'ready' | 'error';

function readStore(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function readSession(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

function writeSession(k: string, v: string): void {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    // sans importance : développement local uniquement
  }
}

function writeStore(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // stockage indisponible (navigation privée) : la clé sera redemandée
  }
}

/** État partagé de l'app : accès, morceaux et audios à classer */
@Injectable({ providedIn: 'root' })
export class ChoraleStore {
  readonly choirName = choirName;
  readonly status = signal<Status>('loading');
  readonly gateMessage = signal('');
  readonly demo = signal(false);
  /** Clé de la chorale retenue sur ce téléphone */
  readonly key = signal<string | null>(null);
  readonly songs = signal<Song[]>([]);
  readonly songsLoaded = signal(false);
  readonly inbox = signal<InboxFile[]>([]);
  readonly inboxLoaded = signal(false);
  readonly sortedSongs = computed(() => sortSongs(this.songs()));
  readonly sortedInbox = computed(() =>
    [...this.inbox()].sort((a, b) => a.createdAt - b.createdAt),
  );

  private backend: Backend | null = null;
  private unsubscribe: (() => void)[] = [];

  private get api(): Backend {
    if (!this.backend) throw new Error('Accès aux données non initialisé');
    return this.backend;
  }

  async init(search = globalThis.location?.search ?? ''): Promise<void> {
    const params = new URLSearchParams(search);
    const local = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname ?? '');
    // ?emu est retenu pour la session (les liens internes ne gardent pas les paramètres)
    const emulators = local && (params.has('emu') || readSession(EMU_STORE) === '1');
    if (emulators) writeSession(EMU_STORE, '1');
    const demo = !emulators && (firebaseConfig.apiKey === 'REMPLACER' || params.has('demo'));
    try {
      if (demo) {
        const { createDemoBackend } = await import('./demo-backend');
        this.backend = createDemoBackend();
        this.demo.set(true);
        this.start();
        return;
      }
      const { createFirebaseBackend } = await import('./firebase-backend');
      this.backend = await createFirebaseBackend(emulators ? EMULATOR_CONFIG : firebaseConfig, {
        emulators,
      });
    } catch (e) {
      console.error(e);
      this.status.set('error');
      return;
    }
    const k = keyFromText(params.get('cle') ?? '') || readStore(KEY_STORE);
    if (!k) {
      this.status.set('gate');
      return;
    }
    await this.tryKey(k);
  }

  /** Lien ou clé saisi(e) sur l'écran d'accueil */
  async submitKey(text: string): Promise<boolean> {
    const k = keyFromText(text);
    return k ? this.tryKey(k) : false;
  }

  private async tryKey(k: string): Promise<boolean> {
    if (await this.api.join(k)) {
      writeStore(KEY_STORE, k);
      this.key.set(k);
      this.start();
      return true;
    }
    this.gateMessage.set(globalThis.navigator?.onLine === false ? OFFLINE : INVALID);
    this.status.set('gate');
    return false;
  }

  private start(): void {
    this.stop();
    const b = this.api;
    this.unsubscribe = [
      b.onSongs(
        (s) => {
          this.songs.set(s);
          this.songsLoaded.set(true);
        },
        (e) => this.onListenError(e),
      ),
      b.onInbox(
        (i) => {
          this.inbox.set(i);
          this.inboxLoaded.set(true);
        },
        (e) => this.onListenError(e),
      ),
    ];
    this.status.set('ready');
  }

  private stop(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
  }

  private onListenError(e: unknown): void {
    console.warn(e);
    // Clé supprimée entre-temps : l'accès est coupé, on redemande le lien
    if ((e as { code?: string } | null)?.code === 'permission-denied') {
      this.stop();
      this.gateMessage.set(INVALID);
      this.status.set('gate');
    }
  }

  songById(id: string | null): Song | undefined {
    return id ? this.songs().find((s) => s.id === id) : undefined;
  }

  exists(hash: string): Promise<boolean> {
    return this.api.exists(hash);
  }

  upload(
    file: Blob,
    name: string,
    hash: string,
    type: string,
    onProgress?: (f: number) => void,
  ): Promise<void> {
    return this.api.upload(file, name, hash, type, onProgress);
  }

  classify(req: ClassifyRequest): Promise<ClassifyResult> {
    return this.api.classify(req);
  }

  unclassify(songId: string, voice: VoiceKey, hash: string): Promise<void> {
    return this.api.unclassify(songId, voice, hash);
  }

  removeInbox(hash: string): Promise<void> {
    return this.api.removeInbox(hash);
  }

  renameSong(songId: string, title: string): Promise<void> {
    return this.api.renameSong(songId, title);
  }

  deleteSong(songId: string): Promise<void> {
    return this.api.deleteSong(songId);
  }

  url(hash: string): Promise<string> {
    return this.api.url(hash);
  }
}
