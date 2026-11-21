import { InfisicalSDK } from '@infisical/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setInfisicalSecret } from './set-infisical-secret';

vi.mock('@infisical/sdk');

describe('setInfisicalSecret', () => {
  const createSecret = vi.fn();
  const updateSecret = vi.fn();
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
        }),
        secrets: () => ({ createSecret, updateSecret })
      } as unknown as InfisicalSDK;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('creates only, never updating, with createOnly', async () => {
    createSecret.mockResolvedValue({});
    await expect(
      setInfisicalSecret({
        environment: 'production',
        path: '/apps/cms',
        key: 'K',
        value: 'v',
        createOnly: true
      })
    ).resolves.toEqual({ action: 'created', key: 'K', path: '/apps/cms' });
    expect(createSecret).toHaveBeenCalledTimes(1);
    expect(updateSecret).not.toHaveBeenCalled();
  });

  it('lets an already-exists error through with createOnly', async () => {
    createSecret.mockRejectedValue(new Error('Secret K already exists'));
    await expect(
      setInfisicalSecret({
        environment: 'production',
        key: 'K',
        value: 'v',
        createOnly: true
      })
    ).rejects.toThrow('already exists');
    expect(updateSecret).not.toHaveBeenCalled();
  });

  it('updates first by default', async () => {
    updateSecret.mockResolvedValue({});
    await expect(
      setInfisicalSecret({ environment: 'production', key: 'K', value: 'v' })
    ).resolves.toMatchObject({ action: 'updated' });
    expect(createSecret).not.toHaveBeenCalled();
  });
});
