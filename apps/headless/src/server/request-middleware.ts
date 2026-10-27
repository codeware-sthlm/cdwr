import { createMiddleware } from '@tanstack/react-start';

import { getEnv } from '../env.server';

import { createCspNonce } from './csp';
import { secureRequest } from './security';

/**
 * Global request middleware: the site gate, the Content Security Policy and
 * the debug log, in front of every route and server function.
 *
 * The nonce goes to the router through the request context, where
 * `getRouter` picks it up for every script the page renders.
 */
export const securityMiddleware = createMiddleware().server(
  ({ request, next }) => {
    const nonce = createCspNonce();

    return secureRequest(request, getEnv(), nonce, async () => {
      const result = await next({ context: { nonce } });
      return result.response;
    });
  }
);
