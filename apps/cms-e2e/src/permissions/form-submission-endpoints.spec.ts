/**
 * Form submission admin endpoints — permission tests
 * Scenarios: [F-03] [F-04] from PERMISSIONS.md
 *
 * `form-submissions-read` and `form-submissions-export` back the custom
 * submissions admin UI (COD-432). Both are admin-user surfaces: a tenant api
 * key has no business marking messages read or bulk-downloading them, and the
 * read endpoint writes with `overrideAccess` because submissions are immutable
 * — so its own authorization is the only thing standing between a caller and
 * another tenant's data. These tests exist to keep that honest.
 *
 * E2E runs in moon tenant mode.
 */

import type { FormSubmission } from '@codeware/shared/util/payload-types';

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

test.describe('Form submission admin endpoints', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** A moon form and one submission against it, created through the site route */
  let formId: number;
  let submissionId: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // The tenant is derived from the admin session, so the form lands in moon
      await loginAs(page, 'tenantAdmin', { navigate: false });

      const form = await createForm(page, `E2E Endpoint Form ${Date.now()}`);
      formId = form.id;

      const submissionRes = await page.request.post('/api/form-submissions', {
        data: {
          form: formId,
          humanCheck: humanProof(),
          submissionData: [
            { field: 'email', value: 'moon@example.com' },
            // Anyone can post this through a public form; the export must not
            // hand Excel a live formula
            {
              field: 'message',
              value: '=HYPERLINK("http://evil.example","x")'
            },
            // Leading whitespace must not slip a formula past the guard
            { field: 'note', value: ' =1+1' }
          ]
        }
      });
      expect(submissionRes.status(), await submissionRes.text()).toBe(200);
      submissionId = (await submissionRes.json()).id;
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // [F-03] Mark submissions read
  // -------------------------------------------------------------------------

  test('tenant admin can mark a moon submission read [F-03]', async ({
    browser
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAs(page, 'tenantAdmin', { navigate: false });

      const res = await page.request.post('/api/form-submissions-read', {
        data: { ids: [submissionId], read: true }
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).updated).toEqual([submissionId]);

      // The marker has to survive the round trip — it drives the nav badge
      const check = await page.request.get(
        `/api/form-submissions/${submissionId}?depth=0`
      );
      const doc = (await check.json()) as FormSubmission;
      expect(doc.readAt).toBeTruthy();

      // `readAt` is when it was *first* opened — marking it again must not
      // restamp it, or the field silently becomes "last read"
      await page.request.post('/api/form-submissions-read', {
        data: { ids: [submissionId], read: true }
      });
      const again = await page.request.get(
        `/api/form-submissions/${submissionId}?depth=0`
      );
      expect(((await again.json()) as FormSubmission).readAt).toBe(doc.readAt);

      // And clear again
      const undo = await page.request.post('/api/form-submissions-read', {
        data: { ids: [submissionId], read: false }
      });
      expect(undo.status()).toBe(200);

      const recheck = await page.request.get(
        `/api/form-submissions/${submissionId}?depth=0`
      );
      expect(((await recheck.json()) as FormSubmission).readAt).toBeFalsy();

      // A string 'false' arrives from form and query encodings; it must clear
      // the marker rather than do the opposite of what was asked
      await page.request.post('/api/form-submissions-read', {
        data: { ids: [submissionId], read: true }
      });
      await page.request.post('/api/form-submissions-read', {
        data: { ids: [submissionId], read: 'false' }
      });
      const coerced = await page.request.get(
        `/api/form-submissions/${submissionId}?depth=0`
      );
      expect(((await coerced.json()) as FormSubmission).readAt).toBeFalsy();
    } finally {
      await context.close();
    }
  });

  test('no api key can mark a submission read [F-03]', async ({ request }) => {
    // Marking read is an admin user action — keys are read-only clients
    for (const apiKey of [MOON_API_KEY, STAR_API_KEY]) {
      const res = await request.post('/api/form-submissions-read', {
        headers: apiKeyHeader(apiKey),
        data: { ids: [submissionId], read: true }
      });
      expect(res.status()).toBe(403);
    }
  });

  test('unauthenticated request cannot mark a submission read [F-03]', async ({
    request
  }) => {
    const res = await request.post('/api/form-submissions-read', {
      data: { ids: [submissionId], read: true }
    });
    expect(res.status()).toBe(403);
  });

  test('a user outside the workspace cannot mark it read [F-03]', async ({
    browser
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // The endpoint writes with `overrideAccess`, so a silent no-op here is
      // the pass — it must never fall through to the update
      await loginAs(page, 'systemUser', { navigate: false });

      const res = await page.request.post('/api/form-submissions-read', {
        data: { ids: [-1, 999999], read: true }
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).updated).toEqual([]);
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // [F-04] Export submissions as CSV
  // -------------------------------------------------------------------------

  test('tenant admin can export a moon form [F-04]', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAs(page, 'tenantAdmin', { navigate: false });

      const res = await page.request.get(
        `/api/form-submissions-export?form=${formId}`
      );
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('text/csv');
      expect(res.headers()['content-disposition']).toContain('attachment');
      const csv = await res.text();
      expect(csv).toContain('moon@example.com');

      // Neutralised with a leading apostrophe, never exported as a live formula
      expect(csv).toContain("'=HYPERLINK");
      expect(csv).not.toContain('"=HYPERLINK');
      expect(csv).toContain("' =1+1");
      expect(csv).not.toContain('" =1+1');
    } finally {
      await context.close();
    }
  });

  test('export rejects a request without a form [F-04]', async ({
    browser
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAs(page, 'tenantAdmin', { navigate: false });

      const res = await page.request.get('/api/form-submissions-export');
      expect(res.status()).toBe(400);
    } finally {
      await context.close();
    }
  });

  test('no api key can export submissions [F-04]', async ({ request }) => {
    for (const apiKey of [MOON_API_KEY, STAR_API_KEY]) {
      const res = await request.get(
        `/api/form-submissions-export?form=${formId}`,
        { headers: apiKeyHeader(apiKey) }
      );
      expect(res.status()).toBe(403);
    }
  });

  test('unauthenticated request cannot export submissions [F-04]', async ({
    request
  }) => {
    const res = await request.get(
      `/api/form-submissions-export?form=${formId}`
    );
    expect(res.status()).toBe(403);
  });
});
