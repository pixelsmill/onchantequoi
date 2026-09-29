import { audioDuration } from './audio-duration';

/** Petits fichiers fabriqués à la main : seuls les en-têtes comptent */
type Part = number[] | string | Uint8Array | ArrayBuffer;
function bytes(...parts: Part[]): ArrayBuffer {
  const chunks = parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : new Uint8Array(p)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const le64 = (n: number) => [...le32(n), 0, 0, 0, 0];

function mp4(timescale: number, duration: number): ArrayBuffer {
  const mvhd = [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(duration), ...new Array(80).fill(0)];
  const mvhdBox = [...u32(8 + mvhd.length), ...'mvhd'.split('').map((c) => c.charCodeAt(0)), ...mvhd];
  const moov = [...u32(8 + mvhdBox.length), ...'moov'.split('').map((c) => c.charCodeAt(0)), ...mvhdBox];
  const ftyp = bytes(u32(20), 'ftypM4A ', u32(0), 'M4A ');
  return bytes(ftyp, u32(16), 'mdat', new Array(8).fill(7), moov);
}

function ogg(granule: number, preskip = 312): ArrayBuffer {
  const page = (g: number, payload: Part) =>
    bytes('OggS', [0, 0], le64(g), le32(1), le32(0), le32(0), [1, 4], payload);
  const head = page(0, bytes('OpusHead', [1, 1], [preskip & 255, preskip >> 8], le32(48000), [0, 0, 0]));
  return bytes(head, page(granule, [1, 2, 3, 4]));
}

function wav(seconds: number, rate = 8000): ArrayBuffer {
  const data = seconds * rate * 2;
  return bytes('RIFF', le32(36 + data), 'WAVE', 'fmt ', le32(16), [1, 0, 1, 0], le32(rate), le32(rate * 2), [2, 0, 16, 0], 'data', le32(data), new Array(data).fill(0));
}

describe('audioDuration', () => {
  it('lit la durée des audios WhatsApp (MP4/M4A)', () => {
    expect(audioDuration(mp4(44100, 44100 * 157.5))).toBe(157.5);
    expect(audioDuration(mp4(1000, 43_512))).toBe(43.5);
  });

  it('lit la durée des messages vocaux (Ogg Opus)', () => {
    expect(audioDuration(ogg(48000 * 221.5 + 312))).toBe(221.5);
  });

  it('lit la durée des WAV', () => {
    expect(audioDuration(wav(2))).toBe(2);
  });

  it('ne devine rien pour un format inconnu ou un fichier tronqué', () => {
    expect(audioDuration(bytes('ID3', [3, 0, 0, 0]))).toBeUndefined();
    expect(audioDuration(bytes('%PDF-1.4'))).toBeUndefined();
    expect(audioDuration(mp4(1000, 5000).slice(0, 40))).toBeUndefined();
    expect(audioDuration(new ArrayBuffer(0))).toBeUndefined();
  });
});
