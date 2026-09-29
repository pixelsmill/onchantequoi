// Durée d'un audio lue dans son en-tête, sans le décoder :
// MP4/M4A (audios WhatsApp), Ogg Opus ou Vorbis (messages vocaux), WAV.
// Même logique que functions/lib.js (dépôts du raccourci iPhone).

const MAX_SECONDS = 10 * 3600;

function ascii(v: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length && offset + i < v.byteLength; i++) {
    s += String.fromCharCode(v.getUint8(offset + i));
  }
  return s;
}

function findBox(v: DataView, start: number, end: number, type: string) {
  let off = start;
  while (off + 8 <= end) {
    let size = v.getUint32(off);
    let header = 8;
    if (size === 1 && off + 16 <= end) {
      size = Number(v.getBigUint64(off + 8));
      header = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < header) return undefined;
    if (ascii(v, off + 4, 4) === type) return { start: off + header, end: Math.min(end, off + size) };
    off += size;
  }
  return undefined;
}

function mp4Duration(v: DataView): number | undefined {
  if (v.byteLength < 12 || ascii(v, 4, 4) !== 'ftyp') return undefined;
  const moov = findBox(v, 0, v.byteLength, 'moov');
  const mvhd = moov && findBox(v, moov.start, moov.end, 'mvhd');
  if (!mvhd || mvhd.start + 1 > v.byteLength) return undefined;
  const v1 = v.getUint8(mvhd.start) === 1;
  if (mvhd.start + (v1 ? 32 : 20) > v.byteLength) return undefined;
  const timescale = v.getUint32(mvhd.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(v.getBigUint64(mvhd.start + 24)) : v.getUint32(mvhd.start + 16);
  return timescale ? duration / timescale : undefined;
}

function indexOf(v: DataView, text: string, from: number, to: number): number {
  for (let i = from; i + text.length <= to; i++) {
    if (ascii(v, i, text.length) === text) return i;
  }
  return -1;
}

function oggDuration(v: DataView): number | undefined {
  if (v.byteLength < 28 || ascii(v, 0, 4) !== 'OggS') return undefined;
  const head = Math.min(v.byteLength, 4096);
  let rate = 0;
  let preskip = 0;
  const opus = indexOf(v, 'OpusHead', 0, head);
  if (opus >= 0 && opus + 12 <= v.byteLength) {
    rate = 48000; // Opus compte toujours en échantillons à 48 kHz
    preskip = v.getUint16(opus + 10, true);
  } else {
    const vorbis = indexOf(v, '\u0001vorbis', 0, head);
    if (vorbis < 0 || vorbis + 16 > v.byteLength) return undefined;
    rate = v.getUint32(vorbis + 12, true);
  }
  // Position (en échantillons) de la dernière page
  for (let i = v.byteLength - 27; i >= 0; i--) {
    if (v.getUint32(i) === 0x4f676753 && v.getUint8(i + 4) === 0) {
      const granule = Number(v.getBigUint64(i + 6, true));
      return rate ? (granule - preskip) / rate : undefined;
    }
  }
  return undefined;
}

function wavDuration(v: DataView): number | undefined {
  if (v.byteLength < 12 || ascii(v, 0, 4) !== 'RIFF' || ascii(v, 8, 4) !== 'WAVE') return undefined;
  let byteRate = 0;
  let dataSize = 0;
  let off = 12;
  while (off + 8 <= v.byteLength) {
    const id = ascii(v, off, 4);
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ' && off + 20 <= v.byteLength) byteRate = v.getUint32(off + 16, true);
    if (id === 'data') dataSize = size;
    off += 8 + size + (size % 2);
  }
  return byteRate && dataSize ? dataSize / byteRate : undefined;
}

/** Durée en secondes (arrondie au dixième), ou undefined si le format n'est pas reconnu */
export function audioDuration(buffer: ArrayBuffer): number | undefined {
  const v = new DataView(buffer);
  let d: number | undefined;
  try {
    d = mp4Duration(v) ?? oggDuration(v) ?? wavDuration(v);
  } catch {
    d = undefined; // fichier tronqué ou inattendu : pas de durée, sans bloquer le dépôt
  }
  return d != null && Number.isFinite(d) && d > 0 && d < MAX_SECONDS
    ? Math.round(d * 10) / 10
    : undefined;
}
