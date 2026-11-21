import { InfisicalSDK } from '@infisical/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listInfisicalSecretImports } from './list-infisical-secret-imports';

vi.mock('@infisical/sdk');

describe('listInfisicalSecretImports', () => {
  const fetchMock = vi.fn();
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env['INFISICAL_CLIENT_ID'] = 'id';
    process.env['INFISICAL_CLIENT_SECRET'] = 'secret';
    process.env['INFISICAL_PROJECT_ID'] = 'project-1';
    delete process.env['INFISICAL_SERVICE_TOKEN'];
    delete process.env['INFISICAL_SITE'];

    vi.mocked(InfisicalSDK).mockImplementation(function () {
      return {
        auth: () => ({
          universalAuth: { login: vi.fn().mockResolvedValue({}) },
          getAccessToken: () => 'token-1'
        })
      } as unknown as InfisicalSDK;
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const options = {
    environment: 'preview',
    path: '/tenants/moon/apps/headless'
  };

  it('lists the imports with their environment', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        secretImports: [
          { importPath: '/apps/headless', importEnv: { slug: 'preview' } },
          { importPath: '/apps/cms/signature', importEnv: { slug: 'prod' } }
        ]
      })
    );

    await expect(listInfisicalSecretImports(options)).resolves.toEqual([
      { path: '/apps/headless', environment: 'preview' },
      { path: '/apps/cms/signature', environment: 'prod' }
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://app.infisical.com/api/v2/secret-imports?projectId=project-1&environment=preview&path=%2Ftenants%2Fmoon%2Fapps%2Fheadless'
    );
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token-1' });
  });

  it('is empty when there is no folder', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(listInfisicalSecretImports(options)).resolves.toEqual([]);
  });

  it('throws with the status when Infisical refuses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));

    await expect(listInfisicalSecretImports(options)).rejects.toThrow(
      'Infisical refused to list imports of /tenants/moon/apps/headless [StatusCode=403]'
    );
  });

  it('throws when the response has another shape', async () => {
    fetchMock.mockResolvedValue(Response.json({ secretImports: [{}] }));

    await expect(listInfisicalSecretImports(options)).rejects.toThrow();
  });
});
