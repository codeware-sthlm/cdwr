/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  type UmamiClient,
  fetchSiteStats,
  getUmamiAdminApi,
  getUmamiApi,
  isWaking,
  shareDashboardUrl,
  siteStatsCache
} from '@codeware/app-cms/feature/site-stats';
import type { PayloadRequest } from 'payload';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';

import { siteStatsEndpoint } from './site-stats';

jest.mock('@codeware/app-cms/feature/site-stats', () => ({
  getUmamiApi: jest.fn(),
  getUmamiAdminApi: jest.fn(),
  fetchSiteStats: jest.fn(),
  isWaking: jest.fn(),
  shareDashboardUrl: jest.fn(),
  siteStatsCache: { get: jest.fn() }
}));
// The ESM-only helper is pulled in through the access utilities
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
  getSiteSettingsForTenant: jest.fn()
}));
jest.mock('payload', () => ({ addDataAndFileToRequest: jest.fn() }));
jest.mock('../components/admin/utils/tenant-where', () => ({
  getSingleTenantIdFromHeaders: jest.fn()
}));

const stats = { week: {}, month: {}, daily: [], top: {} };
const umami: UmamiClient = {
  stats: jest.fn(),
  pageviews: jest.fn(),
  metrics: jest.fn()
};

const findByID = jest.fn();
const logError = jest.fn();
const logWarn = jest.fn();

const systemUser = { id: 1, role: 'system-user', tenants: [] };
const memberOf = (tenant: number) => ({
  id: 2,
  role: 'user',
  tenants: [{ tenant, role: 'reader' }]
});

const call = (user: unknown) =>
  siteStatsEndpoint.handler({
    user,
    headers: new Headers(),
    payload: { findByID, logger: { error: logError, warn: logWarn } }
  } as unknown as PayloadRequest);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getEnv).mockReturnValue({
    UMAMI_URL: 'https://umami.example'
  } as ReturnType<typeof getEnv>);
  jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(5);
  findByID.mockResolvedValue({ statsWebsiteId: 'site-1' });
  jest.mocked(getUmamiApi).mockResolvedValue({ status: 'ready', umami });
  jest.mocked(getUmamiAdminApi).mockResolvedValue({
    status: 'ready',
    umami: {} as never
  });
  jest.mocked(fetchSiteStats).mockResolvedValue(stats as never);
  jest
    .mocked(siteStatsCache.get)
    .mockImplementation((_websiteId, load) => load());
});

describe('siteStatsEndpoint', () => {
  it('refuses a request without a user', async () => {
    const response = await call(null);

    expect(response.status).toBe(401);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('answers none when no workspace is selected', async () => {
    jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(null);

    const response = await call(systemUser);

    await expect(response.json()).resolves.toEqual({ status: 'none' });
    expect(findByID).not.toHaveBeenCalled();
  });

  it('answers none for a member of another workspace, without reading', async () => {
    const response = await call(memberOf(9));

    await expect(response.json()).resolves.toEqual({ status: 'none' });
    expect(findByID).not.toHaveBeenCalled();
  });

  it('reads the selected workspace for a system user', async () => {
    const response = await call(systemUser);

    await expect(response.json()).resolves.toMatchObject({ status: 'ready' });
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tenants', id: 5 })
    );
  });

  it('reads only the website id, past access, for a member', async () => {
    await call(memberOf(5));

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        overrideAccess: true,
        select: {
          statsWebsiteId: true,
          statsShareId: true,
          statsTeamId: true
        }
      })
    );
  });

  it('answers none when the workspace has no website id', async () => {
    findByID.mockResolvedValue({ statsWebsiteId: null });

    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'none' });
    expect(getUmamiApi).not.toHaveBeenCalled();
  });

  it('answers unconfigured when Umami has no credentials', async () => {
    jest.mocked(getUmamiApi).mockResolvedValue({ status: 'unconfigured' });

    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'unconfigured' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('answers unreachable and logs when the credentials are unreadable', async () => {
    jest
      .mocked(getUmamiApi)
      .mockResolvedValue({ status: 'unreachable', error: 'vault down' });

    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'unreachable' });
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('vault down')
    );
  });

  it('answers unreachable and logs when Umami fails', async () => {
    jest.mocked(fetchSiteStats).mockRejectedValue(new Error('boom'));

    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'unreachable' });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('answers waking and logs at warn when Umami is waking up', async () => {
    jest.mocked(fetchSiteStats).mockRejectedValue(new Error('timed out'));
    jest.mocked(isWaking).mockReturnValue(true);

    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'waking' });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(logError).not.toHaveBeenCalled();
  });

  it('answers unreachable when Umami refuses', async () => {
    jest.mocked(fetchSiteStats).mockRejectedValue(new Error('status 401'));
    jest.mocked(isWaking).mockReturnValue(false);

    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'unreachable' });
    expect(logError).toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('returns the statistics without letting anything cache them', async () => {
    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      stats,
      account: 'none'
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('adds the dashboard url for a workspace with a share link', async () => {
    findByID.mockResolvedValue({
      statsWebsiteId: 'site-1',
      statsShareId: 'abc'
    });
    jest
      .mocked(shareDashboardUrl)
      .mockReturnValue('https://umami.example/share/abc');

    const response = await call(memberOf(5));

    expect(shareDashboardUrl).toHaveBeenCalledWith(
      'https://umami.example',
      'abc'
    );
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      stats,
      account: 'none',
      dashboardUrl: 'https://umami.example/share/abc'
    });
  });

  it('leaves the dashboard url out without a share link', async () => {
    jest.mocked(shareDashboardUrl).mockReturnValue(null);

    const body = await (await call(memberOf(5))).json();

    expect(body).not.toHaveProperty('dashboardUrl');
  });

  describe('account', () => {
    const adminOf = (tenant: number) => ({
      id: 2,
      role: 'user',
      tenants: [{ tenant, role: 'admin' }]
    });
    const withTeam = { statsWebsiteId: 'site-1', statsTeamId: 'team-1' };

    const accountOf = async (user: unknown) =>
      ((await (await call(user)).json()) as { account?: string }).account;

    /** The tenant read, then the caller's own record */
    const givenUser = (statsAccount: { umamiUserId?: string } | null) =>
      findByID.mockImplementation(async ({ collection }) =>
        collection === 'tenants' ? withTeam : { statsAccount }
      );

    it('is none for a system user', async () => {
      givenUser(null);
      await expect(accountOf(systemUser)).resolves.toBe('none');
    });

    it('is none for a member who is not an admin of the workspace', async () => {
      givenUser(null);
      await expect(accountOf(memberOf(5))).resolves.toBe('none');
    });

    it('is none when the workspace has no team', async () => {
      findByID.mockResolvedValue({ statsWebsiteId: 'site-1' });
      await expect(accountOf(adminOf(5))).resolves.toBe('none');
    });

    it('is none when Umami cannot be managed', async () => {
      givenUser(null);
      jest
        .mocked(getUmamiAdminApi)
        .mockResolvedValue({ status: 'unconfigured' });
      await expect(accountOf(adminOf(5))).resolves.toBe('none');
    });

    it('is available for an admin without an account', async () => {
      givenUser(null);
      await expect(accountOf(adminOf(5))).resolves.toBe('available');
    });

    it('is ready for an admin with an account', async () => {
      givenUser({ umamiUserId: 'u-1' });
      await expect(accountOf(adminOf(5))).resolves.toBe('ready');
    });
  });
});
