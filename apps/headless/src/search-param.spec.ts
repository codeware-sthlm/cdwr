import { readSearchParam } from './search-param';

describe('readSearchParam', () => {
  it('returns the value as written', () => {
    expect(readSearchParam('?block=1e2', 'block')).toBe('1e2');
  });

  it('returns null when absent', () => {
    expect(readSearchParam('', 'block')).toBeNull();
  });
});
