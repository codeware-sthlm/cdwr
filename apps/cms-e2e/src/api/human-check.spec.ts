/**
 * The guard in front of the public submit endpoints — COD-481.
 *
 * These endpoints are the only unauthenticated writes the platform accepts,
 * and a submission is not just a row: the form builder sends mail on create.
 * So what matters is not that the guard exists but that it actually refuses,
 * which is what these post for real to find out.
 *
 * Turnstile is not configured in e2e, so what runs here is the pair that
 * guards a site with no key: the hidden field and the clock.
 *
 * E2E runs in moon tenant mode.
 */

import { expect, test } from '../fixtures';
import { humanProof } from '../helpers/human-proof';

/**
 * A form id that need not exist.
 *
 * Every refusal below happens before the submission reaches Payload, so the
 * test proves the guard closed rather than the form being unknown — which a
 * real id could not distinguish.
 */
const ANY_FORM = 999_999;

const submissionData = [{ field: 'email', value: 'someone@example.com' }];

test.describe('Human check on POST /api/form-submissions', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('refuses a submission carrying no proof at all', async ({ request }) => {
    const response = await request.post('/api/form-submissions', {
      data: { form: ANY_FORM, submissionData }
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe(
      'Could not accept this submission'
    );
  });

  test('refuses a submission that filled the hidden field', async ({
    request
  }) => {
    const response = await request.post('/api/form-submissions', {
      data: {
        form: ANY_FORM,
        humanCheck: { ...humanProof(), honeypot: 'https://buy-things.example' },
        submissionData
      }
    });

    expect(response.status()).toBe(400);
  });

  test('refuses a submission sent the instant the form was drawn', async ({
    request
  }) => {
    const response = await request.post('/api/form-submissions', {
      data: {
        form: ANY_FORM,
        humanCheck: { ...humanProof(), elapsedMs: 0 },
        submissionData
      }
    });

    expect(response.status()).toBe(400);
  });

  test('says nothing about which gate closed', async ({ request }) => {
    const response = await request.post('/api/form-submissions', {
      data: {
        form: ANY_FORM,
        humanCheck: { ...humanProof(), honeypot: 'filled' },
        submissionData
      }
    });

    const body = await response.text();

    // A script told which check it tripped is a script told how to pass
    expect(body).not.toContain('honeypot');
    expect(body).not.toContain('too-fast');
  });

  test('refuses a tour signup on the same terms', async ({ request }) => {
    const response = await request.post('/api/tour-signups', {
      data: {
        tour: 1,
        name: 'A Person',
        email: 'someone@example.com',
        people: 1
      }
    });

    expect(response.status()).toBe(400);
    // Both endpoints answer in the same words, which is the point: the reason
    // lives in the log and nowhere a caller can read it
    expect((await response.json()).error).toBe(
      'Could not accept this submission'
    );
  });
});
