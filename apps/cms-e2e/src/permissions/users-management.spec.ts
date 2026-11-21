/**
 * Users collection — permission tests
 * Scenarios: [U-01]–[U-10] from PERMISSIONS.md
 */
import { expect, test } from '../fixtures';
import { getMe } from '../helpers/get-me';
import { getTenantId } from '../helpers/get-tenant-id';
import { getUserId } from '../helpers/get-user-id';
import { TEST_USERS, loginAs } from '../helpers/login';
import { withSystemUser } from '../helpers/with-system-user';

// ---------------------------------------------------------------------------
// [U-01] Create user
// ---------------------------------------------------------------------------

test.describe('Users — create [U-01]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let moonTenantId: number;

  test.beforeAll(async ({ browser }) => {
    moonTenantId = await withSystemUser(browser, (page) =>
      getTenantId(page, 'moon')
    );
  });

  test('system user can create a user', async ({ page }) => {
    await loginAs(page, 'systemUser');
    const res = await page.request.post('/api/users', {
      data: {
        name: 'E2E System Created',
        email: `e2e-sys-${Date.now()}@test.dev`,
        password: 'e2e-quiet-lantern-4817',
        role: 'user',
        tenants: [{ tenant: moonTenantId, role: 'user' }]
      }
    });
    expect(res.status()).toBe(201);
  });

  test('tenant admin can create a user in their tenant', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.post('/api/users', {
      data: {
        name: 'E2E Admin Created',
        email: `e2e-adm-${Date.now()}@test.dev`,
        password: 'e2e-quiet-lantern-4817',
        tenants: [{ tenant: moonTenantId, role: 'user' }]
      }
    });
    expect(res.status()).toBe(201);
  });

  test('tenant user cannot create a user', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const res = await page.request.post('/api/users', {
      data: {
        name: 'E2E Denied Create',
        email: `e2e-deny-${Date.now()}@test.dev`,
        password: 'e2e-quiet-lantern-4817',
        tenants: [{ tenant: moonTenantId, role: 'user' }]
      }
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// [U-03] Update own profile
// ---------------------------------------------------------------------------

test.describe('Users — update own profile [U-03]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('tenant user can update their own name', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const me = await getMe(page);
    const res = await page.request.patch(`/api/users/${me.id}`, {
      data: { name: 'Phobos Updated' }
    });
    expect(res.status()).toBe(200);

    // Restore original name
    await page.request.patch(`/api/users/${me.id}`, {
      data: { name: 'Phobos Moon' }
    });
  });

  test('tenant admin can update their own name', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const me = await getMe(page);
    const res = await page.request.patch(`/api/users/${me.id}`, {
      data: { name: 'Titan Updated' }
    });
    expect(res.status()).toBe(200);

    // Restore original name
    await page.request.patch(`/api/users/${me.id}`, {
      data: { name: 'Titan Moon' }
    });
  });
});

// ---------------------------------------------------------------------------
// [U-04] [U-04b] Tenant admin/user updates another user in same tenant
// [U-05] Tenant admin cannot update user in non-admin tenant
// ---------------------------------------------------------------------------

