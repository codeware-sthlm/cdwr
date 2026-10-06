import { Hono } from 'hono';

import { cspMiddleware } from '../middlewares/csp';

vi.mock('../env-resolver/env', () => ({
  default: {
    PAYLOAD_URL: 'https://cms.example.com/api',
    SENTRY_DSN: 'https://key@o1.ingest.sentry.io/42',
    DEPLOY_ENV: 'production',
    CSP_ENFORCE: false
  }
}));

const request = async () => {
  let nonce = '';
  const app = new Hono().use('*', cspMiddleware).get('/', (c) => {
    nonce = c.get('cspNonce');
    return c.text('ok');
  });

  return { response: await app.request('/'), nonce: () => nonce };
};

describe('cspMiddleware', () => {
  it('sends the baseline enforced and the full policy report-only', async () => {
    const { response } = await request();

    expect(response.headers.get('Content-Security-Policy')).toContain(
      "object-src 'none'"
    );
    expect(response.headers.get('Content-Security-Policy')).not.toContain(
      'script-src'
    );
    expect(
      response.headers.get('Content-Security-Policy-Report-Only')
    ).toContain('script-src');
    expect(response.headers.get('Reporting-Endpoints')).toContain(
      'o1.ingest.sentry.io'
    );
  });

  it('puts the nonce the handler sees in the script policy', async () => {
    const { response, nonce } = await request();
    const policy = response.headers.get('Content-Security-Policy-Report-Only');

    expect(nonce()).not.toBe('');
    expect(policy).toContain(`'nonce-${nonce()}'`);
  });

  it('allows the cms origin for scripts and the Sentry origin to connect', async () => {
    const { response } = await request();
    const policy =
      response.headers.get('Content-Security-Policy-Report-Only') ?? '';

    const directive = (name: string) =>
      policy.split('; ').find((part) => part.startsWith(`${name} `)) ?? '';

    expect(directive('script-src')).toContain('https://cms.example.com');
    expect(directive('connect-src')).toContain('https://o1.ingest.sentry.io');
  });
});
