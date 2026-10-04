/** @jest-environment node */
import type { PayloadRequest } from 'payload';

import { componentDeveloperAccess } from '../../security/component-developer-access';

import { customComponentRebuildEndpoint } from './rebuild.endpoint';

jest.mock('../../security/component-developer-access', () => ({
  componentDeveloperAccess: jest.fn()
}));

const access = jest.mocked(componentDeveloperAccess);

const USER = { id: 1, collection: 'users', role: 'user', tenants: [] };

const setup = ({
  allowed = true,
  permitted = 1,
  exists = 1
}: {
  allowed?: boolean | { tenant: { in: number[] } };
  permitted?: number;
  exists?: number;
} = {}) => {
  access.mockReturnValue(jest.fn().mockResolvedValue(allowed));
  const find = jest.fn().mockResolvedValue({ totalDocs: permitted, docs: [] });
  const count = jest.fn().mockResolvedValue({ totalDocs: exists });
  const update = jest.fn().mockResolvedValue({});
  const error = jest.fn();
  const req = {
    user: USER,
    routeParams: { id: '7' },
    payload: { find, count, update, logger: { error } }
  };
  const call = (routeParams: Record<string, string> = { id: '7' }) =>
    customComponentRebuildEndpoint.handler({
      ...req,
      routeParams
    } as unknown as PayloadRequest);
  return { call, req, find, update, error };
};

describe('customComponentRebuildEndpoint', () => {
  it('sets a permitted component pending, overriding the build group’s gate', async () => {
    const { call, req, update } = setup({ allowed: { tenant: { in: [3] } } });

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'pending' });
    expect(update).toHaveBeenCalledWith({
      collection: 'custom-components',
      id: 7,
      data: { build: { status: 'pending' } },
      user: USER,
      overrideAccess: true,
      req: expect.objectContaining({ user: req.user })
    });
  });

  it('looks the component up within what the account may update', async () => {
    const { call, find } = setup({ allowed: { tenant: { in: [3] } } });

    await call();

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ id: { equals: 7 } }, { tenant: { in: [3] } }] },
        overrideAccess: true
      })
    );
  });

  it('answers 403 when the account may update nothing', async () => {
    const { call, update } = setup({ allowed: false });

    expect((await call()).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('answers 403 for a component outside the account’s workspaces', async () => {
    const { call, update } = setup({ permitted: 0, exists: 1 });

    expect((await call()).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('answers 404 for a component that is not there', async () => {
    const { call } = setup({ permitted: 0, exists: 0 });

    expect((await call()).status).toBe(404);
  });

  it('answers 404 for an id that is not a number', async () => {
    const { call, update } = setup();

    expect((await call({ id: 'abc' })).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('answers 500 and logs when the update throws', async () => {
    const { call, update, error } = setup();
    update.mockRejectedValue(new Error('db down'));

    expect((await call()).status).toBe(500);
    expect(error).toHaveBeenCalled();
  });
});
