import { describe, expect, it } from 'vitest';

import { deskSha } from './build-info';

describe('deskSha', () => {
  it('passes a full commit', () => {
    const sha = 'abcdef0123456789abcdef0123456789abcdef01';
    expect(deskSha(sha)).toBe(sha);
  });

  it.each(['', undefined, 'abc', 'G'.repeat(40)])('gives null for %j', (v) => {
    expect(deskSha(v)).toBeNull();
  });
});
