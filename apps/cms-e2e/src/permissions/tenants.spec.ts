/**
 * Tenants collection — permission tests
 * Scenarios: [T-01] [T-03] [T-04] from PERMISSIONS.md
 *
 * Only system users may create, update, or delete tenants.
 * All other authenticated users are denied regardless of their tenant role.
 */

import { randomUUID } from 'node:crypto';

import { Tenant } from '@codeware/shared/util/payload-types';
import type { APIResponse, Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

// Minimal valid tenant payload (slug auto-generated from name)
const newTenant = (scope: 'create' | 'update' | 'delete') => {
  const keyId = Date.now();
  return {
    name: `E2E ${scope} ${keyId}`,
    apiKey: `api-key-${keyId}`,
    supportedLocales: ['en']
  } as Tenant;
};

test.describe('Tenants — create [T-01]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('system user can create a tenant', async ({ page }) => {
    await loginAs(page, 'systemUser');
    const res = await page.request.post('/api/tenants', {
      data: newTenant('create')
    });
    expect(res.status()).toBe(201);
  });

  test('tenant admin cannot create a tenant', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.post('/api/tenants', {
      data: newTenant('create')
    });
    expect(res.status()).toBe(403);
  });

  test('tenant user cannot create a tenant', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const res = await page.request.post('/api/tenants', {
      data: newTenant('create')
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Tenants — update [T-03]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let tenantId: number;

  test.beforeAll(async ({ browser }) => {
    // Create a throwaway tenant to update/delete in these tests
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await loginAs(page, 'systemUser');
    const res = await page.request.post('/api/tenants', {
      data: newTenant('update')
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    tenantId = body.doc.id;
    await ctx.close();
  });

  test('system user can update a tenant', async ({ page }) => {
    await loginAs(page, 'systemUser');
    const res = await page.request.patch(`/api/tenants/${tenantId}`, {
      data: { description: 'updated by system user' }
    });
    expect(res.status()).toBe(200);
  });

  test('tenant admin cannot update a tenant', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.patch(`/api/tenants/${tenantId}`, {
      data: { description: 'should be denied' }
    });
    expect(res.status()).toBe(403);
  });

  test('tenant user cannot update a tenant', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const res = await page.request.patch(`/api/tenants/${tenantId}`, {
      data: { description: 'should be denied' }
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Tenants — delete [T-04]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let tenantId: number;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await loginAs(page, 'systemUser');
    const res = await page.request.post('/api/tenants', {
      data: newTenant('delete')
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    tenantId = body.doc.id;
    await ctx.close();
  });

  test('tenant admin cannot delete a tenant', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.delete(`/api/tenants/${tenantId}`);
    expect(res.status()).toBe(403);
  });

  test('tenant user cannot delete a tenant', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const res = await page.request.delete(`/api/tenants/${tenantId}`);
    expect(res.status()).toBe(403);
  });

  test('system user can delete a tenant', async ({ page }) => {
    await loginAs(page, 'systemUser');
    const res = await page.request.delete(`/api/tenants/${tenantId}`);
    expect(res.status()).toBe(200);
  });
});

/**
 * A workspace authenticates by its API key, so creating one without a key
 * must still leave it with one that works.
 */
test.describe('Tenants — API key on create', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a workspace created without a key gets one that authenticates', async ({
    page,
    playwright,
    baseURL
  }) => {
    await loginAs(page, 'systemUser');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiKey: _omitted, ...data } = newTenant('create');
    const created = await page.request.post('/api/tenants', { data });
    expect(created.status(), await created.text()).toBe(201);

    const { doc } = (await created.json()) as { doc: Tenant };
    expect(doc.apiKey).toMatch(/^[0-9a-f-]{36}$/);

    // Tenant-scoped reads answer a key Payload recognises and refuse one it
    // does not, so a 200 proves the key was stored with the index it is found
    // by. A context without the system user's cookie, so only the key counts
    const anonymous = await playwright.request.newContext({ baseURL });
    const readWith = (apiKey: string) =>
      anonymous.get('/api/tags?limit=1&depth=0', {
        headers: { Authorization: `tenants API-Key ${apiKey}` }
      });

    expect((await readWith(doc.apiKey as string)).status()).toBe(200);
    expect((await readWith(randomUUID())).status()).toBe(403);
    await anonymous.dispose();
  });
});

/**
 * The deployment name is a workspace's Infisical folder and Fly app suffix.
 * Renaming it would strand the old apps and their settings, so it is writable
 * while empty and fixed once set — for the API as well as the form.
 */
test.describe('Tenants — deployment name', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Lowercase and short, so a valid deployment name by construction */
  const uniqueName = () =>
    `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const createTenant = async (page: Page, data: Partial<Tenant> = {}) =>
    page.request.post('/api/tenants', {
      data: { ...newTenant('create'), ...data }
    });

  // Read from the write's own response: in tenant mode a workspace other than
  // the deployment's own cannot be fetched, but its update still answers
  const docOf = async (res: APIResponse) => {
    expect(res.status(), await res.text()).toBeLessThan(300);
    return ((await res.json()) as { doc: Tenant }).doc;
  };

  test('can be given once to a workspace that has none, then stays put', async ({
    page
  }) => {
    await loginAs(page, 'systemUser');

    const { id } = await docOf(await createTenant(page));

    const name = uniqueName();
    const first = await docOf(
      await page.request.patch(`/api/tenants/${id}`, {
        data: { deployment: name }
      })
    );
    expect(first.deployment).toBe(name);

    // Accepted, with the original kept — a denied field is dropped, not refused
    const second = await docOf(
      await page.request.patch(`/api/tenants/${id}`, {
        data: { deployment: uniqueName() }
      })
    );
    expect(second.deployment).toBe(name);
  });

  test('set when the workspace is created, it cannot be changed either', async ({
    page
  }) => {
    await loginAs(page, 'systemUser');

    const name = uniqueName();
    const { id } = await docOf(await createTenant(page, { deployment: name }));

    const updated = await docOf(
      await page.request.patch(`/api/tenants/${id}`, {
        data: { deployment: uniqueName() }
      })
    );

    expect(updated.deployment).toBe(name);
  });

  test('refuses a name that cannot be part of a Fly app name', async ({
    page
  }) => {
    await loginAs(page, 'systemUser');

    const res = await createTenant(page, { deployment: 'Demo_Site' });

    expect(res.status()).toBe(400);
  });

  test('refuses a name another workspace is already deployed under', async ({
    page
  }) => {
    await loginAs(page, 'systemUser');

    const name = uniqueName();
    const first = await createTenant(page, { deployment: name });
    expect(first.status(), await first.text()).toBe(201);

    const second = await createTenant(page, { deployment: name });

    expect(second.status()).toBe(400);
  });
});
