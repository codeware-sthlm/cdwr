import {
  type CspOptions,
  type CspSurface,
  TURNSTILE_ORIGIN,
  createCspNonce,
  cspHeaders,
  sentryCspReportUri,
  toOrigin
} from './csp';

const CSP = 'Content-Security-Policy';
const REPORT_ONLY = 'Content-Security-Policy-Report-Only';
const BASELINE =
  "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

const base = (over: Partial<CspOptions> = {}): CspOptions => ({
  nonce: 'abc123',
  surface: 'site',
  enforce: false,
  ...over
});

/** Value of one directive in a policy string */
const directive = (policy: string | undefined, name: string) =>
  policy
    ?.split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('cspHeaders', () => {
  it('enforces only the baseline and reports the full policy', () => {
    const headers = cspHeaders(base({ enforce: false }));

    expect(headers[CSP]).toBe(BASELINE);
    expect(headers[REPORT_ONLY]).toMatch(/^frame-ancestors 'self'; /);
    expect(headers[REPORT_ONLY]).toContain("default-src 'self'");
    expect(headers['Reporting-Endpoints']).toBeUndefined();
  });

  it('enforces the full policy without a report-only header', () => {
    const headers = cspHeaders(base({ enforce: true }));

    expect(headers[CSP]).toContain(BASELINE);
    expect(headers[CSP]).toContain("manifest-src 'self'");
    expect(headers[REPORT_ONLY]).toBeUndefined();
  });

  it('puts the nonce in script-src', () => {
    const headers = cspHeaders(base({ nonce: 'n0nc3', enforce: true }));

    expect(directive(headers[CSP], 'script-src')).toBe(
      "'self' 'nonce-n0nc3' 'strict-dynamic' " + TURNSTILE_ORIGIN
    );
  });

  it.each<[CspSurface, boolean]>([
    ['site', true],
    ['admin', false]
  ])('surface %s has turnstile: %s', (surface, expected) => {
    const csp = cspHeaders(base({ surface, enforce: true }))[CSP];

    expect(directive(csp, 'script-src')?.includes(TURNSTILE_ORIGIN)).toBe(
      expected
    );
    expect(directive(csp, 'frame-src')?.includes(TURNSTILE_ORIGIN)).toBe(
      expected
    );
    expect(directive(csp, 'connect-src')).not.toContain(TURNSTILE_ORIGIN);
  });

  it.each<[CspSurface, boolean]>([
    ['site', true],
    ['admin', true],
    ['site', false],
    ['admin', false]
  ])(
    'never allows unsafe-inline or unsafe-eval in script-src (%s, enforce %s)',
    (surface, enforce) => {
      const headers = cspHeaders(
        base({
          surface,
          enforce,
          sources: { script: ['https://scripts.example.com'] }
        })
      );
      const script = directive(
        headers[REPORT_ONLY] ?? headers[CSP],
        'script-src'
      );

      expect(script).toBeDefined();
      expect(script).not.toContain('unsafe-inline');
      expect(script).not.toContain('unsafe-eval');
    }
  );

  it('allows eval in script-src only in development', () => {
    const script = directive(
      cspHeaders(base({ enforce: true, development: true }))[CSP],
      'script-src'
    );

    expect(script).toContain("'unsafe-eval'");
    expect(script).not.toContain('unsafe-inline');
  });

  it('merges and de-duplicates sources per directive', () => {
    const csp = cspHeaders(
      base({
        enforce: true,
        sources: {
          script: ['https://s.example.com', 'https://s.example.com'],
          style: ['https://fonts.googleapis.com'],
          img: ['https://img.example.com', "'self'"],
          font: ['https://fonts.gstatic.com'],
          connect: ['https://api.example.com'],
          frame: ['https://www.youtube.com']
        }
      })
    )[CSP];

    expect(directive(csp, 'script-src')).toBe(
      `'self' 'nonce-abc123' 'strict-dynamic' https://s.example.com ${TURNSTILE_ORIGIN}`
    );
    expect(directive(csp, 'style-src')).toBe(
      "'self' 'unsafe-inline' https://fonts.googleapis.com"
    );
    expect(directive(csp, 'img-src')).toBe(
      "'self' data: blob: https://img.example.com"
    );
    expect(directive(csp, 'font-src')).toBe(
      "'self' data: https://fonts.gstatic.com"
    );
    expect(directive(csp, 'connect-src')).toBe(
      "'self' https://api.example.com"
    );
    expect(directive(csp, 'frame-src')).toBe(
      `'self' https://www.youtube.com ${TURNSTILE_ORIGIN}`
    );
  });

  it('adds frame ancestors after self', () => {
    const headers = cspHeaders(
      base({
        frameAncestors: ['https://a.example.com', 'https://b.example.com']
      })
    );

    expect(directive(headers[CSP], 'frame-ancestors')).toBe(
      "'self' https://a.example.com https://b.example.com"
    );
  });

  it.each([true, false])(
    'reports from the full policy only, and only with reportUri (enforce %s)',
    (enforce) => {
      const uri = 'https://o1.example.com/api/1/security/?sentry_key=k';
      const withReport = cspHeaders(base({ enforce, reportUri: uri }));
      const without = cspHeaders(base({ enforce }));

      const full = enforce ? withReport[CSP] : withReport[REPORT_ONLY];
      expect(full).toContain(`report-uri ${uri}`);
      expect(full).toContain('report-to csp-endpoint');
      if (!enforce) {
        expect(withReport[CSP]).not.toContain('report-');
      }
      expect(withReport['Reporting-Endpoints']).toBe(`csp-endpoint="${uri}"`);

      expect(Object.keys(without).join()).not.toContain('Reporting');
      expect(Object.values(without).join()).not.toContain('report-');
    }
  );
});

