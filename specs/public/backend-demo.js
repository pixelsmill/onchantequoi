// Mode démo : tout en mémoire, avec de faux enregistrements générés (notes tenues).
function tone(freqs, seconds = 6) {
  const rate = 16000, n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate, step = Math.floor(t / 1.5) % 4;
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * [1, 1.125, 1.25, 1.125][step] * t);
    const env = Math.min(1, (t % 1.5) * 8) * Math.min(1, (1.5 - (t % 1.5)) * 8);
    v.setInt16(44 + i * 2, (s / freqs.length) * env * 9000, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function createDemoBackend() {
  const blobs = new Map();
  const files = new Map();
  const songs = new Map();
  const subs = { songs: [], inbox: [] };
  let n = 0;
  const now = Date.now(), day = 86400000;

  const add = (freqs, meta) => {
    const hash = 'demo' + (++n);
    blobs.set(hash, tone(freqs));
    files.set(hash, { hash, status: 'inbox', name: 'PTT-WA000' + n + '.opus', createdAt: now, ...meta });
    return hash;
  };
  const song = (id, title, voices, at) => {
    const v = {};
    for (const [k, f] of Object.entries(voices)) {
      const h = add(f, { status: 'classified', song: id, voice: k });
      v[k] = { hash: h, at };
    }
    songs.set(id, { id, title, voices: v, createdAt: at, updatedAt: at });
  };
  song('s1', 'Ave Verum Corpus', { S: [523], A: [392], H: [196], T: [523, 392, 196] }, now - 8 * day);
  song('s2', 'Le Lion est mort ce soir', { S: [587], A: [440], H: [220], T: [587, 440, 220] }, now - day);
  song('s3', 'Hallelujah (Cohen)', { S: [494], A: [370], T: [494, 370, 185] }, now - 15 * day);
  add([659], { createdAt: now - 20 * 60000 });
  add([220], { createdAt: now - 19 * 60000 });
  add([659, 494, 247], { createdAt: now - 18 * 60000 });
  add([494], { createdAt: now - 17 * 60000 });

  const emit = () => {
    const s = [...songs.values()].map((x) => structuredClone(x));
    const i = [...files.values()].filter((f) => f.status === 'inbox').map((f) => ({ ...f }));
    subs.songs.forEach((cb) => cb(s));
    subs.inbox.forEach((cb) => cb(i));
  };
  const later = (fn) => new Promise((r) => setTimeout(() => r(fn()), 150));

  return {
    demo: true,
    async join() { return true; },
    onSongs(cb) { subs.songs.push(cb); setTimeout(emit); return () => {}; },
    onInbox(cb) { subs.inbox.push(cb); setTimeout(emit); return () => {}; },
    async exists(hash) { return files.has(hash); },
    upload(file, hash, type) {
      return later(() => {
        blobs.set(hash, file);
        files.set(hash, { hash, status: 'inbox', name: file.name, type, createdAt: Date.now() });
        emit();
      });
    },
    classify({ hash, voice, songId, newTitle }) {
      return later(() => {
        const f = files.get(hash);
        if (!f || f.status !== 'inbox') return { ok: false, reason: 'already' };
        let s = songId ? songs.get(songId) : null;
        if (!s) {
          const id = 's' + Date.now();
          s = { id, title: newTitle.trim(), voices: {}, createdAt: Date.now() };
          songs.set(id, s);
        }
        const old = s.voices[voice];
        if (old && old.hash !== hash) { files.delete(old.hash); blobs.delete(old.hash); }
        s.voices[voice] = { hash, at: Date.now() };
        s.updatedAt = Date.now();
        Object.assign(f, { status: 'classified', song: s.id, voice });
        emit();
        return { ok: true };
      });
    },
    unclassify(songId, voice) {
      return later(() => {
        const s = songs.get(songId), v = s?.voices[voice];
        if (!v) return;
        delete s.voices[voice];
        Object.assign(files.get(v.hash), { status: 'inbox', createdAt: Date.now() });
        emit();
      });
    },
    removeInbox(hash) { return later(() => { files.delete(hash); blobs.delete(hash); emit(); }); },
    renameSong(id, title) { return later(() => { songs.get(id).title = title.trim(); emit(); }); },
    deleteSong(id) { return later(() => { songs.delete(id); emit(); }); },
    async url(hash) { return URL.createObjectURL(blobs.get(hash)); },
  };
}
