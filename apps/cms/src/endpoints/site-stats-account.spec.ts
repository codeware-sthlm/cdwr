/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  UmamiNotFoundError,
  UmamiUserExistsError,
  getUmamiAdminApi
} from '@codeware/app-cms/feature/site-stats';
import type { PayloadRequest } from 'payload';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';

import { siteStatsAccountEndpoint } from './site-stats-account';

jest.mock('@codeware/app-cms/feature/site-stats', () => ({
  STATS_USER_ROLE: 'view-only',
  STATS_TEAM_ROLE: 'team-view-only',
  UmamiNotFoundError: class UmamiNotFoundError extends Error {},
  UmamiUserExistsError: class UmamiUserExistsError extends Error {},
  getUmamiAdminApi: jest.fn()
}));
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
// The email barrel reaches the ESM-only mail transport, which rendering never uses
jest.mock('@payloadcms/email-nodemailer', () => ({}));
jest.mock('nodemailer', () => ({}));
jest.mock('@sentry/nextjs', () => ({}));
jest.mock('@codeware/app-cms/data-access', () => ({
  getSiteSettingsForTenant: jest.fn().mockResolvedValue(null)
}));
jest.mock('payload', () => ({
  addDataAndFileToRequest: jest.fn()
}));
jest.mock('../components/admin/utils/tenant-where', () => ({
  getSingleTenantIdFromHeaders: jest.fn()
}));

const admin = {
  createUser: jest.fn(),
  setPassword: jest.fn(),
  addTeamUser: jest.fn(),
  removeTeamUser: jest.fn(),
  deleteUser: jest.fn()
};
const findByID = jest.fn();
const update = jest.fn();
const sendEmail = jest.fn();
const info = jest.fn();
const warn = jest.fn();
const error = jest.fn();

const adminUser = {
  id: 2,
  collection: 'users',
  email: 'Ada@Example.com',
  role: 'user',
  tenants: [{ tenant: 5, role: 'admin' }]
};
const systemUser = {
  id: 1,
  collection: 'users',
  email: 's@example.com',
  role: 'system-user'
};
const readerUser = {
  id: 3,
  collection: 'users',
  email: 'r@example.com',
  role: 'user',
  tenants: [{ tenant: 5, role: 'reader' }]
};

/** The tenant read, then the caller's own record */
const givenAccount = (umamiUserId?: string) =>
  findByID.mockImplementation(async ({ collection }) =>
    collection === 'tenants'
      ? { statsWebsiteId: 'site-1', statsTeamId: 'team-1' }
      : {
          ...adminUser,
          statsAccount: umamiUserId ? { umamiUserId } : null
        }
  );

const call = (user: unknown, data: unknown = { action: 'create' }) =>
  siteStatsAccountEndpoint.handler({
    user,
    data,
    headers: new Headers(),
    i18n: { language: 'sv' },
    payload: {
      findByID,
      update,
      sendEmail,
      config: { serverURL: 'https://cms.example' },
      logger: { info, warn, error }
    }
  } as unknown as PayloadRequest);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getEnv).mockReturnValue({
    UMAMI_URL: 'https://umami.example/'
  } as ReturnType<typeof getEnv>);
  jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(5);
  jest.mocked(getUmamiAdminApi).mockResolvedValue({
    status: 'ready',
    umami: admin
  });
  givenAccount();
  admin.createUser.mockResolvedValue({
    id: 'u-1',
    username: 'ada@example.com'
  });
  admin.setPassword.mockResolvedValue(undefined);
  admin.addTeamUser.mockResolvedValue(undefined);
  update.mockResolvedValue({});
  sendEmail.mockResolvedValue(undefined);
});

