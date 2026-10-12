import { isRefusedByCsrf } from './is-refused-by-csrf';

const csrf = ['https://a.example.com', 'https://b.example.com'];
const cookie = 'payload-token=jwt';

const headersOf = (init: Record<string, string>) => new Headers(init);

describe('isRefusedByCsrf', () => {
  it.each([
    [
      'an outside origin with the cookie',
      401,
      { cookie, origin: 'https://x.example.com' },
      csrf,
      true
    ],
    [
      'an outside origin, 403',
      403,
      { cookie, origin: 'https://x.example.com' },
      csrf,
      true
    ],
    [
      'a listed origin',
      403,
      { cookie, origin: 'https://a.example.com' },
      csrf,
      false
    ],
    [
      'no cookie (a failed login)',
      401,
      { origin: 'https://x.example.com' },
      csrf,
      false
    ],
    [
      'an Authorization header',
      401,
      {
        cookie,
        origin: 'https://x.example.com',
        authorization: 'tenants API-Key k'
      },
      csrf,
      false
    ],
    [
      'no origin, cross-site',
      403,
      { cookie, 'sec-fetch-site': 'cross-site' },
      csrf,
      true
    ],
    ['no origin, no Sec-Fetch-Site', 403, { cookie }, csrf, true],
    [
      'no origin, same-origin',
      403,
      { cookie, 'sec-fetch-site': 'same-origin' },
      csrf,
      false
    ],
    [
      'no origin, a direct navigation',
      403,
      { cookie, 'sec-fetch-site': 'none' },
      csrf,
      false
    ],
    [
      'an empty list',
      401,
      { cookie, origin: 'https://x.example.com' },
      [],
      false
    ],
    [
      'an undefined list',
      401,
      { cookie, origin: 'https://x.example.com' },
      undefined,
      false
    ],
    [
      'status 500',
      500,
      { cookie, origin: 'https://x.example.com' },
      csrf,
      false
    ],
    [
      'status 400',
      400,
      { cookie, origin: 'https://x.example.com' },
      csrf,
      false
    ]
  ])('with %s', (_label, status, init, list, expected) => {
    expect(
      isRefusedByCsrf({
        status,
        headers: headersOf(init),
        csrf: list,
        cookiePrefix: 'payload'
      })
    ).toBe(expected);
  });

  it('is false without headers', () => {
    expect(
      isRefusedByCsrf({
        status: 401,
        headers: undefined,
        csrf,
        cookiePrefix: 'payload'
      })
    ).toBe(false);
  });
});
