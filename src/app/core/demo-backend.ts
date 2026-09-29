// Mode démo : tout en mémoire, avec de faux enregistrements générés (notes tenues).
import { Backend, ClassifyRequest, ClassifyResult, InboxFile, Song, VoiceKey } from './models';

interface DemoFile extends InboxFile {
  status: 'inbox' | 'classified';
  song?: string;
  voice?: VoiceKey;
}

/** Petit WAV : accord tenu sur 4 temps, pour avoir quelque chose à écouter */
export function tone(freqs: number[], seconds = 6): Blob {
  const rate = 16000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  const steps = [1, 1.125, 1.25, 1.125];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const step = Math.floor(t / 1.5) % 4;
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * steps[step] * t);
    const env = Math.min(1, (t % 1.5) * 8) * Math.min(1, (1.5 - (t % 1.5)) * 8);
    v.setInt16(44 + i * 2, (s / freqs.length) * env * 9000, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function createDemoBackend(now = Date.now(), delay = 150): Backend {
  const blobs = new Map<string, Blob>();
  const chords = new Map<string, number[]>(); // généré à la première écoute
  const files = new Map<string, DemoFile>();
  const songs = new Map<string, Song>();
  const urls = new Map<string, string>();
  const subs = { songs: [] as ((s: Song[]) => void)[], inbox: [] as ((i: InboxFile[]) => void)[] };
  const day = 86_400_000;
  let n = 0;

  // Noms comme ceux de WhatsApp sur iPhone, envoyés la veille
  const eve = new Date(now - day);
  const pad = (x: number) => String(x).padStart(2, '0');
  const waDay = `${eve.getFullYear()}-${pad(eve.getMonth() + 1)}-${pad(eve.getDate())}`;
  const add = (freqs: number[], meta: Partial<DemoFile>): string => {
    const hash = 'demo' + ++n;
    chords.set(hash, freqs);
    files.set(hash, {
      hash,
      status: 'inbox',
      name: `WhatsApp Audio ${waDay} at 21.${10 + n}.05.mp4`,
      duration: 6,
      createdAt: now,
      ...meta,
    });
    return hash;
  };
  const song = (id: string, title: string, voices: Partial<Record<VoiceKey, number[]>>, at: number) => {
    const v: Song['voices'] = {};
    for (const [k, f] of Object.entries(voices) as [VoiceKey, number[]][]) {
      v[k] = { hash: add(f, { status: 'classified', song: id, voice: k }), at };
    }
    songs.set(id, { id, title, voices: v, createdAt: at, updatedAt: at });
  };
  song('s1', 'Ave Verum Corpus', { S: [523], A: [392], H: [196], T: [523, 392, 196] }, now - 8 * day);
  song('s2', 'Le Lion est mort ce soir', { S: [587], A: [440], H: [220], T: [587, 440, 220] }, now - day);
  song('s3', 'Hallelujah (Cohen)', { S: [494], A: [370], T: [494, 370, 185] }, now - 15 * day);
  add([659], { createdAt: now - 20 * 60_000 });
  add([220], { createdAt: now - 19 * 60_000 });
  add([659, 494, 247], { createdAt: now - 18 * 60_000 });
  add([494], { createdAt: now - 17 * 60_000 });

  const emit = () => {
    const s = [...songs.values()].map((x) => structuredClone(x));
    const i = [...files.values()]
      .filter((f) => f.status === 'inbox')
      .map(({ status: _s, song: _g, voice: _v, ...f }) => f);
    subs.songs.forEach((cb) => cb(s));
    subs.inbox.forEach((cb) => cb(i));
  };
  const later = <T>(fn: () => T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(fn()), delay));
  const forget = (hash: string) => {
    files.delete(hash);
    blobs.delete(hash);
    chords.delete(hash);
    const u = urls.get(hash);
    if (u) URL.revokeObjectURL(u);
    urls.delete(hash);
  };

  return {
    demo: true,
    async join() {
      return 'ok';
    },
    onSongs(cb) {
      subs.songs.push(cb);
      setTimeout(emit);
      return () => (subs.songs = subs.songs.filter((x) => x !== cb));
    },
    onInbox(cb) {
      subs.inbox.push(cb);
      setTimeout(emit);
      return () => (subs.inbox = subs.inbox.filter((x) => x !== cb));
    },
    async exists(hash) {
      return files.has(hash);
    },
    upload(file, { name, hash, type, duration }, onProgress) {
      onProgress?.(1);
      return later(() => {
        blobs.set(hash, file);
        files.set(hash, {
          hash,
          status: 'inbox',
          name,
          size: file.size,
          type,
          duration,
          createdAt: Date.now(),
        });
        emit();
      });
    },
    classify({ hash, voice, songId, newTitle }: ClassifyRequest): Promise<ClassifyResult> {
      return later((): ClassifyResult => {
        const f = files.get(hash);
        if (!f || f.status !== 'inbox') return { ok: false, reason: 'already' };
        let s = songId ? songs.get(songId) : undefined;
        if (!s) {
          if (songId || !newTitle?.trim()) return { ok: false, reason: 'error' };
          const id = 's' + Date.now();
          s = { id, title: newTitle.trim(), voices: {}, createdAt: Date.now() };
          songs.set(id, s);
        }
        const old = s.voices[voice];
        if (old && old.hash !== hash) forget(old.hash);
        s.voices[voice] = { hash, at: Date.now() };
        s.updatedAt = Date.now();
        Object.assign(f, { status: 'classified', song: s.id, voice });
        emit();
        return { ok: true, songId: s.id };
      });
    },
    unclassify(songId, voice, hash) {
      return later(() => {
        const s = songs.get(songId);
        const v = s?.voices[voice];
        if (!s || !v || v.hash !== hash) return false;
        delete s.voices[voice];
        const f = files.get(v.hash);
        if (f) Object.assign(f, { status: 'inbox', createdAt: Date.now(), song: undefined, voice: undefined });
        emit();
        return true;
      });
    },
    removeInbox(hash) {
      return later(() => {
        if (files.get(hash)?.status !== 'inbox') return false;
        forget(hash);
        emit();
        return true;
      });
    },
    renameSong(id, title) {
      return later(() => {
        const s = songs.get(id);
        if (s) s.title = title.trim();
        emit();
      });
    },
    deleteSong(id, hashes) {
      return later(() => {
        const s = songs.get(id);
        if (!s) return true;
        const current = Object.values(s.voices).map((r) => r.hash).sort();
        if (current.join() !== [...hashes].sort().join()) return false;
        current.forEach(forget);
        songs.delete(id);
        emit();
        return true;
      });
    },
    async url(hash) {
      let u = urls.get(hash);
      if (!u) {
        let b = blobs.get(hash);
        const c = chords.get(hash);
        if (!b && c) blobs.set(hash, (b = tone(c)));
        if (!b) throw new Error('audio introuvable');
        u = URL.createObjectURL(b);
        urls.set(hash, u);
      }
      return u;
    },
  };
}
