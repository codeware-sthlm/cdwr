import type { PlatformTenantSlug } from '@codeware/shared/util/seed';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Look up a tenant by slug and return its ID. */
export async function getTenantId(
  page: Page,
  slug: PlatformTenantSlug
): Promise<number> {
  const res = await page.request.get(
    `/api/tenants?where[slug][equals]=${slug}&limit=1`
  );
  expect(res.status()).toBe(200);
  const id = (await res.json())?.docs?.[0]?.id as number | undefined;
  if (!id) throw new Error(`Tenant not found: ${slug}`);
  return id;
}
