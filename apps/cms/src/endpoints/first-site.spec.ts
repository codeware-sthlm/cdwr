/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  applySiteDefinition,
  buildStarterDefinition
} from '@codeware/app-cms/feature/seed';
import type { PayloadRequest } from 'payload';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';
import { resolveScopedTenant } from '../security/resolve-scoped-tenant';

import { firstSiteEndpoint, parseFirstSiteAnswers } from './first-site';

jest.mock('payload', () => ({ addDataAndFileToRequest: jest.fn() }));
// The ESM-only helper is pulled in through the access utilities
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/seed', () => ({
  STARTER_PURPOSES: ['business', 'portfolio', 'association'],
  STARTER_PAGES: ['about', 'contact', 'news', 'privacy'],
  applySiteDefinition: jest.fn(),
  buildStarterDefinition: jest.fn(),
  workspaceLocale: (_: unknown, supported?: Array<string>) =>
    supported?.[0] ?? 'en'
}));
jest.mock('../components/admin/utils/tenant-where', () => ({
  getSingleTenantIdFromHeaders: jest.fn()
}));
jest.mock('../security/resolve-scoped-tenant', () => ({
  resolveScopedTenant: jest.fn()
}));
jest.mock('../utils/deployment-privacy-facts', () => ({
  deploymentPrivacyFacts: () => ({ errorMonitoring: true })
}));

const count = jest.fn();
const find = jest.fn();
const findByID = jest.fn();
const logger = { error: jest.fn(), info: jest.fn() };

const answers = { purpose: 'business', pages: ['about'], theme: 'codeware' };
const adminOf = (tenant: number, role = 'admin') => ({
  id: 2,
  collection: 'users',
  email: 'owner@example.com',
  role: 'user',
  tenants: [{ tenant, role }]
});

const call = (user: unknown, data: unknown = answers) =>
  firstSiteEndpoint.handler({
    user,
    data,
    headers: new Headers(),
    payload: { count, find, findByID, logger }
  } as unknown as PayloadRequest);

const report = (overrides = {}) => ({
  dryRun: false,
  unresolved: [],
  outcomes: [
    { collection: 'pages', identifier: 'home', action: 'created' },
    { collection: 'pages', identifier: 'about', action: 'created' }
  ],
  ...overrides
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getEnv).mockReturnValue({
    APP_MODE: { type: 'host' }
  } as ReturnType<typeof getEnv>);
  jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(5);
  count.mockResolvedValue({ totalDocs: 0 });
  findByID.mockResolvedValue({
    name: 'Acme',
    slug: 'acme',
    supportedLocales: ['sv'],
    statsWebsiteId: null
  });
  find.mockResolvedValue({ docs: [{ id: 42 }] });
  jest.mocked(buildStarterDefinition).mockReturnValue({
    name: 'starter:business',
    pages: []
  });
  jest.mocked(applySiteDefinition).mockResolvedValue(report() as never);
});

describe('parseFirstSiteAnswers', () => {
  it.each([
    ['no body', null],
    ['an unknown purpose', { ...answers, purpose: 'shop' }],
    ['an unknown theme', { ...answers, theme: 'neon' }],
    ['an unknown page', { ...answers, pages: ['home'] }],
    ['a repeated page', { ...answers, pages: ['about', 'about'] }],
    ['pages that are not a list', { ...answers, pages: 'about' }]
  ])('refuses %s', (_, body) => {
    expect(parseFirstSiteAnswers(body)).toBeNull();
  });

  it('keeps only the answers it knows', () => {
    expect(
      parseFirstSiteAnswers({ ...answers, tenant: 9, email: 'x@y.z' })
    ).toEqual(answers);
  });
});

describe('firstSiteEndpoint', () => {
  it.each([
    ['nobody', null],
    ['a tenant API key', { id: 5, collection: 'tenants', slug: 'acme' }],
    ['a system user', { ...adminOf(5), role: 'system-user' }],
    ['an editor', adminOf(5, 'user')],
    ['an admin of another workspace', adminOf(6)]
  ])('refuses %s', async (_, user) => {
    const response = await call(user);

    expect(response.status).toBe(403);
    expect(applySiteDefinition).not.toHaveBeenCalled();
  });

  it('refuses when no single workspace is selected', async () => {
    jest.mocked(getSingleTenantIdFromHeaders).mockReturnValue(null);

    expect((await call(adminOf(5))).status).toBe(403);
  });

  it('uses the deployed workspace in tenant mode', async () => {
    jest.mocked(getEnv).mockReturnValue({
      APP_MODE: { type: 'tenant' }
    } as ReturnType<typeof getEnv>);
    jest.mocked(resolveScopedTenant).mockResolvedValue({ id: 6 } as never);

    expect((await call(adminOf(5))).status).toBe(403);
    expect((await call(adminOf(6))).status).toBe(201);
  });

  it('refuses answers it does not know', async () => {
    const response = await call(adminOf(5), { ...answers, purpose: 'shop' });

    expect(response.status).toBe(400);
  });

  it('refuses a workspace that already has pages', async () => {
    count.mockResolvedValue({ totalDocs: 1 });

    const response = await call(adminOf(5));

    expect(response.status).toBe(409);
    expect(applySiteDefinition).not.toHaveBeenCalled();
  });

  it('refuses a second submit while the first is applying', async () => {
    let finish: (value: unknown) => void = () => undefined;
    jest
      .mocked(applySiteDefinition)
      .mockReturnValueOnce(
        new Promise((resolve) => (finish = resolve)) as never
      );

    const first = call(adminOf(5));
    await new Promise((resolve) => setImmediate(resolve));
    const second = await call(adminOf(5));
    finish(report());

    expect(second.status).toBe(409);
    expect((await first).status).toBe(201);
    expect((await call(adminOf(5))).status).toBe(201);
  });

  it('builds the starter from the workspace, not the body', async () => {
    await call(adminOf(5));

    expect(buildStarterDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...answers,
        appName: 'Acme',
        email: 'owner@example.com',
        locale: 'sv',
        privacy: expect.objectContaining({ errorMonitoring: true })
      })
    );
    expect(applySiteDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { tenantSlug: 'acme', dryRun: false, locale: 'sv' }
    );
  });

  it('answers with what was created and the home page', async () => {
    const response = await call(adminOf(5));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: 2, homePageId: 42 });
  });

  it('fails when references are left unresolved', async () => {
    jest
      .mocked(applySiteDefinition)
      .mockResolvedValue(
        report({ dryRun: true, unresolved: [{ path: 'x' }] }) as never
      );

    expect((await call(adminOf(5))).status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('fails and releases the lock when the apply throws', async () => {
    jest.mocked(applySiteDefinition).mockRejectedValueOnce(new Error('db'));

    expect((await call(adminOf(5))).status).toBe(500);
    expect((await call(adminOf(5))).status).toBe(201);
  });
});
