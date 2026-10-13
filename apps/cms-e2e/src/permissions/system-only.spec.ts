/**
 * System-only collections — permission tests
 *
 * `invite-codes` is platform owned and visible to system users alone: an
 * editor or a tenant api key can neither list nor create one. Even a system
 * user never gets `codeHash` back, since the field denies every read.
 */

import { systemCollectionSlugs } from '@codeware/app-cms/util/definitions';
import { generateInviteCode } from '@codeware/shared/util/invite-code';

import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

/** Tenant API keys from seed data (always present in the e2e environment) */
const MOON_API_KEY = 'b9c2fb25-df77-4304-a60a-028779a2cb37';
const STAR_API_KEY = 'a76d0168-f9b2-48d2-bc57-96e45aaf8542';

const apiKeyHeader = (apiKey: string) => ({
  Authorization: `tenants API-Key ${apiKey}`
});

/** Minimal valid document per slug, so a refusal is about access only */
const createData = (slug: (typeof systemCollectionSlugs)[number]) => {
  switch (slug) {
    case 'invite-codes':
      return {
        code: generateInviteCode(),
        maxUses: 1,
        note: `e2e-${Date.now()}`
      };
  }
};

test.describe('System-only collections', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const slug of systemCollectionSlugs) {
    for (const user of ['tenantAdmin', 'tenantUser'] as const) {
      test(`${user} cannot read or create ${slug}`, async ({ page }) => {
        await loginAs(page, user, { navigate: false });

        const read = await page.request.get(`/api/${slug}?limit=1&depth=0`);
        expect([403, 404], `GET /api/${slug}`).toContain(read.status());

        const create = await page.request.post(`/api/${slug}`, {
          data: createData(slug)
        });
        expect([403, 404], `POST /api/${slug}`).toContain(create.status());
      });
    }

    for (const [label, apiKey] of [
      ['own', MOON_API_KEY],
      ['foreign', STAR_API_KEY]
    ] as const) {
      test(`${label} api key cannot read or create ${slug}`, async ({
        request
      }) => {
        const read = await request.get(`/api/${slug}?limit=1&depth=0`, {
          headers: apiKeyHeader(apiKey)
        });
        expect([403, 404], `GET /api/${slug}`).toContain(read.status());

        const create = await request.post(`/api/${slug}`, {
          headers: apiKeyHeader(apiKey),
          data: createData(slug)
        });
        expect([403, 404], `POST /api/${slug}`).toContain(create.status());
      });
    }

    test(`anonymous cannot read ${slug}`, async ({ request }) => {
      const res = await request.get(`/api/${slug}?limit=1&depth=0`);
      expect([403, 404], `GET /api/${slug}`).toContain(res.status());
    });

    test(`system user can read ${slug} and never sees codeHash`, async ({
      page
    }) => {
      await loginAs(page, 'systemUser', { navigate: false });

      const create = await page.request.post(`/api/${slug}`, {
        data: createData(slug)
      });
      expect(create.status(), `POST /api/${slug}`).toBe(201);
      const created = (await create.json()) as {
        doc: { id: number } & Record<string, unknown>;
      };

      try {
        expect(created.doc).not.toHaveProperty('codeHash');

        const list = await page.request.get(`/api/${slug}?limit=100&depth=0`);
        expect(list.status(), `GET /api/${slug}`).toBe(200);
        const listed = (await list.json()) as {
          docs: Array<{ id: number } & Record<string, unknown>>;
        };
        expect(listed.docs.some((d) => d.id === created.doc.id)).toBe(true);
        for (const doc of listed.docs) {
          expect(doc).not.toHaveProperty('codeHash');
        }

        const one = await page.request.get(
          `/api/${slug}/${created.doc.id}?depth=0`
        );
        expect(one.status()).toBe(200);
        expect(await one.json()).not.toHaveProperty('codeHash');
      } finally {
        await page.request.delete(`/api/${slug}/${created.doc.id}`);
      }
    });
  }
});
