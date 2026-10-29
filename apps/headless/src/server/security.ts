import type { Env } from '../env.schema';

import { cspResponseHeaders } from './csp';
import { logRequestHeaders, logResponseHeaders } from './debug-headers';
import { siteGate } from './site-gate';

export type SecurityEnv = Pick<
  Env,
  | 'PAYLOAD_URL'
  | 'SENTRY_DSN'
  | 'DEPLOY_ENV'
  | 'CSP_ENFORCE'
  | 'FONT_ASSETS_BASE_URL'
  | 'UMAMI_URL'
  | 'SITE_GATE_PASSWORD'
  | 'DEBUG'
>;

/**
 * What every request goes through: the debug log, the site gate and the
 * security headers.
 *
 * @param render - Produces the page; receives the nonce its scripts must carry
 */
export async function secureRequest(
  request: Request,
  env: SecurityEnv,
  nonce: string,
  render: () => Promise<Response>
): Promise<Response> {
  if (env.DEBUG) {
    logRequestHeaders(request);
  }

  const response =
    (await siteGate(request, env.SITE_GATE_PASSWORD)) ?? (await render());

  for (const [name, value] of Object.entries(cspResponseHeaders(env, nonce))) {
    response.headers.set(name, value);
  }

  if (env.DEBUG) {
    logResponseHeaders(response);
  }

  return response;
}
