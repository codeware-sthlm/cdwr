import { FlyApi } from '@cdwr/fly-node/api';
import {
  clearIntegrationCredentials,
  getIntegrationCredentials
} from '@codeware/shared/feature/infisical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFlyApi } from './get-fly-api';

vi.mock('@codeware/shared/feature/infisical');

const credentials = vi.mocked(getIntegrationCredentials);
const clear = vi.mocked(clearIntegrationCredentials);

describe('getFlyApi', () => {
  beforeEach(() => {
    credentials.mockReset();
    clear.mockReset();
    credentials.mockResolvedValue({ API_TOKEN: 'fly_token' });
  });

  afterEach(() => {
    delete process.env['DEPLOY_ENV'];
  });

  it('builds a client from the stored token', async () => {
    const result = await getFlyApi();

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' && result.fly).toBeInstanceOf(FlyApi);
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(credentials).toHaveBeenCalledWith('fly', expect.anything());
    expect(clear).not.toHaveBeenCalled();
  });

  it('reads from the environment the deployment runs in', async () => {
    process.env['DEPLOY_ENV'] = 'production';

    await getFlyApi();

    expect(credentials).toHaveBeenCalledWith('fly', {
      environment: 'production'
    });
  });

  it('reads once more from fresh when the first read has no token', async () => {
    credentials.mockResolvedValueOnce({}).mockResolvedValueOnce({
      API_TOKEN: 'fly_token'
    });

    const result = await getFlyApi();

    expect(result.status).toBe('ready');
    expect(credentials).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith('fly');
    expect(clear.mock.invocationCallOrder[0]).toBeGreaterThan(
      credentials.mock.invocationCallOrder[0]
    );
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(
      credentials.mock.invocationCallOrder[1]
    );
  });

  it.each([
    ['the integration is not configured', {}],
    ['the folder exists without a token', { ORG: 'codeware' }]
  ])('is unconfigured when %s', async (_name, stored) => {
    // Custom domains are optional: the panel should explain this, not crash
    credentials.mockResolvedValue(stored);

    await expect(getFlyApi()).resolves.toEqual({ status: 'unconfigured' });
    expect(credentials).toHaveBeenCalledTimes(2);
  });

  it('is unreachable when the first read throws', async () => {
    // Reporting "not configured" here would invite someone to add a token
    // that is already there
    credentials.mockRejectedValue(new Error('Could not resolve credentials'));

    await expect(getFlyApi()).resolves.toEqual({
      status: 'unreachable',
      error: 'Could not resolve credentials'
    });
    expect(clear).not.toHaveBeenCalled();
  });

  it('is unreachable when the fresh read throws', async () => {
    credentials
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Infisical timed out'));

    await expect(getFlyApi()).resolves.toEqual({
      status: 'unreachable',
      error: 'Infisical timed out'
    });
  });
});
