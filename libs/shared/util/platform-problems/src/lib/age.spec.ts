import { describe, expect, it } from 'vitest';

import { shortAge } from './age';

describe('shortAge', () => {
  it.each([
    [0.2, '12 s'],
    [-1, '0 s'],
    [4, '4 m'],
    [120, '2 h'],
    [72 * 60, '3 d']
  ])('shortAge(%s) -> %s', (min, text) => {
    expect(shortAge(min)).toBe(text);
  });
});
