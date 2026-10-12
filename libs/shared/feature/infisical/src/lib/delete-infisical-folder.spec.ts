import { InfisicalSDK } from '@infisical/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteInfisicalFolder } from './delete-infisical-folder';

vi.mock('@infisical/sdk');

describe('deleteInfisicalFolder', () => {
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

  const respond = (status: number) =>
    fetchMock.mockResolvedValue(new Response(null, { status }));

  it.each([200, 204])('is true on %i', async (status) => {
    respond(status);
    await expect(
      deleteInfisicalFolder({ environment: 'preview', path: '/tenants/moon' })
    ).resolves.toBe(true);
  });

  it('calls the v2 API with the parent as path and the last segment as name', async () => {
    respond(200);
    await deleteInfisicalFolder({
      environment: 'preview',
      path: '/tenants/moon/apps'
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app.infisical.com/api/v2/folders/apps');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token-1' });
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: 'project-1',
      environment: 'preview',
      path: '/tenants/moon',
      forceDelete: true
    });
  });

  it('uses the root as parent for a top-level folder', async () => {
    respond(200);
    await deleteInfisicalFolder({
      environment: 'development',
      path: '/tenants'
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      environment: 'development',
      path: '/'
    });
  });

  it('uses the EU site when asked', async () => {
    respond(200);
    await deleteInfisicalFolder({
      environment: 'development',
      path: '/tenants/moon',
      site: 'eu'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://eu.infisical.com/api/v2/folders/moon'
    );
  });

  it('is false when the folder is not found', async () => {
    respond(404);
    await expect(
      deleteInfisicalFolder({
        environment: 'development',
        path: '/tenants/moon'
      })
    ).resolves.toBe(false);
  });

  it('throws on anything else', async () => {
    respond(403);
    await expect(
      deleteInfisicalFolder({
        environment: 'development',
        path: '/tenants/moon'
      })
    ).rejects.toThrow('403');
  });

  it('refuses the root', async () => {
    await expect(
      deleteInfisicalFolder({ environment: 'development', path: '/' })
    ).rejects.toThrow('root');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
