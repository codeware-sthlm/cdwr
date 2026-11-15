/**
 * The whole-site gate — COD-483.
 *
 * The suite runs with `SITE_GATE_PASSWORD` set, so every other spec reaches
 * the site through the gate on a cookie global setup collected. This one drops
 * that cookie to prove what an outsider actually meets: a form, a 401, and a
 * robots file that keeps the site out of search results.
 *
 * E2E runs in moon tenant mode.
 */

import { expect, test } from '../fixtures';
import { SITE_GATE_COOKIE, siteGateCookie } from '../helpers/site-gate';

const password = process.env['SITE_GATE_PASSWORD'] ?? '';

/**
 * Whether a script's own POST from a page through the gate carries the cookie
 * — COD-813.
 *
 * `cdwr tenant audit` sends the cookie as here, HttpOnly and Lax, and every
 * page got through, yet the browser's Sentry envelopes to `/monitoring` got the
 * gate's 401. Sentry posts with `keepalive`, and through a `fetch` taken from a
 * sandbox iframe it removes again whenever `window.fetch` is wrapped, which its
 * own instrumentation does. Both are asked here, on a path that is still gated.
 */
test.describe('site gate cookie on a script request', () => {
  test('rides along on a keepalive POST and on a sandboxed fetch', async ({
    baseURL,
    browser
  }) => {
    const cookie = siteGateCookie();
    expect(cookie, 'the suite runs gated').toBeTruthy();

    const context = await browser.newContext({ baseURL });
    await context.addCookies([
      {
        name: SITE_GATE_COOKIE,
        value: cookie ?? '',
        url: new URL('/', baseURL ?? 'http://localhost:3000').href,
        httpOnly: true,
        sameSite: 'Lax'
      }
    ]);
    const page = await context.newPage();
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const post = (fetcher: typeof fetch) =>
        fetcher('/lunar-maria', {
          method: 'POST',
          body: '{}',
          keepalive: true,
          referrerPolicy: 'strict-origin'
        }).then((response) => response.status);

      // What Sentry's `getNativeImplementation('fetch')` does
      const sandbox = document.createElement('iframe');
      sandbox.hidden = true;
      document.head.appendChild(sandbox);
      const sandboxed = (sandbox.contentWindow as Window).fetch.bind(window);
      document.head.removeChild(sandbox);

      return {
        window: await post(window.fetch.bind(window)),
        sandboxed: await post(sandboxed).catch((error: Error) => error.message)
      };
    });
    await context.close();

    // A status other than the gate's 401 is the site's own answer
    const summary = JSON.stringify(statuses);
    expect(typeof statuses.sandboxed, summary).toBe('number');
    expect(statuses.window, summary).not.toBe(401);
    expect(statuses.sandboxed, summary).not.toBe(401);
  });
});

test.describe('site gate', () => {
  // Neither a session nor the gate cookie: the visitor the gate exists for
  test.use({ siteGate: 'closed', storageState: { cookies: [], origins: [] } });

  test('asks for the password instead of showing the site', async ({
    page
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'This site is not open' })
    ).toBeVisible();
    // The site's own content must not be behind it
    await expect(page.getByText('Look at the silver moon.')).toHaveCount(0);
  });

  // The rendered document, not the markup: Next streams dynamic metadata after
  // the shell. The language comes from `locale`, not an extra header: Chromium
  // keeps its own Accept-Language on a navigation
  for (const [locale, lang, heading] of [
    ['sv-SE', 'sv', 'Webbplatsen är inte öppen'],
    ['en-US', 'en', 'This site is not open']
  ] as const) {
    test.describe(`in ${lang}`, () => {
      test.use({ locale });

      test('answers with a localized title and lang', async ({ page }) => {
        await page.goto('/');

        await expect(page).toHaveTitle(heading);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
      });
    });
  }

  test('refuses a caller that is not asking for a page', async ({
    request
  }) => {
    const response = await request.get('/', {
      headers: { accept: 'application/json' }
    });

    expect(response.status()).toBe(401);
  });

  test('keeps a gated site out of search results', async ({ request }) => {
    const response = await request.get('/robots.txt');

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Disallow: /');
  });

  test('does not open on the wrong password', async ({ request }) => {
    const response = await request.post('/api/site-gate', {
      form: { from: '/', password: 'not the password' },
      maxRedirects: 0
    });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toContain('error=wrong');
    expect(response.headers()['set-cookie'] ?? '').not.toContain(
      'cdwr-site-gate'
    );
  });

  test('opens on the right password and lands where the visitor was going', async ({
    request
  }) => {
    const opened = await request.post('/api/site-gate', {
      form: { from: '/lunar-maria', password },
      maxRedirects: 0
    });

    expect(opened.status()).toBe(303);
    expect(opened.headers()['location']).toContain('/lunar-maria');
    expect(opened.headers()['set-cookie']).toContain('cdwr-site-gate');

    // The same context now carries the cookie, so the site answers
    const page = await request.get('/lunar-maria');

    expect(page.status()).toBe(200);
    expect(await page.text()).not.toContain('This site is not open');
  });

  test('refuses to bounce a visitor off the site after opening', async ({
    request
  }) => {
    const response = await request.post('/api/site-gate', {
      form: { from: '//elsewhere.test/phish', password },
      maxRedirects: 0
    });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).not.toContain('elsewhere.test');
  });

  test('leaves the admin and the health check alone', async ({
    page,
    request
  }) => {
    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(
      page.getByRole('heading', { name: 'This site is not open' })
    ).toHaveCount(0);
  });
});
