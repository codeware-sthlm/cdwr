/**
 * Authentication — login access in tenant mode
 *
 * E2E runs in moon tenant mode (TENANT_ID=moon).
 *
 * The verifyTenantModeAccessHook (afterLogin) denies login for any user that
 * lacks membership in the active tenant. This is the primary guard against
 * cross-tenant access — it fires before a session is created.
 *
 * - System users bypass the check (no tenant membership required).
 * - Users without any tenant memberships bypass the check (safe fallback).
 * - All other users must belong to moon to receive a session token.
 */
import { expect, test } from '../fixtures';
import { TEST_USERS } from '../helpers/login';

test.describe('Auth — login in tenant mode', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('system user can log in', async ({ page }) => {
    const { email, password } = TEST_USERS.systemUser;
    const res = await page.request.post('/api/users/login', {
      data: { email, password }
    });
    expect(res.status()).toBe(200);
  });

  test('tenant admin can log in', async ({ page }) => {
    const { email, password } = TEST_USERS.tenantAdmin;
    const res = await page.request.post('/api/users/login', {
      data: { email, password }
    });
    expect(res.status()).toBe(200);
  });

  test('tenant user can log in', async ({ page }) => {
    const { email, password } = TEST_USERS.tenantUser;
    const res = await page.request.post('/api/users/login', {
      data: { email, password }
    });
    expect(res.status()).toBe(200);
  });

  test('multi-tenant user can log in', async ({ page }) => {
    // multiAdmin belongs to moon+star — moon membership satisfies the hook.
    const { email, password } = TEST_USERS.multiAdmin;
    const res = await page.request.post('/api/users/login', {
      data: { email, password }
    });
    expect(res.status()).toBe(200);
  });

  test('user without moon access is denied login', async ({ page }) => {
    // otherAdmin belongs to star only. The verifyTenantModeAccessHook denies
    // login because star ∉ { moon }. No session token is issued.
    const { email, password } = TEST_USERS.otherAdmin;
    const res = await page.request.post('/api/users/login', {
      data: { email, password }
    });
    expect(res.status()).toBe(403);
  });
});