test.describe('Users — cross-user update [U-04] [U-04b] [U-05]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** User without access to the current tenant */
  let crossUserId: number;

  test.beforeAll(async ({ browser }) => {
    crossUserId = await withSystemUser(browser, (page) =>
      getUserId(page, TEST_USERS.otherAdmin.email)
    );
  });

  test('tenant admin can update another user in the same tenant [U-04]', async ({
    page
  }) => {
    // titan (moon admin) updates phobos (moon user).
    // Both are in moon, so titan can look up phobos directly — no system user needed.
    await loginAs(page, 'tenantAdmin');
    const tenantUserId = await getUserId(page, TEST_USERS.tenantUser.email);
    const res = await page.request.patch(`/api/users/${tenantUserId}`, {
      data: { description: 'updated by admin' }
    });
    expect(res.status()).toBe(200);
  });

  test('tenant user can update basic fields of another user in same tenant [U-04 inverse]', async ({
    page
  }) => {
    // adminAccessToAllDocTenants returns true when data.tenants is absent,
    // so phobos can update titan's description — the plugin WHERE constraint
    // { or: [{ id: phobos }, { tenants.tenant: { in: [moon] } }] } matches
    // because titan belongs to moon.
    // Both are in moon, so phobos can look up titan directly.
    await loginAs(page, 'tenantUser');
    const tenantAdminId = await getUserId(page, TEST_USERS.tenantAdmin.email);
    const res = await page.request.patch(`/api/users/${tenantAdminId}`, {
      data: { description: 'updated by user' }
    });
    expect(res.status()).toBe(200);
  });

  test('tenant user cannot change tenant memberships of another user [U-04b]', async ({
    page
  }) => {
    // When data.tenants IS present, adminAccessToAllDocTenants checks admin access.
    // Phobos has no admin role anywhere → denied.
    await loginAs(page, 'tenantUser');
    const [tenantAdminId, moonId] = await Promise.all([
      getUserId(page, TEST_USERS.tenantAdmin.email),
      getTenantId(page, 'moon')
    ]);
    const res = await page.request.patch(`/api/users/${tenantAdminId}`, {
      data: { tenants: [{ tenant: moonId, role: 'user' }] }
    });
    expect(res.status()).toBe(403);
  });

  test('tenant user cannot strip all tenant memberships from another user [U-04b — empty tenants array]', async ({
    page
  }) => {
    await loginAs(page, 'tenantUser');
    const tenantAdminId = await getUserId(page, TEST_USERS.tenantAdmin.email);
    const res = await page.request.patch(`/api/users/${tenantAdminId}`, {
      data: { tenants: [] }
    });
    expect(res.status()).toBe(403);
  });

  test('tenant admin cannot update a user outside their tenants [U-05]', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.patch(`/api/users/${crossUserId}`, {
      data: { description: 'should be denied' }
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// [U-07] Delete self — always denied for non-system users
// ---------------------------------------------------------------------------

test.describe('Users — delete self [U-07]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('tenant admin cannot delete themselves', async ({ page }) => {
    await loginAs(page, 'tenantAdmin');
    const me = await getMe(page);
    const res = await page.request.delete(`/api/users/${me.id}`);
    expect(res.status()).toBe(403);
  });

  test('tenant user cannot delete themselves', async ({ page }) => {
    await loginAs(page, 'tenantUser');
    const me = await getMe(page);
    const res = await page.request.delete(`/api/users/${me.id}`);
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// [U-08] Role field — only system user may set users.role
// ---------------------------------------------------------------------------

test.describe('Users — role field protection [U-08]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('tenant admin patch with role field is not rejected at the request level', async ({
    page
  }) => {
    // Field-level access drops the role value silently rather than rejecting the
    // whole request — the PATCH itself returns 200.
    await loginAs(page, 'tenantAdmin');
    const me = await getMe(page);
    const res = await page.request.patch(`/api/users/${me.id}`, {
      data: { role: 'system-user' }
    });
    expect(res.status()).toBe(200);
  });

  test('tenant admin role stays "user" after attempting escalation to system user', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin');
    const me = await getMe(page);
    await page.request.patch(`/api/users/${me.id}`, {
      data: { role: 'system-user' }
    });
    // Re-fetch to confirm the field was silently dropped
    const verify = await page.request.get(`/api/users/${me.id}`);
    expect((await verify.json()).role).toBe('user');
  });

  test('system user can set a user role to system-user', async ({ page }) => {
    await loginAs(page, 'systemUser');
    const tenantUserId = await getUserId(page, TEST_USERS.tenantUser.email);

    const res = await page.request.patch(`/api/users/${tenantUserId}`, {
      data: { role: 'system-user' }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).doc.role).toBe('system-user');

    // Restore to 'user'
    await page.request.patch(`/api/users/${tenantUserId}`, {
      data: { role: 'user' }
    });
  });
});

// ---------------------------------------------------------------------------
// [U-10] Read — users outside own tenants are not visible
// ---------------------------------------------------------------------------

test.describe('Users — read scope [U-10]', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('tenant admin cannot read users outside their tenants', async ({
    page
  }) => {
    await loginAs(page, 'tenantAdmin');
    const res = await page.request.get(
      `/api/users?where[email][equals]=${TEST_USERS.otherAdmin.email}&limit=1`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.totalDocs).toBe(0);
  });

  test('system user can read any user', async ({ page }) => {
    await loginAs(page, 'systemUser');
    const res = await page.request.get(
      `/api/users?where[email][equals]=${TEST_USERS.otherAdmin.email}&limit=1`
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).totalDocs).toBe(1);
  });
});
