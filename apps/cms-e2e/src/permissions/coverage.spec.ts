/**
 * Permission coverage — every collection must be classified
 *
 * The specs in this folder probe hardcoded lists of collections. A collection
 * added to the config and to none of those lists is not safe, it is simply
 * untested, and the suite still goes green — which is how COD-425 stayed hidden.
 *
 * This asserts the lists still describe the running config, so a new collection
 * fails here until someone states what it is. Classify it below and add it to
 * the matching spec.
 */

import {
  platformCollectionSlugs,
  systemCollectionSlugs,
  tenantCollectionSlugs
} from '@codeware/app-cms/util/definitions';
import type { CollectionSlug } from '@codeware/shared/util/payload-types';

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

/**
 * Owned by a tenant and scoped by the multi-tenant plugin.
 * Covered by `content-scope.spec.ts` and `api-key-scope.spec.ts`.
 */
const tenantOwned: ReadonlyArray<string> = tenantCollectionSlugs;

/**
 * Owned by the platform, shared by every workspace, maintained by system users.
 * Covered by `platform-owned.spec.ts`.
 */
const platformOwned: ReadonlyArray<string> = platformCollectionSlugs;

/**
 * Visible to system users only, not even readable by anyone else.
 */
const systemOnly: ReadonlyArray<string> = systemCollectionSlugs;

/**
 * Identities rather than content — they carry their own access model.
 * Covered by `users-management.spec.ts` and `tenants.spec.ts`.
 */
const identities = [
  'tenants',
  'users'
] as const satisfies readonly CollectionSlug[];

const classified = new Set([
  ...tenantOwned,
  ...platformOwned,
  ...systemOnly,
  ...identities
]);

test.describe('Permission coverage', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('every collection is classified for permission testing', async ({
    page
  }) => {
    await loginAs(page, 'systemUser', { navigate: false });

    // Asks the running config rather than a second copy of the list
    const res = await page.request.get('/api/access');
    expect(res.status()).toBe(200);

    const { collections } = (await res.json()) as {
      collections: Record<string, unknown>;
    };

    const slugs = Object.keys(collections);
    expect(slugs.length).toBeGreaterThan(0);

    const unclassified = slugs
      .filter((slug) => !classified.has(slug))
      // Payload's own collections are not part of this permission model
      .filter((slug) => !slug.startsWith('payload-'))
      .sort();

    expect(unclassified).toEqual([]);
  });

  test('no classification names a collection that is gone', async ({
    page
  }) => {
    await loginAs(page, 'systemUser', { navigate: false });

    const res = await page.request.get('/api/access');
    const { collections } = (await res.json()) as {
      collections: Record<string, unknown>;
    };

    const registered = new Set(Object.keys(collections));
    const stale = [...classified]
      .filter((slug) => !registered.has(slug))
      .sort();

    expect(stale).toEqual([]);
  });
});
