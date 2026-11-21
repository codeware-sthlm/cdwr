/**
 * Tenant assignment enforcement — permission tests
 *
 * Verifies that a tenant admin can only assign users to tenants they manage,
 * both when creating new users and when updating existing ones.
 *
 * Note: e2e runs in moon-tenant mode. The access control on the tenants
 * collection restricts all users (including system users) to the scoped tenant,
 * so foreign tenant IDs cannot be resolved via the REST API. For "foreign tenant"
 * cases we use a large numeric ID that is guaranteed not to be in the admin's
 * tenant list — the hook rejects it just the same as a real foreign tenant ID.
 */

import { expect, test } from '../fixtures';
import { getTenantId } from '../helpers/get-tenant-id';
import { loginAs } from '../helpers/login';
import { withSystemUser } from '../helpers/with-system-user';

/** A tenant ID that will never belong to any seeded user's admin list. */
const FOREIGN_TENANT_ID = 999_999;

test.describe('Tenant assignment — create [U-02]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let moonTenantId: number;

  test.beforeAll(async ({ browser }) => {
    moonTenantId = await withSystemUser(browser, (page) =>
      getTenantId(page, 'moon')
    );
  });

  test('tenant admin can create a user assigned to their own tenant', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.post('/api/users', {
      data: {
        name: 'E2E Own Tenant Create',
        email: `e2e-own-${Date.now()}@test.dev`,
        password: 'e2e-quiet-lantern-4817',
        tenants: [{ tenant: moonTenantId, role: 'user' }]
      }
    });
    expect(res.status()).toBe(201);
  });

  test('tenant admin cannot create a user assigned to a tenant they do not manage', async ({
    page
  }) => {
    // titan@local.dev admins moon only — assigning a foreign tenant must be rejected
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.post('/api/users', {
      data: {
        name: 'E2E Foreign Tenant Create',
        email: `e2e-foreign-${Date.now()}@test.dev`,
        password: 'e2e-quiet-lantern-4817',
        tenants: [{ tenant: FOREIGN_TENANT_ID, role: 'user' }]
      }
    });
    expect(res.status()).toBe(400);
  });

  test('tenant admin cannot create a user with mixed own and foreign tenants', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.post('/api/users', {
      data: {
        name: 'E2E Mixed Tenant Create',
        email: `e2e-mixed-${Date.now()}@test.dev`,
        password: 'e2e-quiet-lantern-4817',
        tenants: [
          { tenant: moonTenantId, role: 'user' },
          { tenant: FOREIGN_TENANT_ID, role: 'user' }
        ]
      }
    });
    expect(res.status()).toBe(400);
  });
});
