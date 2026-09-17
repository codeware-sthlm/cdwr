import { describe, expect, it } from 'vitest';

import { isSecureRequest } from './secure-request';

const headers = (values: Record<string, string> = {}) => new Headers(values);

describe('isSecureRequest', () => {
  it('believes the proxy over the socket', () => {
    // What a tenant app actually sees behind Fly: https outside, http inside
    expect(
      isSecureRequest(
        headers({ 'x-forwarded-proto': 'https' }),
        'http://cdwr-cms-demo.internal/tours'
      )
    ).toBe(true);
    expect(
      isSecureRequest(
        headers({ 'x-forwarded-proto': 'http' }),
        'https://example.test/'
      )
    ).toBe(false);
  });

  it('reads the first hop when several are listed', () => {
    expect(
      isSecureRequest(
        headers({ 'x-forwarded-proto': 'https, http' }),
        'http://example.test/'
      )
    ).toBe(true);
  });

  it('falls back to the url when nothing was forwarded', () => {
    expect(isSecureRequest(headers(), 'https://example.test/')).toBe(true);
    expect(isSecureRequest(headers(), 'http://localhost:3000/')).toBe(false);
    expect(isSecureRequest(headers(), 'not a url')).toBe(false);
  });
});
