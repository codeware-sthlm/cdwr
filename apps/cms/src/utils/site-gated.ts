/**
 * Whether the site sits behind its password gate.
 *
 * Read from `process.env` on every call: the tenant's secrets are injected at
 * boot, after modules load.
 */
export const isSiteGated = (): boolean =>
  Boolean(process.env.SITE_GATE_PASSWORD);
