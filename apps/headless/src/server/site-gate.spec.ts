import { resetRateLimits } from '@codeware/shared/util/human-check';
import {
  SITE_GATE_COOKIE,
  createSiteGateToken
} from '@codeware/shared/util/site-gate';

import { isGatedPath, siteGate } from './site-gate';

const PASSWORD = 'hunter2';
const page = { accept: 'text/html' };

const get = (path: string, headers: Record<string, string> = page) =>
  new Request(`http://localhost${path}`, { headers });

const post = (password: string, ip = '10.0.0.1') =>
  new Request('http://localhost/site-gate', {
    method: 'POST',
    headers: { 'fly-client-ip': ip },
    body: new URLSearchParams({ password, from: '/about' })
  });

beforeEach(() => resetRateLimits());

describe('isGatedPath', () => {
  it.each([
    '/',
    '/about',
    '/x.js',
    '/robots.txt',
    '/api',
    '/api/x',
    '/_serverFn/abc',
    '/_serverFn/abc/a.js'
  ])('gates %s', (path) => {
    expect(isGatedPath(path)).toBe(true);
  });

  it('lets the gate itself through', () => {
    expect(isGatedPath('/site-gate')).toBe(false);
  });
});

describe('siteGate', () => {
  it('is out of the way without a password', async () => {
    expect(await siteGate(get('/'), undefined)).toBeUndefined();
  });

  it('sends a visitor without the cookie to the gate', async () => {
    const response = await siteGate(get('/about?x=1'), PASSWORD);

    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe(
      '/site-gate?from=%2Fabout%3Fx%3D1'
    );
  });

  it('refuses what is not asking for a page', async () => {
    const response = await siteGate(
      get('/_serverFn/abc', { accept: 'application/json' }),
      PASSWORD
    );

    expect(response?.status).toBe(401);
  });

  it('lets a visitor with a valid cookie through', async () => {
    const cookie = `${SITE_GATE_COOKIE}=${createSiteGateToken(PASSWORD)}`;

    expect(
      await siteGate(get('/about', { ...page, cookie }), PASSWORD)
    ).toBeUndefined();
  });

  it('turns away a cookie made with another password', async () => {
    const cookie = `${SITE_GATE_COOKIE}=${createSiteGateToken('other')}`;
    const response = await siteGate(get('/', { ...page, cookie }), PASSWORD);

    expect(response?.status).toBe(302);
  });

  it.each(['/x.js', '/api/x', '/_serverFn/abc/a.js', '/_serverFn/abc'])(
    'gates %s',
    async (path) => {
      const response = await siteGate(get(path), PASSWORD);

      expect(response?.status).toBeGreaterThanOrEqual(300);
    }
  );

  it('shows the gate page', async () => {
    const response = await siteGate(get('/site-gate?error=wrong'), PASSWORD);

    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain('type="password"');
  });

  it('sets the cookie for the right password', async () => {
    const response = await siteGate(post(PASSWORD), PASSWORD);

    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe('/about');
    expect(response?.headers.get('set-cookie')).toContain(
      `${SITE_GATE_COOKIE}=`
    );
  });

  it('sends the wrong password back to the gate', async () => {
    const response = await siteGate(post('nope'), PASSWORD);

    expect(response?.headers.get('location')).toContain('error=wrong');
    expect(response?.headers.get('set-cookie')).toBeNull();
  });

  it('throttles an address after ten wrong guesses', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await siteGate(post('nope'), PASSWORD);
    }

    const response = await siteGate(post(PASSWORD), PASSWORD);

    expect(response?.headers.get('location')).toContain('error=throttled');
    expect(response?.headers.get('set-cookie')).toBeNull();

    const other = await siteGate(post(PASSWORD, '10.0.0.2'), PASSWORD);
    expect(other?.headers.get('set-cookie')).toContain(`${SITE_GATE_COOKIE}=`);
  });
});
