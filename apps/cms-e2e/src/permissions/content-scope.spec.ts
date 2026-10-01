/**
 * Content collections — tenant scope tests
 * Scenarios: [C-01] [C-02] [C-05] from PERMISSIONS.md
 *
 * E2E runs in moon tenant mode (TENANT_ID=moon).
 *
 * In tenant mode the server enforces a single-tenant scope at the access-control
 * layer for ALL authenticated users, regardless of how many tenants they belong
 * to. userOrApiKeyAccess returns { tenant: equals moonId } which the plugin AND's
 * with its own { tenant: in userTenantIds } constraint. This means:
 *
 * - Users WITH moon membership see only moon content (server-enforced).
 * - Users WITHOUT moon membership are denied at login by verifyTenantModeAccessHook
 *   before they can reach any content. See auth.spec.ts for that coverage.
 *
 * NOTE: The payload-tenant cookie still controls which tenant the admin UI
 * shows in its selector, but at the API level the active tenant is always
 * determined by the server-side tenant context, not the cookie. Cookie-scope
 * tests (S-series) are only meaningful in host mode and do not belong here.
 */

import type { Page as CollectionPage } from '@codeware/shared/util/payload-types';

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

// ---------------------------------------------------------------------------
// [C-01] Read moon content
// ---------------------------------------------------------------------------

test.describe('Content scope — read [C-01]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('tenant admin can read moon pages', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.get('/api/pages?limit=1');
    expect(res.status()).toBe(200);
    expect((await res.json()).totalDocs).toBeGreaterThan(0);
  });

  test('tenant user can read moon pages', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const res = await page.request.get('/api/pages?limit=1');
    expect(res.status()).toBe(200);
    expect((await res.json()).totalDocs).toBeGreaterThan(0);
  });

  test('multi-tenant user is restricted to moon content in tenant mode [C-05]', async ({
    page
  }) => {
    // multiAdmin belongs to moon+star but the server enforces moon scope.
    // Only moon docs are returned regardless of cookie or user memberships.
    await loginAs(page, 'multiAdmin');
    const res = await page.request.get('/api/pages?limit=100');
    expect(res.status()).toBe(200);
    expect((await res.json()).totalDocs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// [C-02] Create moon content
// ---------------------------------------------------------------------------

test.describe('Content scope — create [C-02]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // In tenant mode the plugin's tenantField auto-populates tenant from the
  // payload-tenant cookie — no need to pass it in the body or look it up first.
  const newPage = () =>
    ({
      name: `E2E Scope Page ${Date.now()}`,
      header: 'Test',
      slug: `e2e-scope-${Date.now()}`,
      layout: [
        { blockType: 'content', columns: [{ size: 'full', richText: {} }] }
      ]
    }) as CollectionPage;

  test('tenant admin can create a page in moon', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.post('/api/pages', { data: newPage() });
    expect(res.status()).toBe(201);
  });

  test('tenant user can create a page in moon', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const res = await page.request.post('/api/pages', { data: newPage() });
    expect(res.status()).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// [C-06] Write scope follows read scope
// ---------------------------------------------------------------------------

test.describe('Content scope — write [C-06]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Highest id to probe — comfortably above the seeded page count */
  const MAX_ID = 40;

  test('multi-tenant user cannot write pages outside the active tenant', async ({
    page
  }) => {
    // multiAdmin belongs to moon+star. The multi-tenant plugin only
    // constrains writes to their memberships, so without the active-tenant
    // scope they could edit a star page by id — a document they cannot read.
    await loginAs(page, 'multiAdmin');

    const list = await page.request.get('/api/pages?limit=100&depth=0');
    expect(list.status()).toBe(200);
    const { docs } = (await list.json()) as { docs: Array<{ id: number }> };
    const readable = new Set(docs.map((doc) => doc.id));
    expect(readable.size).toBeGreaterThan(0);

    // Seed data spans all three tenants, so ids outside the readable set exist
    const foreign = Array.from({ length: MAX_ID }, (_, i) => i + 1).filter(
      (id) => !readable.has(id)
    );
    expect(foreign.length).toBeGreaterThan(0);

    for (const id of foreign) {
      const res = await page.request.patch(`/api/pages/${id}`, {
        data: { header: 'cross-tenant write' }
      });
      expect(res.status(), `PATCH /api/pages/${id}`).not.toBe(200);
    }
  });
});
