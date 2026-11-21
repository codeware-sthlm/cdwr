/**
 * Where the browser posts its Sentry envelopes, forwarded to Sentry's ingest.
 *
 * Must match `tunnelRoute` in next.config.mjs, which Node loads without
 * TypeScript and so keeps its own literal.
 */
export const SENTRY_TUNNEL_ROUTE = '/monitoring';
