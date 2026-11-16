import { InfisicalSDK } from '@infisical/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureInfisicalSecretImport } from './ensure-infisical-secret-import';

vi.mock('@infisical/sdk');

describe('ensureInfisicalSecretImport', () => {
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
    path: '/tenants/moon/apps/headless',
    importPath: '/apps/headless'
  };

  const listing = (
    imports: Array<{ importPath: string; importEnv: { slug: string } }>
  ) => Response.json({ secretImports: imports });

  it('is false and posts nothing when the import is there', async () => {
    fetchMock.mockResolvedValueOnce(
      listing([
        { importPath: '/apps/cms/signature', importEnv: { slug: 'preview' } },
        { importPath: '/apps/headless', importEnv: { slug: 'preview' } }
      ])
    );

    await expect(ensureInfisicalSecretImport(options)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v2/secret-imports?');
    expect(init.method).toBe('GET');
  });

  it('posts when the same path is imported from another environment', async () => {
    fetchMock
      .mockResolvedValueOnce(
        listing([{ importPath: '/apps/headless', importEnv: { slug: 'prod' } }])
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(ensureInfisicalSecretImport(options)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe(
      'POST'
    );
  });

  it('creates the import through the v2 API and is true', async () => {
    fetchMock
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(ensureInfisicalSecretImport(options)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://app.infisical.com/api/v2/secret-imports');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token-1' });
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: 'project-1',
      environment: 'preview',
      path: '/tenants/moon/apps/headless',
      import: { environment: 'preview', path: '/apps/headless' }
    });
  });

  it('throws with the status when Infisical refuses', async () => {
    fetchMock
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(ensureInfisicalSecretImport(options)).rejects.toThrow(
      'Infisical refused to import /apps/headless into /tenants/moon/apps/headless [StatusCode=403]'
    );
  });
});
