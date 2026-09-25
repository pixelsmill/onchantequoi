import { createDemoBackend } from './demo-backend';
import { Backend, InboxFile, Song } from './models';

/** Branche les écouteurs et renvoie le dernier état reçu */
function watch(b: Backend) {
  const state = { songs: [] as Song[], inbox: [] as InboxFile[] };
  b.onSongs((s) => (state.songs = s), () => undefined);
  b.onInbox((i) => (state.inbox = i), () => undefined);
  return state;
}

const tick = () => new Promise((r) => setTimeout(r));

describe('createDemoBackend', () => {
  let b: Backend;
  let state: ReturnType<typeof watch>;

  beforeEach(async () => {
    b = createDemoBackend(Date.now(), 0);
    state = watch(b);
    await tick();
  });

  it('démarre avec 3 morceaux et 4 audios à classer', () => {
    expect(state.songs.map((s) => s.title).sort()).toEqual([
      'Ave Verum Corpus',
      'Hallelujah (Cohen)',
      'Le Lion est mort ce soir',
    ]);
    expect(state.inbox.length).toBe(4);
  });

  it('classe dans un nouveau morceau puis pré-remplit par id', async () => {
    const [first] = state.inbox;
    const res = await b.classify({ hash: first.hash, voice: 'S', songId: null, newTitle: ' Siyahamba ' });
    expect(res.ok).toBe(true);
    const song = state.songs.find((s) => s.title === 'Siyahamba');
    expect(song).toBeTruthy();
    expect(res.ok && res.songId).toBe(song?.id);
    expect(song?.voices.S?.hash).toBe(first.hash);
    expect(state.inbox.length).toBe(3);
  });

  it('le premier qui classe gagne', async () => {
    const [first] = state.inbox;
    const req = { hash: first.hash, voice: 'A' as const, songId: 's1', newTitle: null };
    const [a, c] = await Promise.all([b.classify(req), b.classify(req)]);
    expect(a.ok).toBe(true);
    expect(c).toEqual({ ok: false, reason: 'already' });
  });

  it('un nouvel audio remplace l’ancien pour la même voix (sans historique)', async () => {
    const old = state.songs.find((s) => s.id === 's1')?.voices.T?.hash as string;
    const [first] = state.inbox;
    await b.classify({ hash: first.hash, voice: 'T', songId: 's1', newTitle: null });
    expect(state.songs.find((s) => s.id === 's1')?.voices.T?.hash).toBe(first.hash);
    expect(await b.exists(old)).toBe(false);
    await expect(b.url(old)).rejects.toThrow();
  });

  it('« Mal classé ? » remet l’audio à classer, seulement s’il occupe encore la voix', async () => {
    const hash = state.songs.find((s) => s.id === 's2')?.voices.H?.hash as string;
    await b.unclassify('s2', 'H', 'autre-hash');
    expect(state.songs.find((s) => s.id === 's2')?.voices.H).toBeTruthy();
    await b.unclassify('s2', 'H', hash);
    expect(state.songs.find((s) => s.id === 's2')?.voices.H).toBeUndefined();
    expect(state.inbox.some((f) => f.hash === hash)).toBe(true);
  });

  it('dépôt, doublon, suppression', async () => {
    const file = new Blob(['x'], { type: 'audio/mp4' });
    expect(await b.exists('abc')).toBe(false);
    await b.upload(file, 'AUD-1.m4a', 'abc', 'audio/mp4');
    expect(await b.exists('abc')).toBe(true);
    expect(state.inbox.find((f) => f.hash === 'abc')?.name).toBe('AUD-1.m4a');
    await b.removeInbox('abc');
    expect(await b.exists('abc')).toBe(false);
  });

  it('renomme et supprime un morceau', async () => {
    await b.renameSong('s3', '  Hallelujah  ');
    expect(state.songs.find((s) => s.id === 's3')?.title).toBe('Hallelujah');
    await b.deleteSong('s3');
    expect(state.songs.find((s) => s.id === 's3')).toBeUndefined();
  });

  it('refuse un classement sans morceau valide', async () => {
    const [first] = state.inbox;
    expect(await b.classify({ hash: first.hash, voice: 'S', songId: null, newTitle: '  ' })).toEqual({
      ok: false,
      reason: 'error',
    });
    expect(await b.classify({ hash: first.hash, voice: 'S', songId: 'inconnu', newTitle: null })).toEqual({
      ok: false,
      reason: 'error',
    });
  });
});