describe('createCspNonce', () => {
  it('is 24 chars of base64 and differs between calls', () => {
    const a = createCspNonce();
    const b = createCspNonce();

    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).toHaveLength(24);
    expect(a).not.toBe(b);
  });
});

describe('sentryCspReportUri', () => {
  it.each<[string, string | undefined, string | undefined, string | undefined]>(
    [
      [
        'plain dsn',
        'https://key@o1.ingest.sentry.io/42',
        undefined,
        'https://o1.ingest.sentry.io/api/42/security/?sentry_key=key'
      ],
      [
        'environment is encoded',
        'https://key@o1.ingest.sentry.io/42',
        'pr preview/1',
        'https://o1.ingest.sentry.io/api/42/security/?sentry_key=key&sentry_environment=pr+preview%2F1'
      ],
      [
        'self-hosted path prefix',
        'https://key@sentry.example.com/path/123',
        undefined,
        'https://sentry.example.com/path/api/123/security/?sentry_key=key'
      ],
      ['undefined', undefined, undefined, undefined],
      ['empty', '', undefined, undefined],
      ['not a url', 'not a dsn', undefined, undefined],
      ['missing key', 'https://o1.ingest.sentry.io/42', undefined, undefined],
      [
        'missing project id',
        'https://key@o1.ingest.sentry.io',
        undefined,
        undefined
      ]
    ]
  )('%s', (_name, dsn, environment, expected) => {
    expect(sentryCspReportUri(dsn, environment)).toBe(expected);
  });
});

describe('toOrigin', () => {
  it.each<[string | undefined, string | undefined]>([
    ['https://example.com/a/b?c=1', 'https://example.com'],
    ['http://localhost:3000/x', 'http://localhost:3000'],
    ['', undefined],
    [undefined, undefined],
    ['not a url', undefined],
    ['data:text/plain,hi', undefined]
  ])('%s -> %s', (url, expected) => {
    expect(toOrigin(url)).toBe(expected);
  });
});
