import { nextAfter } from './inbox-page';

describe('nextAfter', () => {
  it('ouvre le suivant, sinon le précédent', () => {
    expect(nextAfter(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextAfter(['a', 'b', 'c'], 'b')).toBe('c');
    expect(nextAfter(['a', 'b', 'c'], 'c')).toBe('b');
    expect(nextAfter(['a'], 'a')).toBeNull();
    expect(nextAfter(['a', 'b'], 'zz')).toBe('a');
    expect(nextAfter([], 'zz')).toBeNull();
  });
});
