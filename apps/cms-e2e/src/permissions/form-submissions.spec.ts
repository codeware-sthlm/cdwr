/**
 * Form submissions — tenant scope tests
 * Scenarios: [F-01] [F-02] from PERMISSIONS.md
 *
 * The form-builder plugin ships `read: ({ req: { user } }) => !!user` and leaves
 * delete at the Payload default, and the multi-tenant plugin only constrains
 * admin users. A tenant api key identity was therefore unscoped and could read
 * and delete every tenant's submissions (COD-425). Reads now run through
 * `userOrApiKeyAccess` and deleting is an admin user operation.
 *
 * Creating is the one write a tenant api key still performs — see [K-02] in
 * api-key-scope.spec.ts for the rest of the key surface.
 *
 * E2E runs in moon tenant mode, where api key requests are not signature
 * verified — these tests cover the tenant constraint only.
 */

import { expect, test } from '../fixtures';
import { createForm } from '../helpers/create-form';
import { humanProof } from '../helpers/human-proof';
import { loginAs } from '../helpers/login';

/** Tenant API keys from seed data (always present in the e2e environment) */
const MOON_API_KEY = 'b9c2fb25-df77-4304-a60a-028779a2cb37';
const STAR_API_KEY = 'a76d0168-f9b2-48d2-bc57-96e45aaf8542';

const apiKeyHeader = (apiKey: string) => ({
  Authorization: `tenants API-Key ${apiKey}`
});

test.describe('Form submissions — tenant scope', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Submission owned by moon, created through the site form route */
  let submissionId: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // The tenant is derived from the admin session, so the form lands in moon
      await loginAs(page, 'tenantAdmin', { navigate: false });

      const form = await createForm(page, `E2E Scope Form ${Date.now()}`);

      // /api/form-submissions is a site route that authenticates as the
      // deployment's own tenant (moon), regardless of the caller
      const submissionRes = await page.request.post('/api/form-submissions', {
        data: {
          form: form.id,
          humanCheck: humanProof(),
          submissionData: [{ field: 'email', value: 'moon@example.com' }]
        }
      });
      expect(submissionRes.status(), await submissionRes.text()).toBe(200);
      submissionId = (await submissionRes.json()).id;
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // [F-01] Read a moon submission
  // -------------------------------------------------------------------------

  test('moon api key can read a moon submission [F-01]', async ({
    request
  }) => {
    const res = await request.get(`/api/form-submissions/${submissionId}`, {
      headers: apiKeyHeader(MOON_API_KEY)
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(submissionId);
  });

  test('star api key cannot read a moon submission [F-01]', async ({
    request
  }) => {
    const res = await request.get(`/api/form-submissions/${submissionId}`, {
      headers: apiKeyHeader(STAR_API_KEY)
    });
    expect([403, 404]).toContain(res.status());
  });

  test('unauthenticated request cannot read a submission [F-01]', async ({
    request
  }) => {
    const res = await request.get(`/api/form-submissions/${submissionId}`);
    expect([401, 403]).toContain(res.status());
  });

  // -------------------------------------------------------------------------
  // [F-02] Delete a moon submission
  // -------------------------------------------------------------------------

  test('no api key can delete a submission [F-02]', async ({ request }) => {
    // Deleting is an admin user operation — api key clients are read-only
    for (const apiKey of [STAR_API_KEY, MOON_API_KEY]) {
      const res = await request.delete(
        `/api/form-submissions/${submissionId}`,
        {
          headers: apiKeyHeader(apiKey)
        }
      );
      expect([403, 404]).toContain(res.status());
    }

    // The document must still be there for its owner
    const check = await request.get(`/api/form-submissions/${submissionId}`, {
      headers: apiKeyHeader(MOON_API_KEY)
    });
    expect(check.status()).toBe(200);
  });

  // Runs last — it removes the document the other scenarios rely on
  test('tenant admin can delete a moon submission [F-02]', async ({
    browser
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAs(page, 'tenantAdmin', { navigate: false });
      const res = await page.request.delete(
        `/api/form-submissions/${submissionId}`
      );
      expect(res.status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});
