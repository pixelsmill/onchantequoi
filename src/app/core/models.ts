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
  /** Durée en secondes (calculée au dépôt) */
  duration?: number;
  createdAt: number;
}

/** Ce qu'on enregistre avec un audio déposé */
export interface UploadMeta {
  name: string;
  /** Empreinte SHA-256 = identifiant du fichier */
  hash: string;
  type: string;
  duration?: number;
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

/** ok = accès ouvert ; denied = clé inconnue ou supprimée ; network = impossible de vérifier */
export type JoinResult = 'ok' | 'denied' | 'network';

/** Accès aux données : même interface pour Firebase et pour le mode démo */
export interface Backend {
  readonly demo: boolean;
  /** Rejoint la chorale avec la clé */
  join(key: string): Promise<JoinResult>;
  onSongs(cb: (songs: Song[]) => void, onError: (e: unknown) => void): () => void;
  onInbox(cb: (files: InboxFile[]) => void, onError: (e: unknown) => void): () => void;
  exists(hash: string): Promise<boolean>;
  upload(file: Blob, meta: UploadMeta, onProgress?: (fraction: number) => void): Promise<void>;
  /** Classe un audio (le premier qui classe gagne). Remplace l'ancien enregistrement de la même voix. */
  classify(req: ClassifyRequest): Promise<ClassifyResult>;
  /** « Mal classé ? » : remet l'audio dans À classer. false s'il n'occupe plus cette voix. */
  unclassify(songId: string, voice: VoiceKey, hash: string): Promise<boolean>;
  /** Supprime un audio encore à classer. false s'il a été classé entre-temps. */
  removeInbox(hash: string): Promise<boolean>;
  renameSong(songId: string, title: string): Promise<void>;
  /**
   * Supprime un morceau et ses enregistrements (ceux montrés à l'utilisateur : hashes).
   * false si le morceau a changé entre-temps (voix ajoutée ou remplacée).
   */
  deleteSong(songId: string, hashes: string[]): Promise<boolean>;
  /** Adresse de lecture ; refresh pour ignorer le cache (jeton périmé) */
  url(hash: string, refresh?: boolean): Promise<string>;
}
