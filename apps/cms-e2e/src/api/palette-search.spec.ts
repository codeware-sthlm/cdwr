/**
 * GET /api/palette-search — admin command-palette search endpoint tests
 *
 * The endpoint is only accessible to authenticated admin users (editors and
 * system admins). Tenant API-key identities and unauthenticated requests are
 * rejected with 403. Results are tenant-scoped and pages/posts are queried in
 * draft mode so never-published drafts are found.
 *
 * E2E runs in tenant mode (TENANT_ID=moon).
 */

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

/** Moon tenant API key from seed data (always present in e2e environment) */
const MOON_API_KEY = 'b9c2fb25-df77-4304-a60a-028779a2cb37';

test.describe('GET /api/palette-search', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated request is rejected with 403', async ({ request }) => {
    const res = await request.get('/api/palette-search?q=Lunar');
    expect(res.status()).toBe(403);
  });

  test('tenant API-key identity is rejected with 403', async ({ request }) => {
    // A valid tenant API key authenticates as a tenant service user, not an
    // admin user — the palette is admin-only, so it must be rejected.
    const res = await request.get('/api/palette-search?q=Lunar', {
      headers: {
        Authorization: `tenants API-Key ${MOON_API_KEY}`
      }
    });
    expect(res.status()).toBe(403);
  });

  test('returns empty results for a query below the minimum length', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin', { navigate: false });

    // Single-character query is below MIN_QUERY_LENGTH — no DB hit, empty list
    const res = await page.request.get('/api/palette-search?q=L');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  test('returns empty results when the query param is missing', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin', { navigate: false });

    const res = await page.request.get('/api/palette-search');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  test('finds seeded pages and posts for an admin user', async ({ page }) => {
    await loginAs(page, 'tenantAdmin', { navigate: false });

    // "Lunar" matches seeded pages (e.g. "Lunar Maria") and posts
    // (e.g. "Lunar Highlands"). This exercises the getPages/getPosts draft-mode
    // path with an authenticated admin identity.
    const res = await page.request.get('/api/palette-search?q=Lunar');
    expect(res.status()).toBe(200);

    const body = await res.json();
    const results: Array<{ collectionSlug: string; title: string }> =
      body.results;

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.collectionSlug === 'pages')).toBe(true);
    expect(results.some((r) => r.collectionSlug === 'posts')).toBe(true);
    // `contains` ignores case, and media is titled by its alt text
    expect(results.every((r) => r.title.toLowerCase().includes('lunar'))).toBe(
      true
    );
  });

  test('finds a never-published draft page', async ({ page, browser }) => {
    const draftSlug = `e2e-palette-draft-${Date.now()}`;
    const draftName = `Palette Draft ${Date.now()}`;

    // Create a never-published draft in a temporary logged-in context.
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAs(p, 'tenantAdmin');
    const createRes = await p.request.post('/api/pages', {
      data: {
        name: draftName,
        slug: draftSlug,
        layout: [{ blockType: 'content', columns: [] }],
        _status: 'draft'
      }
    });
    expect(createRes.ok()).toBe(true);
    await ctx.close();

    await loginAs(page, 'tenantAdmin', { navigate: false });

    const res = await page.request.get(
      `/api/palette-search?q=${encodeURIComponent('Palette Draft')}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    const results: Array<{ collectionSlug: string; title: string }> =
      body.results;

    // Draft-mode search surfaces the unpublished page by its versioned title.
    expect(
      results.some((r) => r.collectionSlug === 'pages' && r.title === draftName)
    ).toBe(true);
  });
});
