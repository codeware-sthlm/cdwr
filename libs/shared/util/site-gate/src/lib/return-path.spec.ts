import { describe, expect, it } from 'vitest';

import { resolveReturnPath } from './return-path';

describe('resolveReturnPath', () => {
  it('keeps a local path, query and all', () => {
    expect(resolveReturnPath('/tours')).toBe('/tours');
    expect(resolveReturnPath('/tours?page=2#top')).toBe('/tours?page=2#top');
  });

  it('refuses anything that could leave the site', () => {
    expect(resolveReturnPath('//elsewhere.test')).toBe('/');
    expect(resolveReturnPath('https://elsewhere.test')).toBe('/');
    expect(resolveReturnPath('/\\elsewhere.test')).toBe('/');
    expect(resolveReturnPath('javascript:alert(1)')).toBe('/');
  });

  it('falls back to the site root when nothing was carried', () => {
    expect(resolveReturnPath(undefined)).toBe('/');
    expect(resolveReturnPath('')).toBe('/');
  });

  it('survives a repeated query key', () => {
    // Next hands over an array for `?from=/a&from=/b`, which used to throw
    expect(resolveReturnPath(['/a', '/b'])).toBe('/');
    expect(resolveReturnPath(42)).toBe('/');
  });
});
