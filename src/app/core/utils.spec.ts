import { Song } from './models';
import {
  ago,
  clock,
  guessType,
  isAudioFile,
  isFresh,
  keyFromText,
  norm,
  plural,
  sortSongs,
  WEEK,
  whatsappLabel,
} from './utils';

describe('utils', () => {
  it('norm() ignore accents, casse et espaces', () => {
    expect(norm('  Ave Vérum CORPUS ')).toBe('ave verum corpus');
    expect(norm(null)).toBe('');
  });

  it('ago() donne un délai lisible', () => {
    const now = new Date(2026, 8, 25, 18, 0).getTime();
    expect(ago(now - 20_000, now)).toBe("à l'instant");
    expect(ago(now - 20 * 60_000, now)).toBe('il y a 20 min');
    expect(ago(now - 3 * 3_600_000, now)).toBe('il y a 3 h');
    expect(ago(new Date(2026, 8, 17, 12).getTime(), now)).toBe('le 17 sept.');
  });

  it('clock() formate en m:ss', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(83.7)).toBe('1:23');
    expect(clock(NaN)).toBe('0:00');
  });

  it('guessType() garde le type connu et devine sinon', () => {
    expect(guessType({ type: 'video/mp4', name: 'x.mp4' })).toBe('video/mp4');
    expect(guessType({ type: 'audio/mp4; codecs=mp4a', name: 'x' })).toBe('audio/mp4');
    expect(guessType({ type: '', name: 'PTT-20260925-WA0001.opus' })).toBe('audio/ogg');
    expect(guessType({ type: 'application/octet-stream', name: 'AUD-1.m4a' })).toBe('audio/mp4');
    expect(guessType({ type: '', name: 'sans-extension' })).toBe('audio/ogg');
  });

  it('isAudioFile() accepte les audios WhatsApp et refuse le reste', () => {
    expect(isAudioFile({ type: 'video/mp4', name: 'WhatsApp Audio 2026-09-23 at 22.34.43.mp4' })).toBe(true);
    expect(isAudioFile({ type: 'audio/ogg', name: 'a.opus' })).toBe(true);
    expect(isAudioFile({ type: '', name: 'AUD-20260925-WA0001.m4a' })).toBe(true);
    expect(isAudioFile({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false);
    expect(isAudioFile({ type: 'application/pdf', name: 'partition.pdf' })).toBe(false);
    expect(isAudioFile({ type: '', name: 'notes.txt' })).toBe(false);
  });

  it('keyFromText() lit la clé dans un lien ou telle quelle', () => {
    expect(keyFromText('https://chorale-x.web.app/?cle=VMgkUrmfd6r0nNB4RdSrow')).toBe(
      'VMgkUrmfd6r0nNB4RdSrow',
    );
    expect(keyFromText('  VMgkUrmfd6r0nNB4RdSrow ')).toBe('VMgkUrmfd6r0nNB4RdSrow');
    expect(keyFromText('Le lien : chorale-x.web.app/?cle=Abc_123-x')).toBe('Abc_123-x');
    expect(keyFromText('')).toBe('');
  });

  it('sortSongs() : plus récents d’abord, puis par titre', () => {
    const s = (id: string, title: string, updatedAt?: number): Song => ({ id, title, voices: {}, updatedAt });
    const sorted = sortSongs([s('1', 'Bételgeuse', 1), s('2', 'Zèbre', 5), s('3', 'Ave', 1), s('4', 'Écho')]);
    expect(sorted.map((x) => x.id)).toEqual(['2', '3', '1', '4']);
  });

  it('isFresh() : mis à jour depuis moins d’une semaine', () => {
    const now = Date.now();
    expect(isFresh({ id: 'a', title: 'a', voices: {}, updatedAt: now - WEEK + 1000 }, now)).toBe(true);
    expect(isFresh({ id: 'a', title: 'a', voices: {}, updatedAt: now - WEEK - 1000 }, now)).toBe(false);
    expect(isFresh({ id: 'a', title: 'a', voices: {} }, now)).toBe(false);
  });

  it('whatsappLabel() lit la date dans les noms de fichiers WhatsApp', () => {
    expect(whatsappLabel('WhatsApp Audio 2026-09-23 at 22.34.43.mp4')).toBe(
      'envoyé sur WhatsApp le 23 sept. à 22:34',
    );
    expect(whatsappLabel('AUD-20260925-WA0001.m4a')).toBe('envoyé sur WhatsApp le 25 sept.');
    expect(whatsappLabel('PTT-20260924-WA0012.opus')).toBe('envoyé sur WhatsApp le 24 sept.');
    expect(whatsappLabel('audio')).toBe('');
    expect(whatsappLabel(undefined)).toBe('');
  });

  it('plural()', () => {
    expect(plural(1, 'audio', 'audios')).toBe('1 audio');
    expect(plural(3, 'audio', 'audios')).toBe('3 audios');
  });
});
