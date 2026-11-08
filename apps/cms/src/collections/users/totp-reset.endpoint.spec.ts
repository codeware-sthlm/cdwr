/** @jest-environment node */
import { resetTotp } from '@codeware/app-cms/data-access';
import type { PayloadRequest } from 'payload';

import { userTotpResetEndpoint } from './totp-reset.endpoint';

jest.mock('@codeware/app-cms/data-access', () => ({
  resetTotp: jest.fn()
}));
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

const reset = jest.mocked(resetTotp);

const SYSTEM = {
  id: 1,
  email: 'system@local.dev',
  collection: 'users',
  role: 'system-user',
  tenants: []
};
const ADMIN_OF_7 = {
  id: 2,
  email: 'titan@local.dev',
  collection: 'users',
  role: 'user',
  tenants: [{ tenant: 7, role: 'admin' }]
};
const MEMBER_OF_7 = {
  id: 10,
  email: 'member@local.dev',
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }]
};

const setup = ({
  user = SYSTEM as unknown,
  target = MEMBER_OF_7 as unknown
}: { user?: unknown; target?: unknown } = {}) => {
  reset.mockReset().mockResolvedValue(undefined);
  const findByID = jest.fn().mockResolvedValue(target);
  const info = jest.fn();
  const error = jest.fn();
  const payload = { findByID, logger: { info, error } };
  const call = (id = '10') =>
    userTotpResetEndpoint.handler({
      user,
      routeParams: { id },
      payload
    } as unknown as PayloadRequest);
  return { call, payload, findByID, info, error };
};

describe('userTotpResetEndpoint', () => {
  it('resets a user a system user may reset, and logs who reset whom', async () => {
    const { call, payload, findByID, info } = setup();

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reset: true });
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 10,
        overrideAccess: true
      })
    );
    expect(reset).toHaveBeenCalledWith(payload, { id: 10 });
    expect(info).toHaveBeenCalledWith(
      '[totpReset] user 10 member@local.dev reset by 1 system@local.dev'
    );
  });

  it('lets a workspace admin reset a member of their workspace', async () => {
    const { call } = setup({ user: ADMIN_OF_7 });

    expect((await call()).status).toBe(200);
    expect(reset).toHaveBeenCalled();
  });

  it('answers 403 for a user outside the admin’s workspaces', async () => {
    const { call } = setup({
      user: ADMIN_OF_7,
      target: { ...MEMBER_OF_7, tenants: [{ tenant: 9, role: 'user' }] }
    });

    expect((await call()).status).toBe(403);
    expect(reset).not.toHaveBeenCalled();
  });

  it('answers 403 for a reset of oneself', async () => {
    const { call } = setup({ target: SYSTEM });

    expect((await call('1')).status).toBe(403);
    expect(reset).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'no user', user: null },
    {
      name: 'an editor',
      user: { ...ADMIN_OF_7, tenants: [{ tenant: 7, role: 'user' }] }
    },
    { name: 'a tenant api key', user: { id: 7, collection: 'tenants' } }
  ])('answers 403 to $name without looking the user up', async ({ user }) => {
    const { call, findByID } = setup({ user });

    expect((await call()).status).toBe(403);
    expect(findByID).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('answers 404 for a user that is not there', async () => {
    const { call } = setup({ target: null });

    expect((await call()).status).toBe(404);
    expect(reset).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not a number', async () => {
    const { call, findByID } = setup();

    expect((await call('abc')).status).toBe(404);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('answers 500 and logs when the reset throws', async () => {
    const { call, info, error } = setup();
    reset.mockRejectedValue(new Error('db down'));

    expect((await call()).status).toBe(500);
    expect(error).toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
