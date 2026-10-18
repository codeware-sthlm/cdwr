/** @jest-environment node */
import { resolveAuthLocale } from './request-locale';

jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));

describe('resolveAuthLocale', () => {
  it.each(['sv', 'en'] as const)('lets a %s cookie win', (cookie) => {
    expect(resolveAuthLocale(cookie, cookie === 'sv' ? 'en-US' : 'sv-SE')).toBe(
      cookie
    );
  });

  it('follows Accept-Language without a cookie', () => {
    expect(resolveAuthLocale(undefined, 'sv-SE,sv;q=0.9')).toBe('sv');
    expect(resolveAuthLocale(undefined, 'en-GB')).toBe('en');
  });

  it('ignores a cookie that is not a supported language', () => {
    expect(resolveAuthLocale('de', 'sv')).toBe('sv');
  });

  it('falls back to English', () => {
    expect(resolveAuthLocale(undefined, '')).toBe('en');
  });
});