describe('siteStatsAccountEndpoint', () => {
  it('refuses a request without a user', async () => {
    expect((await call(null)).status).toBe(401);
  });

  it('refuses a workspace api key', async () => {
    expect((await call({ id: 5, collection: 'tenants' })).status).toBe(403);
  });

  it('refuses an unknown action', async () => {
    expect((await call(adminUser, { action: 'delete' })).status).toBe(400);
  });

  it('creates the login, stores the id, joins the team and mails it', async () => {
    const response = await call(adminUser);

    expect(response.status).toBe(200);
    const created = admin.createUser.mock.calls[0][0];
    expect(created).toMatchObject({
      username: 'ada@example.com',
      role: 'view-only'
    });
    expect(created.password).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 2,
        overrideAccess: true,
        data: {
          statsAccount: {
            umamiUserId: 'u-1',
            createdAt: expect.any(String)
          }
        }
      })
    );
    expect(admin.addTeamUser).toHaveBeenCalledWith(
      'team-1',
      'u-1',
      'team-view-only'
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('Ada@Example.com');
    expect(mail.text).toContain(created.password);
    expect(mail.text).toContain('https://umami.example/login');
  });

  it('logs one line per action and never the password', async () => {
    await call(adminUser);

    const { password } = admin.createUser.mock.calls[0][0];
    expect(info).toHaveBeenCalledWith(
      'stats account create: user u-1 tenant 5'
    );
    const logged = [info, warn, error]
      .flatMap((log) => log.mock.calls)
      .join('\n');
    expect(logged).not.toContain(password);
  });

  it('resets the password, ensures membership and mails it', async () => {
    givenAccount('u-9');

    const response = await call(adminUser, { action: 'reset' });

    expect(response.status).toBe(200);
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.setPassword).toHaveBeenCalledWith(
      'u-9',
      expect.stringMatching(/^[A-Za-z0-9_-]{20}$/)
    );
    expect(admin.addTeamUser).toHaveBeenCalledWith(
      'team-1',
      'u-9',
      'team-view-only'
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('stats account reset: user u-9 tenant 5');
  });

  it('answers 409 conflict and warns when the username is taken in Umami', async () => {
    admin.createUser.mockRejectedValue(new UmamiUserExistsError('x'));

    const response = await call(adminUser);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'conflict' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('answers 409 for a mismatched action', async () => {
    expect((await call(adminUser, { action: 'reset' })).status).toBe(409);
    givenAccount('u-9');
    expect((await call(adminUser, { action: 'create' })).status).toBe(409);
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.setPassword).not.toHaveBeenCalled();
  });

  it('refuses a system user and a non-admin', async () => {
    expect((await call(systemUser)).status).toBe(403);
    expect((await call(readerUser)).status).toBe(403);
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it('refuses an admin of another workspace', async () => {
    jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(9);
    expect((await call(adminUser)).status).toBe(403);
  });

  it('answers 502 and sends no mail when Umami fails', async () => {
    admin.createUser.mockRejectedValue(new Error('status 500'));

    const response = await call(adminUser);

    expect(response.status).toBe(502);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('deletes the new Umami user and answers 502 when storing its id fails', async () => {
    update.mockRejectedValue(new Error('db down'));

    const response = await call(adminUser);

    expect(response.status).toBe(502);
    expect(admin.deleteUser).toHaveBeenCalledWith('u-1');
    expect(admin.addTeamUser).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still answers 502 when the compensation fails too', async () => {
    update.mockRejectedValue(new Error('db down'));
    admin.deleteUser.mockRejectedValue(new Error('status 500'));

    const response = await call(adminUser);

    expect(response.status).toBe(502);
    expect(error).toHaveBeenCalledTimes(2);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('clears a stale id and creates a new login on reset', async () => {
    givenAccount('u-9');
    admin.setPassword.mockRejectedValue(new UmamiNotFoundError('u-9'));

    const response = await call(adminUser, { action: 'reset' });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'users',
        id: 2,
        data: { statsAccount: { umamiUserId: null, createdAt: null } },
        context: { statsAccountWrite: true },
        overrideAccess: true
      })
    );
    expect(admin.createUser).toHaveBeenCalledTimes(1);
    expect(admin.addTeamUser).toHaveBeenCalledWith(
      'team-1',
      'u-1',
      'team-view-only'
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('removes the team membership and sends no mail when the caller was demoted meanwhile', async () => {
    findByID.mockImplementation(async ({ collection, select }) =>
      collection === 'tenants'
        ? { statsWebsiteId: 'site-1', statsTeamId: 'team-1' }
        : select
          ? { statsAccount: null }
          : { ...adminUser, tenants: [{ tenant: 5, role: 'reader' }] }
    );

    const response = await call(adminUser);

    expect(response.status).toBe(403);
    expect(admin.addTeamUser).toHaveBeenCalledTimes(1);
    expect(admin.removeTeamUser).toHaveBeenCalledWith('team-1', 'u-1');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
