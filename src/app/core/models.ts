export type VoiceKey = 'S' | 'A' | 'H' | 'T';

export interface Voice {
  key: VoiceKey;
  short: string;
  long: string;
}

export const VOICES: readonly Voice[] = [
  { key: 'S', short: 'S', long: 'Soprane' },
  { key: 'A', short: 'A', long: 'Alto' },
  { key: 'H', short: 'H', long: 'Hommes' },
  { key: 'T', short: 'Tous', long: 'Tous' },
];

export const VOICE_NAME: Record<VoiceKey, string> = {
  S: 'Soprane',
  A: 'Alto',
  H: 'Hommes',
  T: 'Tous',
};

export interface Recording {
  hash: string;
  at: number;
}

/** songs/{id} */
export interface Song {
  id: string;
  title: string;
  voices: Partial<Record<VoiceKey, Recording>>;
  createdAt?: number;
  updatedAt?: number;
}

/** files/{sha256} en attente de classement */
export interface InboxFile {
  hash: string;
  name?: string;
  size?: number;
  type?: string;
  source?: string;
  createdAt: number;
}

export interface ClassifyRequest {
  hash: string;
  voice: VoiceKey;
  /** Morceau existant, ou null pour en créer un avec newTitle */
  songId: string | null;
  newTitle: string | null;
}

export type ClassifyResult =
  | { ok: true; songId: string }
  | { ok: false; reason: 'already' | 'error' };

/** Accès aux données : même interface pour Firebase et pour le mode démo */
export interface Backend {
  readonly demo: boolean;
  /** Rejoint la chorale avec la clé. Renvoie true si l'accès est accordé. */
  join(key: string): Promise<boolean>;
  onSongs(cb: (songs: Song[]) => void, onError: (e: unknown) => void): () => void;
  onInbox(cb: (files: InboxFile[]) => void, onError: (e: unknown) => void): () => void;
  exists(hash: string): Promise<boolean>;
  upload(
    file: Blob,
    name: string,
    hash: string,
    type: string,
    onProgress?: (fraction: number) => void,
  ): Promise<void>;
  /** Classe un audio (le premier qui classe gagne). Remplace l'ancien enregistrement de la même voix. */
  classify(req: ClassifyRequest): Promise<ClassifyResult>;
  /** « Mal classé ? » : remet l'audio dans À classer (s'il occupe toujours cette voix) */
  unclassify(songId: string, voice: VoiceKey, hash: string): Promise<void>;
  removeInbox(hash: string): Promise<void>;
  renameSong(songId: string, title: string): Promise<void>;
  deleteSong(songId: string): Promise<void>;
  url(hash: string): Promise<string>;
}
