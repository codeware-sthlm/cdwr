import { InfisicalSDK } from '@infisical/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readOwnInfisicalSecrets } from './read-own-infisical-secrets';

vi.mock('@infisical/sdk');

describe('readOwnInfisicalSecrets', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const listSecrets = vi.fn();

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
        secrets: () => ({ listSecrets })
      } as unknown as InfisicalSDK;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('reads the folder itself, unexpanded and without imports', async () => {
    listSecrets.mockResolvedValue({
      secrets: [{ secretKey: 'A', secretValue: '${B}', type: 'shared' }]
    });
    await expect(
      readOwnInfisicalSecrets({ environment: 'production', path: '/apps/cms' })
    ).resolves.toEqual([{ secretKey: 'A', secretValue: '${B}' }]);
    expect(listSecrets).toHaveBeenCalledWith({
      projectId: 'project-1',
      environment: 'production',
      secretPath: '/apps/cms',
      recursive: false,
      includeImports: false,
      expandSecretReferences: false,
      viewSecretValue: true
    });
  });
});
