import { TestBed } from '@angular/core/testing';
import { ChoraleStore } from '../../core/chorale.store';
import { InboxFile, Song } from '../../core/models';
import { InboxDrafts } from './inbox-drafts.service';

describe('InboxDrafts', () => {
  let drafts: InboxDrafts;
  let store: ChoraleStore;
  const song = (id: string, title: string): Song => ({ id, title, voices: {} });
  const file = (hash: string): InboxFile => ({ hash, createdAt: 1 });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    drafts = TestBed.inject(InboxDrafts);
    store = TestBed.inject(ChoraleStore);
    store.songs.set([song('s1', 'Ave Verum Corpus'), song('s2', 'Siyahamba')]);
    store.inbox.set([file('a'), file('b'), file('c')]);
    TestBed.tick();
  });

  it('brouillon vide par défaut', () => {
    expect(drafts.draft('a')).toEqual({ voice: null, songId: null, newTitle: null, query: '', cleared: false });
  });

  it('après un classement, le morceau est pré-rempli pour les autres audios', () => {
    drafts.update('b', { voice: 'H' });
    drafts.classified('a', 's2', null);
    expect(drafts.draft('b')).toMatchObject({ voice: 'H', songId: 's2' });
    expect(drafts.draft('c').songId).toBe('s2');
  });

  it('le morceau pré-rempli est figé dès qu’on touche l’audio', () => {
    drafts.classified('a', 's1', null);
    expect(drafts.draft('b').songId).toBe('s1');
    drafts.update('b', { voice: 'A' }); // l'utilisateur voit « Ave Verum Corpus » et touche Alto
    drafts.classified('c', 's2', null); // puis classe un autre audio ailleurs
    expect(drafts.draft('b')).toMatchObject({ voice: 'A', songId: 's1' });
  });

  it('un choix explicite ou un morceau retiré n’est pas écrasé', () => {
    drafts.update('b', { songId: 's1' });
    drafts.update('c', { cleared: true });
    drafts.classified('a', 's2', null);
    expect(drafts.draft('b').songId).toBe('s1');
    expect(drafts.draft('c').songId).toBeNull();
  });

  it('les autres audios qui attendaient le même nouveau morceau le rejoignent', () => {
    drafts.update('a', { newTitle: 'Nouveau chant' });
    drafts.update('b', { newTitle: 'nouveau  chant'.replace('  ', ' ') });
    drafts.classified('a', 's9', 'Nouveau chant');
    expect(drafts.draft('b')).toMatchObject({ songId: 's9', newTitle: null });
  });

  it('ignore un dernier morceau supprimé depuis', () => {
    drafts.classified('a', 's2', null);
    store.songs.set([song('s1', 'Ave Verum Corpus')]);
    expect(drafts.draft('b').songId).toBeNull();
  });

  it('oublie les brouillons des audios qui ne sont plus à classer', () => {
    drafts.update('b', { voice: 'S' });
    store.inbox.set([file('c')]);
    TestBed.tick();
    store.inbox.set([file('b'), file('c')]);
    TestBed.tick();
    expect(drafts.draft('b').voice).toBeNull();
  });
});
