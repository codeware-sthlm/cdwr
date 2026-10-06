import { TURNSTILE_ORIGIN } from '@codeware/shared/util/csp';

import { cspForRequest } from './csp';

const nonceOf = (policy: string | undefined) =>
  policy?.match(/'nonce-([^']+)'/)?.[1];

describe('cspForRequest', () => {
  it('reports the full policy and enforces only the baseline by default', () => {
    const { responseHeaders } = cspForRequest('/', {});

    expect(responseHeaders['Content-Security-Policy']).not.toContain(
      'script-src'
    );
    expect(responseHeaders['Content-Security-Policy']).toContain(
      "object-src 'none'"
    );
    expect(responseHeaders['Content-Security-Policy-Report-Only']).toContain(
      "'strict-dynamic'"
    );
  });

  it.each([
    ['true', true],
    // Refused by the env schema too, so it never enforces by accident
    ['TRUE', false],
    ['false', false],
    ['', false],
    ['nonsense', false]
  ])('CSP_ENFORCE=%j enforces the full policy: %s', (value, enforced) => {
    const { responseHeaders } = cspForRequest('/', { CSP_ENFORCE: value });

    expect(
      responseHeaders['Content-Security-Policy'].includes('script-src')
    ).toBe(enforced);
    expect('Content-Security-Policy-Report-Only' in responseHeaders).toBe(
      !enforced
    );
  });

  it('hands Next the full policy with the same nonce the browser gets', () => {
    const { requestPolicy, responseHeaders } = cspForRequest('/', {});

    const nonce = nonceOf(requestPolicy);
    expect(nonce).toBeDefined();
    expect(
      nonceOf(responseHeaders['Content-Security-Policy-Report-Only'])
    ).toBe(nonce);
  });

  it('mints a new nonce per request', () => {
    expect(nonceOf(cspForRequest('/', {}).requestPolicy)).not.toBe(
      nonceOf(cspForRequest('/', {}).requestPolicy)
    );
  });

  it.each([
    ['/admin', false],
    ['/admin/collections/pages', false],
    ['/', true],
    ['/administration', true]
  ])('%s allows Turnstile: %s', (pathname, allowed) => {
    expect(
      cspForRequest(pathname, {}).requestPolicy.includes(TURNSTILE_ORIGIN)
    ).toBe(allowed);
  });

  it('allows the font origin', () => {
    const { requestPolicy } = cspForRequest('/', {
      FONT_ASSETS_BASE_URL: 'https://fonts.example.com/assets/'
    });

    expect(requestPolicy).toMatch(
      /font-src [^;]*https:\/\/fonts\.example\.com/
    );
  });

  it.each([
    ['/admin', true],
    ['/', false]
  ])('%s allows Monaco and gravatar: %s', (pathname, allowed) => {
    const { requestPolicy } = cspForRequest(pathname, {});

    expect(requestPolicy.includes('https://cdn.jsdelivr.net')).toBe(allowed);
    expect(requestPolicy.includes('https://www.gravatar.com')).toBe(allowed);
  });

  it.each([
    ['development', true],
    ['production', false]
  ])('NODE_ENV=%s allows eval: %s', (NODE_ENV, allowed) => {
    expect(
      cspForRequest('/', { NODE_ENV }).requestPolicy.includes("'unsafe-eval'")
    ).toBe(allowed);
  });

  it('reports to Sentry when there is a DSN', () => {
    const { responseHeaders } = cspForRequest('/', {
      SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/42',
      DEPLOY_ENV: 'preview'
    });

    expect(responseHeaders['Reporting-Endpoints']).toBe(
      'csp-endpoint="https://o1.ingest.sentry.io/api/42/security/?sentry_key=abc&sentry_environment=preview"'
    );
  });

  it('sends no reporting without a DSN', () => {
    expect(
      'Reporting-Endpoints' in cspForRequest('/', {}).responseHeaders
    ).toBe(false);
  });
});
