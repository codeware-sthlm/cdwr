import {
  type CspHeaders,
  type CspSurface,
  createCspNonce,
  cspHeaders,
  sentryCspReportUri,
  toOrigin
} from '@codeware/shared/util/csp';
import { coerceBoolean } from '@codeware/shared/util/zod';

type Env = Record<string, string | undefined>;

/** Request header the proxy hands the nonce to the page on */
export const NONCE_HEADER = 'x-nonce';

const MONACO_CDN = 'https://cdn.jsdelivr.net';
const GRAVATAR = 'https://www.gravatar.com';

export type CspForRequest = {
  /** For the inline scripts the page renders itself */
  nonce: string;
  /** Sent to the browser on every response */
  responseHeaders: CspHeaders;
  /** The full nonce policy, for the request Next renders */
  requestPolicy: string;
};

/**
 * Policy for one cms request: a fresh nonce, the admin or the site surface.
 *
 * Next reads the nonce from the request's `content-security-policy` header
 * and stamps its own scripts with it. That header always carries the full
 * policy, even while the browser only gets it report-only, or Next would find
 * the nonce-less baseline and stamp nothing.
 *
 * Read from the env passed in on every request: the env loader injects the
 * tenant's secrets after this module is first evaluated.
 */
export function cspForRequest(pathname: string, env: Env): CspForRequest {
  const nonce = createCspNonce();
  const surface: CspSurface =
    pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'site';

  // Browser Sentry is tunnelled through `/monitoring`, and media is served
  // through Payload, so the site needs no other origin than fonts
  const fonts = toOrigin(env.FONT_ASSETS_BASE_URL);
  const admin = surface === 'admin';

  const options = {
    nonce,
    surface,
    sources: {
      // Payload's code editor loads Monaco from jsdelivr
      script: admin ? [MONACO_CDN] : [],
      style: admin ? [MONACO_CDN] : [],
      font: [...(fonts ? [fonts] : []), ...(admin ? [MONACO_CDN] : [])],
      // Payload's default account avatar
      img: admin ? [GRAVATAR] : []
    },
    reportUri: sentryCspReportUri(env.SENTRY_DSN, env.DEPLOY_ENV),
    development: env.NODE_ENV === 'development'
  };

  return {
    nonce,
    responseHeaders: cspHeaders({
      ...options,
      // Parsed as the env schema does; a value it would refuse stays report-only
      enforce: coerceBoolean(false).safeParse(env.CSP_ENFORCE).data ?? false
    }),
    requestPolicy: cspHeaders({ ...options, enforce: true })[
      'Content-Security-Policy'
    ]
  };
}
