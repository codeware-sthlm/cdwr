/** @jest-environment node */
import { getUmamiAdminApi } from '@codeware/app-cms/feature/site-stats';
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook
} from 'payload';

import {
  deleteStatsAccountHook,
  rememberStatsAccountHook,
  removeStatsTeamMembershipHook
} from './stats-account-lifecycle.hook';

// The ESM-only helper is pulled in through the misc barrel
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/site-stats', () => ({
  getUmamiAdminApi: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: () => ({ UMAMI_URL: 'https://umami.example' })
}));

const admin = { removeTeamUser: jest.fn(), deleteUser: jest.fn() };
const findByID = jest.fn();
const info = jest.fn();
const error = jest.fn();

const makeReq = (context: Record<string, unknown> = {}) => ({
  context,
  payload: { findByID, logger: { info, error } }
});

/** The tenant read, then the user's own record */
const given = (umamiUserId: string | null) =>
  findByID.mockImplementation(async ({ collection }) =>
    collection === 'tenants'
      ? { statsTeamId: 'team-1' }
      : { statsAccount: { umamiUserId } }
  );

const row = (tenant: number, role: string) => ({ tenant, role });

const change = (
  previous: Array<ReturnType<typeof row>>,
  current: Array<ReturnType<typeof row>>,
  operation = 'update'
) =>
  removeStatsTeamMembershipHook({
    doc: { id: 2, tenants: current },
    previousDoc: { id: 2, tenants: previous },
    operation,
    req: makeReq()
  } as unknown as Parameters<CollectionAfterChangeHook>[0]);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getUmamiAdminApi).mockResolvedValue({
    status: 'ready',
    umami: admin as never
  });
  admin.removeTeamUser.mockResolvedValue(undefined);
  admin.deleteUser.mockResolvedValue(undefined);
  given('u-1');
});

describe('removeStatsTeamMembershipHook', () => {
  it('removes the user from the team when the admin role is downgraded', async () => {
    await change([row(5, 'admin')], [row(5, 'reader')]);

    expect(admin.removeTeamUser).toHaveBeenCalledWith('team-1', 'u-1');
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('removes the user when the membership is removed', async () => {
    await change([row(5, 'admin'), row(6, 'admin')], [row(6, 'admin')]);

    expect(admin.removeTeamUser).toHaveBeenCalledTimes(1);
    expect(admin.removeTeamUser).toHaveBeenCalledWith('team-1', 'u-1');
  });

  it('does nothing when the admin roles are unchanged', async () => {
    await change([row(5, 'admin')], [row(5, 'admin'), row(6, 'reader')]);

    expect(admin.removeTeamUser).not.toHaveBeenCalled();
  });

  it('does nothing for a user without an account', async () => {
    given(null);

    await change([row(5, 'admin')], []);

    expect(admin.removeTeamUser).not.toHaveBeenCalled();
  });

  it('does nothing on create', async () => {
    await change([], [row(5, 'admin')], 'create');

    expect(admin.removeTeamUser).not.toHaveBeenCalled();
  });

  it('skips quietly when Umami cannot be managed', async () => {
    jest.mocked(getUmamiAdminApi).mockResolvedValue({ status: 'unconfigured' });

    await change([row(5, 'admin')], []);

    expect(admin.removeTeamUser).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs and does not throw when Umami fails', async () => {
    admin.removeTeamUser.mockRejectedValue(new Error('status 500'));

    await expect(change([row(5, 'admin')], [])).resolves.toMatchObject({
      id: 2
    });
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('deleting a user', () => {
  const remember = (req: ReturnType<typeof makeReq>, id = 2) =>
    rememberStatsAccountHook({
      id,
      req
    } as unknown as Parameters<CollectionBeforeDeleteHook>[0]);

  const afterDelete = (req: ReturnType<typeof makeReq>, id = 2) =>
    deleteStatsAccountHook({
      doc: { id },
      id,
      req
    } as unknown as Parameters<CollectionAfterDeleteHook>[0]);

  it('deletes the Umami user of a user with an account', async () => {
    const req = makeReq();

    await remember(req);
    await afterDelete(req);

    expect(admin.deleteUser).toHaveBeenCalledWith('u-1');
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('deletes each Umami user once when several users go in one request', async () => {
    findByID.mockImplementation(async ({ id }) => ({
      statsAccount: { umamiUserId: `u-${id}` }
    }));
    const req = makeReq();

    await Promise.all([remember(req, 1), remember(req, 2)]);
    await Promise.all([afterDelete(req, 1), afterDelete(req, 2)]);

    expect(admin.deleteUser).toHaveBeenCalledTimes(2);
    expect(admin.deleteUser).toHaveBeenCalledWith('u-1');
    expect(admin.deleteUser).toHaveBeenCalledWith('u-2');
  });

  it('does not delete again for a user without an account after one with', async () => {
    findByID.mockImplementation(async ({ id }) => ({
      statsAccount: { umamiUserId: id === 1 ? 'u-1' : null }
    }));
    const req = makeReq();

    await remember(req, 1);
    await afterDelete(req, 1);
    await remember(req, 2);
    await afterDelete(req, 2);

    expect(admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(admin.deleteUser).toHaveBeenCalledWith('u-1');
  });

  it('leaves Umami alone for a user without an account', async () => {
    given(null);
    const req = makeReq();

    await remember(req);
    await afterDelete(req);

    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it('logs and does not throw when Umami fails', async () => {
    admin.deleteUser.mockRejectedValue(new Error('status 500'));
    const req = makeReq();

    await remember(req);
    await expect(afterDelete(req)).resolves.toMatchObject({ id: 2 });

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('skips quietly when Umami cannot be managed', async () => {
    jest
      .mocked(getUmamiAdminApi)
      .mockResolvedValue({ status: 'unreachable', error: 'vault' });
    const req = makeReq();

    await remember(req);
    await afterDelete(req);

    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
