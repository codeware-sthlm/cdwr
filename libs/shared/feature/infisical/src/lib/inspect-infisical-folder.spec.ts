import { InfisicalSDK } from '@infisical/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inspectInfisicalFolder } from './inspect-infisical-folder';

vi.mock('@infisical/sdk');

describe('inspectInfisicalFolder', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const listFolders = vi.fn();
  const listSecrets = vi.fn();

  /** Folder tree as parent path -> child names, secrets as path -> count */
  const tree = (
    children: Record<string, string[]>,
    counts: Record<string, number>
  ) => {
    listFolders.mockImplementation(async ({ path }: { path: string }) =>
      (children[path] ?? []).map((name) => ({ name }))
    );
    listSecrets.mockImplementation(
      async ({ secretPath }: { secretPath: string }) => ({
        secrets: Array.from({ length: counts[secretPath] ?? 0 }, () => ({
          secretValue: 'hidden'
        }))
      })
    );
  };

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
        }),
        folders: () => ({ listFolders }),
        secrets: () => ({ listSecrets })
      } as unknown as InfisicalSDK;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('is null when the folder is not there', async () => {
    tree({ '/tenants': ['sun'] }, {});
    await expect(
      inspectInfisicalFolder({ environment: 'preview', path: '/tenants/moon' })
    ).resolves.toBeNull();
    expect(listSecrets).not.toHaveBeenCalled();
  });

  it('lists an existing folder without subfolders', async () => {
    tree({ '/tenants': ['moon'] }, { '/tenants/moon': 3 });
    await expect(
      inspectInfisicalFolder({ environment: 'preview', path: '/tenants/moon' })
    ).resolves.toEqual([{ path: '/tenants/moon', secrets: 3 }]);
  });

  it('counts each nested folder on its own, sorted by path', async () => {
    tree(
      {
        '/tenants': ['moon', 'moonlight'],
        '/tenants/moon': ['apps', 'config'],
        '/tenants/moon/apps': ['cms']
      },
      {
        '/tenants/moon': 1,
        '/tenants/moon/apps': 0,
        '/tenants/moon/apps/cms': 4,
        '/tenants/moon/config': 2,
        '/tenants/moonlight': 9
      }
    );
    await expect(
      inspectInfisicalFolder({ environment: 'preview', path: '/tenants/moon' })
    ).resolves.toEqual([
      { path: '/tenants/moon', secrets: 1 },
      { path: '/tenants/moon/apps', secrets: 0 },
      { path: '/tenants/moon/apps/cms', secrets: 4 },
      { path: '/tenants/moon/config', secrets: 2 }
    ]);
  });

  it('reads one level at a time, without imports', async () => {
    tree({ '/tenants': ['moon'], '/tenants/moon': ['apps'] }, {});
    await inspectInfisicalFolder({
      environment: 'preview',
      path: '/tenants/moon'
    });

    for (const [options] of listFolders.mock.calls) {
      expect(options).toMatchObject({
        projectId: 'project-1',
        environment: 'preview'
      });
      expect(options.recursive).toBeUndefined();
    }
    for (const [options] of listSecrets.mock.calls) {
      expect(options).toMatchObject({
        projectId: 'project-1',
        environment: 'preview',
        recursive: false,
        includeImports: false
      });
    }
    expect(listSecrets).toHaveBeenCalledTimes(2);
  });
});
