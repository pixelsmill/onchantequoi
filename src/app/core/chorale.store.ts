import { computed, Injectable, signal } from '@angular/core';
import { choirName, demoOnly, firebaseConfig, teacherName } from '../config';
import {
  Backend,
  ChoirMeta,
  ClassifyRequest,
  ClassifyResult,
  FIRST_CHOIR,
  InboxFile,
  Song,
  UploadMeta,
  VoiceKey,
} from './models';
import { choirFromText, isChoirId, keyFromText, sortSongs } from './utils';

/** Ancienne clé unique (avant plusieurs chorales) : reprise comme clé de la chorale 1 */
export const KEY_STORE = 'chorale-cle';
/** Chorales de ce téléphone : { "1": { key, name }, "2": … } */
export const CHOIRS_STORE = 'chorale-cles';
/** Chorale ouverte en dernier */
export const ACTIVE_STORE = 'chorale-active';
const EMU_STORE = 'chorale-emu';
const DEMO_STORE = 'chorale-demo';

const INVALID =
  "Ce lien n'est pas (ou plus) valide. Demandez le lien à jour dans le groupe de la chorale.";
const NETWORK =
  'Impossible de vérifier le lien pour le moment : vérifiez la connexion internet, puis réessayez.';

/** Projet fictif des émulateurs locaux (npm run emulators, puis http://localhost:4200/?emu) */
const EMULATOR_CONFIG = {
  apiKey: 'demo-key',
  authDomain: 'localhost',
  projectId: 'demo-chorale',
  storageBucket: 'demo-chorale.appspot.com',
  appId: 'demo-app',
};

export type Status = 'loading' | 'gate' | 'ready' | 'error';

/** Une chorale retenue sur ce téléphone */
export interface SavedChoir {
  key: string;
  /** Nom affiché (lu dans choirs/{id} à la dernière ouverture) */
  name?: string;
}

export interface ChoirEntry {
  id: string;
  name: string;
}

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

/** Chorales retenues ; l'ancienne clé unique devient celle de la chorale 1 */
export function readSavedChoirs(): Record<string, SavedChoir> {
  const out: Record<string, SavedChoir> = {};
  try {
    const v: unknown = JSON.parse(readStore(CHOIRS_STORE) ?? '{}');
    if (v && typeof v === 'object') {
      for (const [id, c] of Object.entries(v as Record<string, unknown>)) {
        const key = (c as SavedChoir | null)?.key;
        if (isChoirId(id) && typeof key === 'string' && key) {
          const name = (c as SavedChoir).name;
          out[id] = typeof name === 'string' && name ? { key, name } : { key };
        }
      }
    }
  } catch {
    // illisible : on repart de l'ancienne clé
  }
  const legacy = readStore(KEY_STORE);
  if (legacy && !out[FIRST_CHOIR]) out[FIRST_CHOIR] = { key: legacy };
  return out;
}

/** Nom affiché d'une chorale dont on ne connaît pas encore le nom */
export function defaultChoirName(id: string): string {
  return id === FIRST_CHOIR ? choirName : `Chorale ${id}`;
}

