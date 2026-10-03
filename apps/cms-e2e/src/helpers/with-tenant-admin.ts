import type { Browser, Page } from '@playwright/test';

import { loginAs } from './login';

/**
 * Open a temporary browser context logged in as tenantAdmin, run a callback,
 * then close the context. For setup and cleanup in a spec whose own tests
 * run without a session.
 */
export async function withTenantAdmin<T>(
  browser: Browser,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, 'tenantAdmin', { navigate: false });
  try {
    return await fn(page);
  } finally {
    await ctx.close();
  }
}
