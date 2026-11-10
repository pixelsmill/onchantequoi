import { describe, expect, it } from 'vitest';
import { splitStanzas } from '../shared/lyrics-view';
import { createDemoBackend } from './demo-backend';
import { Song } from './models';
import { pickVoice } from './player.service';

const song = (voices: Song['voices']): Song => ({ id: 'x', title: 'X', voices });
const rec = { hash: 'h', at: 1 };

describe('pickVoice (sélection en boucle)', () => {
  it('prend la voix choisie si elle existe', () => {
    expect(pickVoice(song({ A: rec, T: rec }), 'A')).toBe('A');
  });
  it('sinon « Tous »', () => {
    expect(pickVoice(song({ S: rec, T: rec }), 'A')).toBe('T');
  });
  it('sinon rien : le morceau est sauté', () => {
    expect(pickVoice(song({ S: rec }), 'A')).toBeNull();
    expect(pickVoice(undefined, 'A')).toBeNull();
  });
});

describe('splitStanzas (paroles)', () => {
  it('une ligne vide sépare les couplets, les retours à la ligne restent', () => {
    expect(splitStanzas('a\nb\r\n\r\nc\n \n\n d ')).toEqual(['a\nb', 'c', 'd']);
  });
  it('texte vide : aucun couplet', () => {
    expect(splitStanzas('  \n ')).toEqual([]);
  });
});

describe('Paroles en mode démo', () => {
  it('enregistre, garde au classement, puis retire les paroles', async () => {
    const b = createDemoBackend(Date.now(), 0);
    let songs: Song[] = [];
    b.onSongs(
      (s) => (songs = s),
      () => undefined,
    );
    await new Promise((r) => setTimeout(r));
    expect(songs.find((s) => s.id === 's1')?.lyrics).toContain('Ave, verum corpus');
    await b.setLyrics('s2', '  Wimoweh\n\nIn the jungle  ');
    expect(songs.find((s) => s.id === 's2')?.lyrics).toBe('Wimoweh\n\nIn the jungle');
    // Les copies envoyées à l'app ne modifient pas les données de la démo
    songs.find((s) => s.id === 's2')!.voices = {};
    await b.setLyrics('s2', '');
    const s2 = songs.find((s) => s.id === 's2')!;
    expect(s2.lyrics).toBeUndefined();
    expect(Object.keys(s2.voices).length).toBe(4);
  });
});

describe('Plusieurs chorales en mode démo', () => {
  it('chaque chorale a ses morceaux ; changer de chorale change les données', async () => {
    const b = createDemoBackend(Date.now(), 0);
    expect(await b.join('demo', '2')).toBe('ok');
    expect((await b.choirMeta())?.teacher).toBe('Anne');
    let songs: Song[] = [];
    let off = b.onSongs(
      (s) => (songs = s),
      () => undefined,
    );
    await new Promise((r) => setTimeout(r));
    expect(songs.map((s) => s.title).sort()).toEqual(['Amazing Grace', 'Dona nobis pacem']);
    off();
    expect(await b.join('demo', '1')).toBe('ok');
    off = b.onSongs(
      (s) => (songs = s),
      () => undefined,
    );
    await new Promise((r) => setTimeout(r));
    expect(songs.some((s) => s.title === 'Ave Verum Corpus')).toBe(true);
    expect(songs.some((s) => s.title === 'Amazing Grace')).toBe(false);
    off();
    expect(await b.join('demo', '9')).toBe('denied');
  });
});
