import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Must match `tunnelRoute` in next.config.mjs.
const TUNNEL_ROUTE = '/monitoring';

// Next 16.3 adds ten `close` listeners to a response it proxies to an external
// rewrite such as the Sentry tunnel, and Sentry adds two more, so every envelope
// logs MaxListenersExceededWarning. They are bounded and released with the
// response, so only the tunnel's responses get a higher limit.
// Upstream: https://github.com/vercel/next.js/issues/97757
export const TUNNEL_MAX_LISTENERS = 15;

const CHANNEL = 'http.server.request.start';

type RequestStart = { request: IncomingMessage; response: ServerResponse };

const onRequestStart = (message: unknown) => {
  const { request, response } = message as RequestStart;
  const path = request.url?.split('?')[0].replace(/\/$/, '');
  if (path === TUNNEL_ROUTE) {
    response.setMaxListeners(TUNNEL_MAX_LISTENERS);
  }
};

/** Raises the listener limit on Sentry tunnel responses; returns the undo. */
export const raiseTunnelMaxListeners = () => {
  subscribe(CHANNEL, onRequestStart);
  return () => unsubscribe(CHANNEL, onRequestStart);
};
