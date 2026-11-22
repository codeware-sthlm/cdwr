/** @jest-environment node */
import type { PayloadRequest } from 'payload';

import { authorizeTotpAdminAction } from './authorize-totp-admin-action';

jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

const SYSTEM = {
  id: 1,
  email: 'system@local.dev',
  role: 'system-user',
  tenants: []
};
const ADMIN_OF_7 = {
  id: 2,
  email: 'titan@local.dev',
  role: 'user',
  tenants: [{ tenant: 7, role: 'admin' }]
};
const EDITOR_OF_7 = { ...ADMIN_OF_7, tenants: [{ tenant: 7, role: 'user' }] };
const MEMBER_OF_7 = {
  id: 10,
  email: 'member@local.dev',
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }]
};

const run = async (
  {
    user = SYSTEM as unknown,
    target = MEMBER_OF_7 as unknown,
    id = '10'
  }: { user?: unknown; target?: unknown; id?: string } = {},
  options?: { allowSelf?: boolean }
) => {
  const findByID = jest.fn().mockResolvedValue(target);
  const req = {
    user,
    routeParams: { id },
    payload: { findByID }
  } as unknown as PayloadRequest;
  return { result: await authorizeTotpAdminAction(req, options), findByID };
};

const status = (result: unknown) =>
  result instanceof Response ? result.status : undefined;

describe('authorizeTotpAdminAction', () => {
  it('returns the target a system user may act on', async () => {
    const { result, findByID } = await run();

    expect(result).toEqual({
      requester: SYSTEM,
      id: 10,
      target: MEMBER_OF_7
    });
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 10,
        overrideAccess: true,
        disableErrors: true
      })
    );
  });

  it('returns a member of the workspace for its admin', async () => {
    expect(status((await run({ user: ADMIN_OF_7 })).result)).toBeUndefined();
  });

  it('answers 403 for a user outside the admin’s workspaces', async () => {
    const { result } = await run({
      user: ADMIN_OF_7,
      target: { ...MEMBER_OF_7, tenants: [{ tenant: 9, role: 'user' }] }
    });
    expect(status(result)).toBe(403);
  });

  it('answers 403 for oneself without allowSelf', async () => {
    expect(status((await run({ target: SYSTEM, id: '1' })).result)).toBe(403);
  });

  it.each([
    { name: 'no user', user: null },
    { name: 'an editor', user: EDITOR_OF_7 },
    { name: 'a tenant api key', user: { id: 7, collection: 'tenants' } }
  ])('answers 403 to $name without a lookup', async ({ user }) => {
    const { result, findByID } = await run({ user });
    expect(status(result)).toBe(403);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('answers 403 before 404 to an editor with a bad id', async () => {
    expect(status((await run({ user: EDITOR_OF_7, id: 'abc' })).result)).toBe(
      403
    );
  });

  it('answers 404 for a missing user and for a bad id', async () => {
    expect(status((await run({ target: null })).result)).toBe(404);
    const { result, findByID } = await run({ id: 'abc' });
    expect(status(result)).toBe(404);
    expect(findByID).not.toHaveBeenCalled();
  });

  describe('with allowSelf', () => {
    it('passes the requester’s own account without a lookup', async () => {
      const { result, findByID } = await run(
        { user: EDITOR_OF_7, id: '2' },
        { allowSelf: true }
      );
      expect(result).toEqual({ requester: EDITOR_OF_7, id: 2, target: null });
      expect(findByID).not.toHaveBeenCalled();
    });

    it('answers 403 to an editor for another user, without a lookup', async () => {
      const { result, findByID } = await run(
        { user: EDITOR_OF_7 },
        { allowSelf: true }
      );
      expect(status(result)).toBe(403);
      expect(findByID).not.toHaveBeenCalled();
    });

    it('answers 404 for a bad id', async () => {
      const { result } = await run({ id: 'abc' }, { allowSelf: true });
      expect(status(result)).toBe(404);
    });
  });
});
