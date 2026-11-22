/**
 * @jest-environment node
 */
import { cookies } from 'next/headers';

import { readCookie, setTrustCookie, trustCookieName } from './trust-cookie';
import { TRUST_TTL_SECONDS } from './trust-token';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));

describe('trust cookie', () => {
  it('is named after the cookie prefix', () => {
    expect(trustCookieName(undefined)).toBe('payload-totp-trust');
    expect(trustCookieName('cdwr')).toBe('cdwr-totp-trust');
  });

  it('reads one cookie from the header', () => {
    const headers = new Headers({ cookie: 'a=1; b=two%20words; c=3' });
    expect(readCookie(headers, 'b')).toBe('two words');
    expect(readCookie(headers, 'x')).toBeUndefined();
    expect(readCookie(new Headers(), 'a')).toBeUndefined();
  });

  it('sets a 30-day http-only cookie with the collection flags', async () => {
    const set = jest.fn();
    jest.mocked(cookies).mockResolvedValue({ set } as never);

    const before = Date.now();
    await setTrustCookie({
      payload: { config: { cookiePrefix: 'cdwr' } } as never,
      collectionAuth: {
        cookies: { domain: 'cdwr.io', secure: true, sameSite: 'Lax' }
      },
      token: 'tok'
    });

    const [name, value, options] = set.mock.calls[0];
    expect([name, value]).toEqual(['cdwr-totp-trust', 'tok']);
    expect(options).toMatchObject({
      domain: 'cdwr.io',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true
    });
    expect(options.expires.getTime() - before).toBeGreaterThanOrEqual(
      TRUST_TTL_SECONDS * 1000 - 1000
    );
  });
});
