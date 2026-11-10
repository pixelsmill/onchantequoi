import { afterEach, describe, expect, it } from 'vitest';
import { CHOIRS_STORE, KEY_STORE, readSavedChoirs } from './chorale.store';

describe('Chorales retenues sur le téléphone', () => {
  afterEach(() => localStorage.clear());

  it('l’ancienne clé unique devient celle de la chorale 1', () => {
    localStorage.setItem(KEY_STORE, 'ancienne-cle-0123');
    expect(readSavedChoirs()).toEqual({ 1: { key: 'ancienne-cle-0123' } });
  });

  it('garde les chorales valides et ignore le reste', () => {
    localStorage.setItem(
      CHOIRS_STORE,
      JSON.stringify({
        1: { key: 'cle-un-0123456', name: 'On chante quoi ?' },
        2: { key: 'cle-deux-012345' },
        '../x': { key: 'pirate-0123456' },
        3: { name: 'sans clé' },
      }),
    );
    expect(readSavedChoirs()).toEqual({
      1: { key: 'cle-un-0123456', name: 'On chante quoi ?' },
      2: { key: 'cle-deux-012345' },
    });
  });
});
