import { Song } from './models';

const DAY = 86_400_000;
export const WEEK = 7 * DAY;

/** Taille maximale d'un audio, exclue (règles Storage : moins de 40 Mo) */
export const MAX_SIZE = 40 * 1024 * 1024;

/** Types acceptés par le sélecteur de fichiers et le partage Android */
export const ACCEPT = 'audio/*,video/mp4,.mp4,.opus,.ogg,.m4a,.mp3,.aac,.wav';

const AUDIO_EXT: Record<string, string> = {
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

/** Minuscules sans accents, pour comparer et chercher des titres */
export function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function dateShort(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ago(ms: number, now = Date.now()): string {
  const m = Math.round((now - ms) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return 'le ' + dateShort(ms);
}

/** 83 → « 1:23 » */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function extension(name: string | undefined): string {
  const n = name ?? '';
  return n.includes('.') ? (n.split('.').pop() ?? '').toLowerCase() : '';
}

/** Type MIME à enregistrer (les .mp4 audio de WhatsApp arrivent souvent en video/mp4) */
export function guessType(file: { type?: string; name?: string }): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type.split(';')[0];
  return AUDIO_EXT[extension(file.name)] ?? 'audio/ogg';
}

/** Écarte ce qui n'est manifestement pas un audio (photo glissée par erreur…) */
export function isAudioFile(file: { type?: string; name?: string }): boolean {
  const t = (file.type ?? '').split(';')[0];
  if (/^audio\//.test(t) || t === 'video/mp4' || t === 'application/ogg') return true;
  if (!t || t === 'application/octet-stream') return extension(file.name) in AUDIO_EXT;
  return false;
}

export async function sha256(blob: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Extrait la clé d'un lien « https://…/?cle=XXXX » ou d'une clé collée telle quelle */
export function keyFromText(text: string): string {
  const t = (text ?? '').trim();
  try {
    const k = new URL(t).searchParams.get('cle');
    if (k) return k.replace(/[^A-Za-z0-9_-]/g, '');
  } catch {
    // pas une URL : on garde le texte
  }
  return t.replace(/^.*cle=/, '').replace(/[^A-Za-z0-9_-]/g, '');
}

/** Plus récemment mis à jour d'abord, puis par titre */
export function sortSongs(songs: readonly Song[]): Song[] {
  return [...songs].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.title.localeCompare(b.title, 'fr'),
  );
}

export function isFresh(song: Song, now = Date.now()): boolean {
  return !!song.updatedAt && now - song.updatedAt < WEEK;
}

/**
 * Date d'envoi lue dans le nom du fichier WhatsApp :
 * « WhatsApp Audio 2026-09-23 at 22.34.43.mp4 » (iPhone, ordinateur) ou « AUD-20260925-WA0001 » (Android)
 */
export function whatsappDate(name: string | undefined): { at: number; time: boolean } | null {
  const n = name ?? '';
  let m = /(\d{4})-(\d{2})-(\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2})/.exec(n);
  if (m) {
    const [, y, mo, d, h, mi, se] = m.map(Number);
    return { at: new Date(y, mo - 1, d, h, mi, se).getTime(), time: true };
  }
  m = /(?:AUD|PTT)-(\d{4})(\d{2})(\d{2})-WA/.exec(n);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    return { at: new Date(y, mo - 1, d, 12).getTime(), time: false };
  }
  return null;
}

/** « envoyé sur WhatsApp le 23 sept. à 22:34 » */
export function whatsappLabel(name: string | undefined): string {
  const w = whatsappDate(name);
  if (!w) return '';
  const hour = new Date(w.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `envoyé sur WhatsApp le ${dateShort(w.at)}${w.time ? ' à ' + hour : ''}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}
