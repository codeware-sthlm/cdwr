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

const password = process.env['SITE_GATE_PASSWORD'] ?? '';

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
