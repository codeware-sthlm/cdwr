/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  type UmamiClient,
  fetchSiteStats,
  getUmamiApi,
  shareDashboardUrl,
  siteStatsCache
} from '@codeware/app-cms/feature/site-stats';
import type { PayloadRequest } from 'payload';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';

import { siteStatsEndpoint } from './site-stats';

jest.mock('@codeware/app-cms/feature/site-stats', () => ({
  getUmamiApi: jest.fn(),
  fetchSiteStats: jest.fn(),
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
    payload: { findByID, logger: { error: logError } }
  } as unknown as PayloadRequest);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getEnv).mockReturnValue({
    UMAMI_URL: 'https://umami.example'
  } as ReturnType<typeof getEnv>);
  jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(5);
  findByID.mockResolvedValue({ statsWebsiteId: 'site-1' });
  jest.mocked(getUmamiApi).mockResolvedValue({ status: 'ready', umami });
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
        select: { statsWebsiteId: true, statsShareId: true }
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

  it('returns the statistics without letting anything cache them', async () => {
    const response = await call(memberOf(5));

    await expect(response.json()).resolves.toEqual({ status: 'ready', stats });
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
      dashboardUrl: 'https://umami.example/share/abc'
    });
  });

  it('leaves the dashboard url out without a share link', async () => {
    jest.mocked(shareDashboardUrl).mockReturnValue(null);

    const body = await (await call(memberOf(5))).json();

    expect(body).not.toHaveProperty('dashboardUrl');
  });
});
