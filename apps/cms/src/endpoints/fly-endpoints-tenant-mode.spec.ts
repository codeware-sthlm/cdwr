/** @jest-environment node */
import { getFlyApi } from '@codeware/app-cms/feature/domains';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { PayloadRequest } from 'payload';

import { platformDomainCertificateEndpoint } from './platform-domain-certificate';
import { platformMachineRestartEndpoint } from './platform-machine-restart';
import { tenantDomainCertificateEndpoint } from './tenant-domain-certificate';
import { tenantMachineRestartEndpoint } from './tenant-machine-restart';

jest.mock('@codeware/app-cms/feature/domains', () => ({
  ...jest.requireActual('@codeware/app-cms/feature/domains'),
  getFlyApi: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
// The ESM-only helper is pulled in through the misc barrel
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('payload', () => ({
  addDataAndFileToRequest: jest.fn(),
  headersWithCors: jest.fn()
}));

const systemUser = {
  id: 1,
  collection: 'users',
  email: 's@example.com',
  role: 'system-user',
  tenants: []
};

const endpoints = {
  tenantDomainCertificate: tenantDomainCertificateEndpoint,
  tenantMachineRestart: tenantMachineRestartEndpoint,
  platformDomainCertificate: platformDomainCertificateEndpoint,
  platformMachineRestart: platformMachineRestartEndpoint
};

const call = (handler: (req: PayloadRequest) => Promise<Response>) =>
  handler({
    user: systemUser,
    data: {},
    headers: new Headers(),
    payload: { logger: { error: jest.fn() } }
  } as unknown as PayloadRequest);

beforeEach(() => {
  jest.resetAllMocks();
});

describe.each(Object.entries(endpoints))('%s endpoint', (_name, endpoint) => {
  const handler = endpoint.handler as (
    req: PayloadRequest
  ) => Promise<Response>;

  it('answers 404 for a system user in tenant mode and never reaches Fly', async () => {
    jest.mocked(getEnv).mockReturnValue({
      APP_MODE: { type: 'tenant', tenantId: 'demo' }
    } as ReturnType<typeof getEnv>);

    expect((await call(handler)).status).toBe(404);
    expect(getFlyApi).not.toHaveBeenCalled();
  });

  it('lets a system user through the guard in host mode', async () => {
    jest.mocked(getEnv).mockReturnValue({
      APP_MODE: { type: 'host' }
    } as ReturnType<typeof getEnv>);

    // An empty body is past the guard, so it fails validation instead
    expect((await call(handler)).status).toBe(400);
    expect(getFlyApi).not.toHaveBeenCalled();
  });
});