/** État partagé de l'app : accès, chorale active, morceaux et audios à classer */
@Injectable({ providedIn: 'root' })
export class ChoraleStore {
  readonly status = signal<Status>('loading');
  readonly gateMessage = signal('');
  readonly demo = signal(false);
  /** Chorale active (« 1 », « 2 »…) */
  readonly choir = signal(FIRST_CHOIR);
  /** Clé de la chorale active */
  readonly key = signal<string | null>(null);
  readonly choirName = signal(choirName);
  /** Chef de chœur de la chorale active */
  readonly teacher = signal(teacherName);
  private readonly saved = signal<Record<string, SavedChoir>>({});
  /** Chorales de ce téléphone, dans l'ordre de leur numéro */
  readonly choirs = computed((): ChoirEntry[] =>
    Object.entries(this.saved())
      .map(([id, c]) => ({ id, name: c.name || defaultChoirName(id) }))
      .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true })),
  );
  /** Les autres chorales de ce téléphone (pour en changer) */
  readonly otherChoirs = computed(() => this.choirs().filter((c) => c.id !== this.choir()));
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
    // ?demo aussi, pour ne pas basculer sur les vraies données au rechargement
    if (params.has('demo')) writeSession(DEMO_STORE, '1');
    const demo =
      !emulators &&
      (firebaseConfig.apiKey === 'REMPLACER' ||
        demoOnly ||
        params.has('demo') ||
        readSession(DEMO_STORE) === '1');
    try {
      if (demo) {
        const { createDemoBackend, DEMO_CHOIRS } = await import('./demo-backend');
        this.backend = createDemoBackend();
        this.demo.set(true);
        // Démo : le téléphone est dans les deux chorales fictives (rien n'est retenu)
        this.saved.set(
          Object.fromEntries(
            Object.entries(DEMO_CHOIRS).map(([id, m]) => [id, { key: 'demo', name: m.name }]),
          ),
        );
        await this.open(isChoirId(params.get('c')) ? params.get('c')! : FIRST_CHOIR, 'demo', false);
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
    this.saved.set(readSavedChoirs());
    // Lien ouvert : sa chorale (1 si le lien n'en indique pas) ; sinon la dernière ouverte
    const linkKey = keyFromText(params.get('cle') ?? '');
    const linkChoir = isChoirId(params.get('c')) ? params.get('c')! : FIRST_CHOIR;
    const last = readStore(ACTIVE_STORE);
    const c = linkKey
      ? linkChoir
      : last && this.saved()[last]
        ? last
        : (this.choirs()[0]?.id ?? FIRST_CHOIR);
    const k = linkKey || this.saved()[c]?.key;
    this.choir.set(c);
    if (!k) {
      this.status.set('gate');
      return;
    }
    await this.open(c, k, false);
  }

  /** Lien ou clé saisi(e) sur l'écran d'accueil */
  async submitKey(text: string): Promise<boolean> {
    const k = keyFromText(text);
    return k ? this.open(choirFromText(text) ?? FIRST_CHOIR, k, true) : false;
  }

  /** Passe à une autre chorale de ce téléphone */
  async switchChoir(id: string): Promise<void> {
    const c = this.saved()[id];
    if (!c || id === this.choir()) return;
    await this.open(id, c.key, false);
  }

  /** Ouvre une chorale avec sa clé : écouteurs, nom et chef */
  private async open(c: string, k: string, typed: boolean): Promise<boolean> {
    this.stop();
    this.choir.set(c);
    this.choirName.set(this.saved()[c]?.name || defaultChoirName(c));
    this.songs.set([]);
    this.inbox.set([]);
    this.songsLoaded.set(false);
    this.inboxLoaded.set(false);
    this.status.set('loading');
    const result = await this.api.join(k, c);
    if (result === 'ok') {
      this.key.set(k);
      this.remember(c, { key: k });
      this.start();
      this.applyMeta(c, await this.api.choirMeta());
      return true;
    }
    if (result === 'network' && !typed) {
      // Au démarrage : écran « Connexion impossible » avec « Réessayer » (la clé est gardée)
      this.status.set('error');
      return false;
    }
    this.gateMessage.set(result === 'network' ? NETWORK : INVALID);
    this.status.set('gate');
    return false;
  }

  private applyMeta(c: string, meta: ChoirMeta | null): void {
    if (this.choir() !== c) return; // autre chorale ouverte entre-temps
    const name = meta?.name || this.saved()[c]?.name || defaultChoirName(c);
    this.choirName.set(name);
    this.teacher.set(meta?.teacher || teacherName);
    this.remember(c, { name });
  }

  private remember(c: string, patch: Partial<SavedChoir>): void {
    const prev = this.saved()[c];
    const next = { ...prev, ...patch } as SavedChoir;
    this.saved.update((s) => ({ ...s, [c]: next }));
    if (this.demo()) return;
    writeStore(CHOIRS_STORE, JSON.stringify(this.saved()));
    writeStore(ACTIVE_STORE, c);
    // Compatibilité : une version plus ancienne de l'app relit la clé de la chorale 1 ici
    if (c === FIRST_CHOIR && next.key) writeStore(KEY_STORE, next.key);
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

  upload(file: Blob, meta: UploadMeta, onProgress?: (f: number) => void): Promise<void> {
    return this.api.upload(file, meta, onProgress);
  }

  classify(req: ClassifyRequest): Promise<ClassifyResult> {
    return this.api.classify(req);
  }

  unclassify(songId: string, voice: VoiceKey, hash: string): Promise<boolean> {
    return this.api.unclassify(songId, voice, hash);
  }

  removeInbox(hash: string): Promise<boolean> {
    return this.api.removeInbox(hash);
  }

  renameSong(songId: string, title: string): Promise<void> {
    return this.api.renameSong(songId, title);
  }

  setLyrics(songId: string, lyrics: string): Promise<void> {
    return this.api.setLyrics(songId, lyrics);
  }

  deleteSong(songId: string, hashes: string[]): Promise<boolean> {
    return this.api.deleteSong(songId, hashes);
  }

  url(hash: string, refresh = false): Promise<string> {
    return this.api.url(hash, refresh);
  }
}
