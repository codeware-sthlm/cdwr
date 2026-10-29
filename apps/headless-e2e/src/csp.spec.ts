import { expect, test } from './fixtures';

/** The header carrying the full policy: report-only until `CSP_ENFORCE` is on */
const fullPolicy = (headers: Record<string, string>) =>
  [
    headers['content-security-policy-report-only'],
    headers['content-security-policy']
  ].find((policy) => policy?.includes("'nonce-"));

/**
 * The Content Security Policy rests on a per-request nonce: a script without
 * it is blocked once the policy is enforced. Read from the server's own html,
 * since the browser would hide what it refuses to run.
 */
test.describe('content security policy', () => {
  test('every script carries the nonce the header allows', async ({
    request
  }) => {
    const response = await request.get('/', {
      headers: { accept: 'text/html' }
    });
    expect(response.status()).toBe(200);

    const policy = fullPolicy(response.headers());
    expect(policy).toBeTruthy();
    expect(policy).toContain("'strict-dynamic'");

    const nonce = /'nonce-([^']+)'/.exec(policy ?? '')?.[1];
    expect(nonce).toBeTruthy();

    const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      expect(script).toContain(`nonce="${nonce}"`);
    }
  });

  test('the nonce is new for every response', async ({ request }) => {
    const nonceOf = async () => {
      const response = await request.get('/api/health');
      return /'nonce-([^']+)'/.exec(fullPolicy(response.headers()) ?? '')?.[1];
    };

    const [first, second] = [await nonceOf(), await nonceOf()];

    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });
});
