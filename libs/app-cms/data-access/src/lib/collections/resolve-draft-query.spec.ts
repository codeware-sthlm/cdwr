import type { Where } from 'payload';
import { describe, expect, it } from 'vitest';

import type {
  AuthenticatedPayload,
  PayloadRuntime
} from '../payload-runtime.types';

import { resolveDraftQuery } from './resolve-draft-query';

/**
 * Build a minimal `PayloadRuntime` for the fields `resolveDraftQuery` reads:
 * `payload.authenticatedUser` and `tenantConfig`.
 */
function makeRuntime(
  authenticatedUser: AuthenticatedPayload['authenticatedUser'],
  tenantId: number | null = null
): PayloadRuntime {
  return {
    payload: { authenticatedUser } as AuthenticatedPayload,
    tenantConfig: tenantId
      ? // Only the tenant id is read by resolveDraftQuery.
        ({ tenant: { id: tenantId } } as PayloadRuntime['tenantConfig'])
      : null
  };
}

/** A collection user (has `role` + `tenants`, so `isUser` returns true). */
const adminUser = {
  id: 1,
  role: 'system-user',
  tenants: []
} as unknown as AuthenticatedPayload['authenticatedUser'];

/** A tenant API-key identity (no `role`/`tenants`, so `isUser` returns false). */
const tenantIdentity = {
  id: 2,
  slug: 'moon'
} as unknown as AuthenticatedPayload['authenticatedUser'];

describe('resolveDraftQuery', () => {
  describe('overrideAccess', () => {
    it('overrides access for unauthenticated fetches', () => {
      const { overrideAccess } = resolveDraftQuery(makeRuntime(null), false);
      expect(overrideAccess).toBe(true);
    });

    it('overrides access in draft mode for a non-user (API-key) identity', () => {
      const { overrideAccess } = resolveDraftQuery(
        makeRuntime(tenantIdentity),
        true
      );
      expect(overrideAccess).toBe(true);
    });

    it('keeps access control in draft mode for an authenticated admin user', () => {
      const { overrideAccess } = resolveDraftQuery(
        makeRuntime(adminUser),
        true
      );
      expect(overrideAccess).toBe(false);
    });

    it('keeps access control for an authenticated admin user without draft', () => {
      const { overrideAccess } = resolveDraftQuery(
        makeRuntime(adminUser),
        false
      );
      expect(overrideAccess).toBe(false);
    });

    it('does not override access for a non-user identity outside draft mode', () => {
      const { overrideAccess } = resolveDraftQuery(
        makeRuntime(tenantIdentity),
        false
      );
      expect(overrideAccess).toBe(false);
    });
  });

  describe('where scoping', () => {
    it('leaves where untouched when not in draft mode', () => {
      const input: Where = { slug: { equals: 'home' } };
      const { where } = resolveDraftQuery(makeRuntime(adminUser), false, input);
      expect(where).toEqual(input);
    });

    it('returns undefined where when no filter and not draft', () => {
      const { where } = resolveDraftQuery(makeRuntime(adminUser), false);
      expect(where).toBeUndefined();
    });

    it('adds a tenant constraint in draft mode when a tenant config is present', () => {
      const input: Where = { slug: { equals: 'home' } };
      const { where } = resolveDraftQuery(
        makeRuntime(tenantIdentity, 42),
        true,
        input
      );
      expect(where).toEqual({
        and: [input, { tenant: { equals: 42 } }]
      });
    });

    it('scopes to tenant even without an incoming where in draft mode', () => {
      const { where } = resolveDraftQuery(
        makeRuntime(tenantIdentity, 42),
        true
      );
      // A lone constraint is no longer wrapped in a one-element `and`
      expect(where).toEqual({ tenant: { equals: 42 } });
    });

    it('does not add a tenant constraint in draft mode without a tenant config', () => {
      const input: Where = { slug: { equals: 'home' } };
      const { where } = resolveDraftQuery(makeRuntime(adminUser), true, input);
      expect(where).toEqual(input);
    });
  });
});
