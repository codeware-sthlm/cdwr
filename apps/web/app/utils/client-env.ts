import env from '../../env-resolver/env';

/**
 * The only environment values the browser is allowed to see.
 *
 * Anything a loader returns is serialized into the HTML, and the resolved
 * server env holds the tenant's Payload API key and the request signing secret.
 * So the client gets this explicit projection and never the env object itself —
 * widening this type is the single place that decision gets made.
 */
export type ClientEnv = {
  PAYLOAD_URL: string;
  TENANT_ID: string;
  /** Public half of the Turnstile pair; the secret stays on the server */
  TURNSTILE_SITE_KEY?: string;
};

/**
 * Build the browser-safe projection of the server environment.
 *
 * @returns The environment values safe to serialize to the client.
 */
export const getClientEnv = (): ClientEnv => ({
  PAYLOAD_URL: env.PAYLOAD_URL,
  TENANT_ID: env.TENANT_ID,
  TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY
});
