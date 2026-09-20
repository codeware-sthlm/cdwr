import type { BasePayload } from 'payload';

import type {
  AuthenticatedPayload,
  PayloadRuntime
} from './payload-runtime.types';

/**
 * Utility to map a `BasePayload` to a `PayloadRuntime`
 * with `tenantConfig` set to `null`.
 *
 * `authenticatedUser` defaults to `null` (collection functions then bypass
 * access control). Provide `user` to get an authenticated runtime — e.g. in
 * admin server components where Payload supplies `payload` + `user` via
 * `ServerProps` and access control must apply.
 *
 * This is useful to keep a unified signature for collection functions
 * that can accept either an authenticated tenant with configuration or just the default payload instance.
 */
export const mapToRuntime = (
  maybeRuntime: PayloadRuntime | BasePayload,
  user?: AuthenticatedPayload['authenticatedUser']
): PayloadRuntime => {
  if ('tenantConfig' in maybeRuntime) {
    return maybeRuntime;
  }

  // A prototype-linked view rather than a mutation: `payload` is a process-wide
  // singleton, so writing the identity onto it would let concurrent requests
  // read each other's `authenticatedUser` and apply access control for the
  // wrong user. The view shadows the property while delegating everything else.
  const payload: AuthenticatedPayload = Object.create(maybeRuntime);
  payload.authenticatedUser = user ?? null;
  // No tenant is being served on this path; callers that need one go through
  // `getPayloadRuntime`
  payload.tenant = null;
  payload.asVisitor = false;

  return { payload, tenantConfig: null };
};
