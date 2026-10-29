import { expect, test } from './fixtures';
import { SITE_GATE_PASSWORD as password } from './helpers/site-gate';

/**
 * The whole-site gate in front of headless.
 *
 * The suite runs with a gate password set, so every other spec reaches the
 * site through the gate on a cookie global setup collected. This one drops
 * that cookie to prove what an outsider actually meets. Unlike the cms, the
 * gate stands in front of every path but its own, `/api/health` included.
 */
test.describe('site gate', () => {
  // Neither a session nor the gate cookie: the visitor the gate exists for
  test.use({ siteGate: 'closed', storageState: { cookies: [], origins: [] } });

  test('asks for the password instead of showing the site', async ({
    page
  }) => {
    await page.goto('/lunar-maria');

    await expect(
      page.getByRole('heading', { name: 'This site is not open' })
    ).toBeVisible();
    // The site's own content must not be behind it
    await expect(
      page.getByRole('heading', { name: 'The Dark Plains of the Moon' })
    ).toHaveCount(0);
  });

  test('sends a page request to the gate, remembering where it was going', async ({
    request
  }) => {
    const response = await request.get('/lunar-maria?x=1', {
      headers: { accept: 'text/html' },
      maxRedirects: 0
    });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe(
      `/site-gate?from=${encodeURIComponent('/lunar-maria?x=1')}`
    );
  });

  test('refuses a caller that is not asking for a page', async ({
    request
  }) => {
    const response = await request.get('/', {
      headers: { accept: 'application/json' }
    });

    expect(response.status()).toBe(401);
  });

  test('keeps the health check behind it too', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(401);
  });

  test('does not open on the wrong password', async ({ request }) => {
    const response = await request.post('/site-gate', {
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
    const opened = await request.post('/site-gate', {
      form: { from: '/lunar-maria', password },
      maxRedirects: 0
    });

    expect(opened.status()).toBe(303);
    expect(opened.headers()['location']).toBe('/lunar-maria');
    expect(opened.headers()['set-cookie']).toContain('cdwr-site-gate');

    // The same context now carries the cookie, so the site answers
    const page = await request.get('/lunar-maria', {
      headers: { accept: 'text/html' }
    });

    expect(page.status()).toBe(200);
    expect(await page.text()).not.toContain('This site is not open');
  });

  test('refuses to bounce a visitor off the site after opening', async ({
    request
  }) => {
    const response = await request.post('/site-gate', {
      form: { from: '//elsewhere.test/phish', password },
      maxRedirects: 0
    });

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).not.toContain('elsewhere.test');
  });
});
