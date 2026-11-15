import { verifySiteGateToken } from '@codeware/shared/util/site-gate';

/**
 * Whether the site sits behind its password gate.
 *
 * Read from `process.env` on every call: the tenant's secrets are injected at
 * boot, after modules load.
 */
export const isSiteGated = (): boolean =>
  Boolean(process.env.SITE_GATE_PASSWORD);

/**
 * Whether a request with this gate cookie may see what the gate keeps private.
 *
 * True when the site has no gate, or the cookie was signed with its password
 * and hasn't expired: the same check the proxy makes for pages.
 *
 * @param token - Value of the gate cookie, as it arrived
 */
export const passesSiteGate = (token: string | null | undefined): boolean => {
  const password = process.env.SITE_GATE_PASSWORD;

  return !password || verifySiteGateToken(token, password);
};
