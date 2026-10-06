/**
 * Content Security Policy headers for the cms site and admin.
 *
 * The baseline (framing, plugins, base uri, form targets) is always enforced.
 * The full nonce-based policy is sent report-only until `enforce` is on.
 *
 * Web APIs only, so it runs in Next's proxy as well as in Remix/Hono.
 */

export type CspSurface = 'site' | 'admin';

/** Extra sources per fetch directive, beyond what the builder always allows */
export type CspSourceKind =
  'script' | 'style' | 'img' | 'font' | 'connect' | 'frame';

export type CspOptions = {
  /** Per-request nonce from `createCspNonce()` */
  nonce: string;
  surface: CspSurface;
  /** `true` sends the full policy enforced; `false` only the baseline, with the full policy report-only */
  enforce: boolean;
  /** Origins (or other CSP source expressions) added per directive */
  sources?: Partial<Record<CspSourceKind, ReadonlyArray<string>>>;
  /** Who may frame this page, besides `'self'` */
  frameAncestors?: ReadonlyArray<string>;
  /** Report endpoint url, e.g. from `sentryCspReportUri()`; omitted means no reporting */
  reportUri?: string;
  /** Allows `eval`, which React and the dev tooling need in development only */
  development?: boolean;
};

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** Response headers; the enforced policy is always present */
export type CspHeaders = {
  'Content-Security-Policy': string;
  'Content-Security-Policy-Report-Only'?: string;
  'Reporting-Endpoints'?: string;
};

const REPORT_GROUP = 'csp-endpoint';

/** Directives in serialised order */
const DIRECTIVES = [
  'frame-ancestors',
  'object-src',
  'base-uri',
  'form-action',
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'worker-src',
  'manifest-src',
  'report-uri',
  'report-to'
] as const;

type CspDirective = (typeof DIRECTIVES)[number];

type Policy = Record<CspDirective, ReadonlyArray<string>>;

const EMPTY_POLICY: Policy = {
  'frame-ancestors': [],
  'object-src': [],
  'base-uri': [],
  'form-action': [],
  'default-src': [],
  'script-src': [],
  'style-src': [],
  'img-src': [],
  'font-src': [],
  'connect-src': [],
  'frame-src': [],
  'worker-src': [],
  'manifest-src': [],
  'report-uri': [],
  'report-to': []
};

/** `name src1 src2; name ...`, empty directives left out, sources de-duplicated */
const serialize = (policy: Policy): string =>
  DIRECTIVES.flatMap((name) => {
    const sources = [...new Set(policy[name])];
    return sources.length ? [`${name} ${sources.join(' ')}`] : [];
  }).join('; ');

/** 16 random bytes, base64 encoded */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function cspHeaders(options: CspOptions): CspHeaders {
  const {
    nonce,
    surface,
    enforce,
    sources,
    frameAncestors,
    reportUri,
    development
  } = options;
  const site = surface === 'site';

  const reporting: Partial<Policy> = reportUri
    ? { 'report-uri': [reportUri], 'report-to': [REPORT_GROUP] }
    : {};

  const baseline: Policy = {
    ...EMPTY_POLICY,
    'frame-ancestors': ["'self'", ...(frameAncestors ?? [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    ...reporting
  };

  const full: Policy = {
    ...baseline,
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(development ? ["'unsafe-eval'"] : []),
      ...(sources?.script ?? []),
      ...(site ? [TURNSTILE_ORIGIN] : [])
    ],
    'style-src': ["'self'", "'unsafe-inline'", ...(sources?.style ?? [])],
    'img-src': ["'self'", 'data:', 'blob:', ...(sources?.img ?? [])],
    'font-src': ["'self'", 'data:', ...(sources?.font ?? [])],
    'connect-src': ["'self'", ...(sources?.connect ?? [])],
    'frame-src': [
      "'self'",
      ...(sources?.frame ?? []),
      ...(site ? [TURNSTILE_ORIGIN] : [])
    ],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"]
  };

  return {
    ...(enforce
      ? { 'Content-Security-Policy': serialize(full) }
      : {
          'Content-Security-Policy': serialize(baseline),
          'Content-Security-Policy-Report-Only': serialize(full)
        }),
    ...(reportUri
      ? { 'Reporting-Endpoints': `${REPORT_GROUP}="${reportUri}"` }
      : {})
  };
}

/**
 * Sentry security report endpoint for a DSN.
 *
 * Keeps a path prefix before the project id (self-hosted Sentry).
 */
export function sentryCspReportUri(
  dsn: string | undefined,
  environment?: string
): string | undefined {
  if (!dsn) return undefined;

  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return undefined;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  if (!url.username || !projectId) return undefined;

  const query = new URLSearchParams({ sentry_key: url.username });
  if (environment) query.set('sentry_environment', environment);

  const prefix = segments.map((segment) => `/${segment}`).join('');
  return `${url.protocol}//${url.host}${prefix}/api/${projectId}/security/?${query.toString()}`;
}

/** Origin of a url, `undefined` when empty or invalid */
export function toOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}
