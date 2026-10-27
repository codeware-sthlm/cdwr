import {
  SITE_GATE_COOKIE,
  createSiteGateToken
} from '@codeware/shared/util/site-gate';

import { type SecurityEnv, secureRequest } from './security';

const env: SecurityEnv = {
  PAYLOAD_URL: 'https://cms.example.com/',
  SENTRY_DSN: 'https://key@o1.ingest.sentry.io/42',
  DEPLOY_ENV: 'production',
  CSP_ENFORCE: false,
  SITE_GATE_PASSWORD: undefined,
  DEBUG: false
};

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/', {
    headers: { accept: 'text/html', ...headers }
  });

const render = () =>
  Promise.resolve(new Response('<html></html>', { status: 200 }));

describe('secureRequest', () => {
  it('sends the full policy report-only, carrying the nonce', async () => {
    const response = await secureRequest(request(), env, 'N0NCE', render);

    expect(
      response.headers.get('content-security-policy-report-only')
    ).toContain("'nonce-N0NCE'");
    // The enforced header is only the baseline, without script rules
    expect(response.headers.get('content-security-policy')).not.toContain(
      'script-src'
    );
  });

  it('enforces the full policy when asked to', async () => {
    const response = await secureRequest(
      request(),
      { ...env, CSP_ENFORCE: true },
      'N0NCE',
      render
    );

    expect(response.headers.get('content-security-policy')).toContain(
      "'nonce-N0NCE'"
    );
    expect(
      response.headers.get('content-security-policy-report-only')
    ).toBeNull();
  });

  it('allows the cms origin and reports to Sentry', async () => {
    const response = await secureRequest(request(), env, 'N0NCE', render);
    const policy = response.headers.get('content-security-policy-report-only');

    expect(policy).toContain('img-src');
    expect(policy).toContain('https://cms.example.com');
    expect(policy).toContain('report-uri https://o1.ingest.sentry.io/api/42/');
    expect(response.headers.get('reporting-endpoints')).toContain(
      'csp-endpoint'
    );
  });

  it('puts the policy on the gate too, without rendering the page', async () => {
    const page = vi.fn(render);
    const response = await secureRequest(
      request(),
      { ...env, SITE_GATE_PASSWORD: 'hunter2' },
      'N0NCE',
      page
    );

    expect(response.status).toBe(302);
    expect(page).not.toHaveBeenCalled();
    expect(
      response.headers.get('content-security-policy-report-only')
    ).toContain("'nonce-N0NCE'");
  });

  it('renders for a visitor with the cookie', async () => {
    const page = vi.fn(render);
    const cookie = `${SITE_GATE_COOKIE}=${createSiteGateToken('hunter2')}`;
    const response = await secureRequest(
      request({ cookie }),
      { ...env, SITE_GATE_PASSWORD: 'hunter2' },
      'N0NCE',
      page
    );

    expect(response.status).toBe(200);
    expect(page).toHaveBeenCalledOnce();
  });

  it('logs headers only in debug mode', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await secureRequest(request(), env, 'N0NCE', render);
    expect(log).not.toHaveBeenCalled();

    await secureRequest(request(), { ...env, DEBUG: true }, 'N0NCE', render);
    expect(log).toHaveBeenCalledTimes(3);

    log.mockRestore();
  });

  it('masks credentials in the debug log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await secureRequest(
      request({
        cookie: 'secret-cookie',
        authorization: 'Bearer secret-token'
      }),
      { ...env, DEBUG: true },
      'N0NCE',
      () =>
        Promise.resolve(
          new Response('', { headers: { 'set-cookie': 'secret-session=1' } })
        )
    );

    const logged = log.mock.calls.flat().join('\n');
    expect(logged).not.toContain('secret');
    expect(logged).toContain('[redacted]');

    log.mockRestore();
  });
});
