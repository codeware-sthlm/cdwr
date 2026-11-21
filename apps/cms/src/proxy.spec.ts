/** @jest-environment node */
import { NextRequest } from 'next/server';

import { proxy } from './proxy';

const get = (path: string) =>
  proxy(
    new NextRequest(`https://site.example${path}`, {
      headers: { accept: 'text/html' }
    })
  );

/** `NextResponse.next()` marks the request as passed on to the route */
const passedOn = (response: Response) =>
  response.headers.get('x-middleware-next') === '1';

describe('proxy', () => {
  // Each of these would answer first, or change the CSP header's name
  const AMBIENT = ['CSP_ENFORCE', 'MAINTENANCE_MODE', 'SITE_GATE_PASSWORD'];
  const saved = { ...process.env };

  beforeEach(() => {
    for (const name of AMBIENT) delete process.env[name];
  });

  afterAll(() => {
    process.env = saved;
  });

  it.each(['/.env', '/wp-config.php', '/posts/x.php', '/.pg_service.conf'])(
    'refuses %s with a 404 before any route renders',
    (path) => {
      const response = get(path);

      expect(response.status).toBe(404);
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      expect(passedOn(response)).toBe(false);
      expect(
        response.headers.get('content-security-policy-report-only')
      ).toBeTruthy();
    }
  );

  it.each(['/robots.txt', '/api/media/file/a.png', '/about', '/'])(
    'passes %s on',
    (path) => {
      expect(passedOn(get(path))).toBe(true);
    }
  );
});
