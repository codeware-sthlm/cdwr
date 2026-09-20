import type { User } from '@codeware/shared/util/payload-types';
import type { Page } from '@playwright/test';

import { createCookie } from './create-cookie';
import { isTenantObject } from './is-tenant-object';

/**
 * Seed user credentials — see PERMISSIONS.md for the full role/access description
 * of each user. Password defaults to 'dev' when blank in seed data.
 */
export const TEST_USERS = {
  /** System user. Full platform access, no tenant membership. */
  systemUser: { email: 'system@local.dev', password: 'dev' },

  /** Moon tenant admin. Core tenant admin permission tests. */
  tenantAdmin: { email: 'titan@local.dev', password: 'dev' },

  /** Moon tenant user. Core tenant user permission tests. */
  tenantUser: { email: 'phobos@local.dev', password: 'dev' },

  /** Moon+Star+Sun tenant admin. Multi-tenant cookie scoping tests. */
  multiAdmin: { email: 'black@local.dev', password: 'dev' },

  /** Moon+Star+Sun tenant user. Multi-tenant cookie scoping tests. */
  multiUser: { email: 'iss@local.dev', password: 'dev' },

  /** Star-only tenant admin. Represents "no moon access" in cross-tenant tests. */
  otherAdmin: { email: 'antares@local.dev', password: 'dev' },

  /** Moon reader. Reads members-only content on the site, never the admin. */
  reader: { email: 'luna@local.dev', password: 'dev' }
} as const satisfies Record<string, { email: string; password: string }>;

export type TestUser = keyof typeof TEST_USERS;

type LoginOptions = {
  /**
   * Whether to navigate to /admin after setting cookies.
   *
   * Use `false` for API-only tests to avoid the admin page load
   * and any client-side session interference it may cause.
   *
   * For tests that require UI interactions after login, set this to `true`.
   * @default false
   */
  navigate?: boolean;
};

/**
 * Log in to the Payload admin panel via REST API as the given user.
 *
 * Uses /api/users/login instead of the UI form to avoid flakiness with
 * React controlled inputs. Sets the returned JWT to `payload-token`
 * cookie so the browser context is authenticated.
 *
 * Also sets the `payload-tenant` cookie that the multi-tenant plugin's
 * TenantSelectionProvider normally writes client-side after UI login.
 * Without it, Payload rejects document saves with a missing-tenant error.
 *
 * The tenant cookie is set to the first membership whose tenant slug matches
 * the active TENANT_ID env var ('moon' in e2e). Falls back to the first
 * membership if no match is found (system users have no tenants).
 */
export async function loginAs(
  page: Page,
  user: TestUser,
  { navigate = true }: LoginOptions = {}
): Promise<void> {
  const { email, password } = TEST_USERS[user];

  const response = await page.request.post('/api/users/login', {
    data: { email, password }
  });

  if (!response.ok()) {
    throw new Error(
      `Login failed for ${email}: ${response.status()} ${await response.text()}`
    );
  }

  const loginData = await response.json();
  const { token, user: userData } = loginData as { token: string; user: User };

  const tenantId = resolveTenantId(userData);

  if (process.env['LOG_LEVEL'] === 'debug') {
    console.log(
      `[login] Logged in as ${userData?.email} (${user}), tenant cookie: ${tenantId ?? 'none'}`
    );
  }

  const cookies = [createCookie('payload-token', token)];

  if (tenantId) {
    cookies.push(createCookie('payload-tenant', tenantId));
  }

  await page.context().addCookies(cookies);

  // Payload 3.79+ added CSRF protection to cookie-based JWT extraction: requests
  // without an Origin/Sec-Fetch-Site header (which Playwright's APIRequestContext
  // does not always send) are rejected even with a valid cookie. Setting the
  // Authorization header forces Payload to use the JWT extraction strategy
  // (first in the default jwtOrder) instead of the cookie strategy, bypassing
  // the CSRF check for `page.request.*` calls. Browser navigations still
  // continue to use the cookie since they do send proper headers.
  await page.context().setExtraHTTPHeaders({ Authorization: `JWT ${token}` });

  if (navigate) {
    await page.goto('/admin');
  }
}

/**
 * Resolve the tenant ID to use for the `payload-tenant` cookie.
 *
 * Prefers the tenant whose slug matches TENANT_ID env var (e.g. 'moon'),
 * falling back to the first membership. Returns undefined for system users.
 */
function resolveTenantId(user: User): number | string | undefined {
  const memberships = user?.tenants;
  if (!memberships?.length) return undefined;

  const activeTenantSlug = process.env['TENANT_ID'];

  if (activeTenantSlug) {
    const match = memberships.find(
      ({ tenant }) => isTenantObject(tenant) && tenant.slug === activeTenantSlug
    );
    if (match) {
      const t = match.tenant;
      return isTenantObject(t) ? t.id : t;
    }
  }

  // Fallback to first membership
  const first = memberships[0].tenant;
  return isTenantObject(first) ? first.id : first;
}
