/** @jest-environment node */
import { forgetTotpTrust } from '@codeware/app-cms/data-access';
import type { Config, Endpoint, PayloadRequest } from 'payload';

import { totpEnrolmentPlugin } from '../../security/totp/totp-enrolment.plugin';

import { userTotpTrustForgetEndpoint } from './totp-trust-forget.endpoint';

jest.mock('@codeware/app-cms/data-access', () => ({
  forgetTotpTrust: jest.fn()
}));
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));

const forget = jest.mocked(forgetTotpTrust);

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
  collection: 'users',
  role: 'user',
  tenants: [{ tenant: 7, role: 'user' }]
};

const setup = ({
  user = SYSTEM as unknown,
  target = MEMBER_OF_7 as unknown
}: { user?: unknown; target?: unknown } = {}) => {
  forget.mockReset().mockResolvedValue(1);
  const findByID = jest.fn().mockResolvedValue(target);
  const info = jest.fn();
  const error = jest.fn();
  const payload = { findByID, logger: { info, error } };
  const call = (id = '10', endpoint = userTotpTrustForgetEndpoint) =>
    endpoint.handler({
      user,
      routeParams: { id },
      payload,
      t: (key: string) => key
    } as unknown as PayloadRequest);
  return { call, payload, findByID, info, error };
};

describe('userTotpTrustForgetEndpoint', () => {
  it('lets anyone forget the devices of their own account, without a lookup', async () => {
    const { call, payload, findByID, info } = setup({ user: MEMBER_OF_7 });

    const response = await call('10');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ forgotten: true });
    expect(findByID).not.toHaveBeenCalled();
    expect(forget).toHaveBeenCalledWith(payload, { id: 10 });
    expect(info).toHaveBeenCalled();
  });

  it('lets a system user forget the devices of another user', async () => {
    const { call, payload } = setup();

    expect((await call()).status).toBe(200);
    expect(forget).toHaveBeenCalledWith(payload, { id: 10 });
  });

  it('lets a workspace admin forget the devices of a member of their workspace', async () => {
    const { call } = setup({ user: ADMIN_OF_7 });

    expect((await call()).status).toBe(200);
    expect(forget).toHaveBeenCalled();
  });

  it('answers 403 for a user outside the admin’s workspaces', async () => {
    const { call } = setup({
      user: ADMIN_OF_7,
      target: { ...MEMBER_OF_7, tenants: [{ tenant: 9, role: 'user' }] }
    });

    expect((await call()).status).toBe(403);
    expect(forget).not.toHaveBeenCalled();
  });

  it('answers 403 to an editor for another user without looking them up', async () => {
    const { call, findByID } = setup({
      user: { ...ADMIN_OF_7, tenants: [{ tenant: 7, role: 'user' }] }
    });

    expect((await call()).status).toBe(403);
    expect(findByID).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'no user', user: null },
    { name: 'a tenant api key', user: { id: 7, collection: 'tenants' } }
  ])('answers 403 to $name', async ({ user }) => {
    const { call, findByID } = setup({ user });

    expect((await call()).status).toBe(403);
    expect(findByID).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
  });

  it('answers 404 for a user that is not there', async () => {
    const { call } = setup({ target: null });

    expect((await call()).status).toBe(404);
    expect(forget).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not a number', async () => {
    const { call } = setup();

    expect((await call('abc')).status).toBe(404);
    expect(forget).not.toHaveBeenCalled();
  });

  it('answers 500 and logs when forgetting throws', async () => {
    const { call, info, error } = setup({ user: MEMBER_OF_7 });
    forget.mockRejectedValue(new Error('db down'));

    expect((await call()).status).toBe(500);
    expect(error).toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('is refused while the second factor is pending, through the plugin wrapping', async () => {
    const pending = { ...MEMBER_OF_7, hasTotp: true, _strategy: 'local-jwt' };
    const { call } = setup({ user: pending });
    const config = (await totpEnrolmentPlugin({ collection: 'users' })({
      collections: [
        { slug: 'users', endpoints: [userTotpTrustForgetEndpoint], fields: [] }
      ]
    } as unknown as Config)) as Config;
    const wrapped = (config.collections?.[0].endpoints as Array<Endpoint>)[0];

    expect(wrapped.path).toBe('/:id/totp-trust-forget');
    expect((await call('10', wrapped)).status).toBe(403);
    expect(forget).not.toHaveBeenCalled();
  });
});
