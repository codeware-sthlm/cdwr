import { describe, expect, it } from 'vitest';

import { isActivePath, isExactPath } from './active-path';

describe('isActivePath', () => {
  it('matches the exact path', () => {
    expect(isActivePath('/posts', '/posts')).toBe(true);
    expect(isActivePath('/posts', '/tours')).toBe(false);
  });

  it('marks a parent link active on a nested route', () => {
    expect(isActivePath('/posts/some-slug', '/posts')).toBe(true);
    expect(isActivePath('/posts/2026/some-slug', '/posts')).toBe(true);
  });

  it('requires a segment boundary', () => {
    expect(isActivePath('/postsy', '/posts')).toBe(false);
  });

  it('keeps the root link exact', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/posts', '/')).toBe(false);
  });

  it('ignores trailing slashes on either side', () => {
    expect(isActivePath('/posts/', '/posts')).toBe(true);
    expect(isActivePath('/posts', '/posts/')).toBe(true);
    expect(isActivePath('/posts/some-slug/', '/posts/')).toBe(true);
  });

  it('does not match a child link from a parent route', () => {
    expect(isActivePath('/posts', '/posts/some-slug')).toBe(false);
  });
});

describe('isExactPath', () => {
  it('is true only for the location itself, trailing slash aside', () => {
    expect(isExactPath('/posts', '/posts')).toBe(true);
    expect(isExactPath('/posts/', '/posts')).toBe(true);
    expect(isExactPath('/posts/one', '/posts')).toBe(false);
  });
});
