import {
  clearIntegrationCredentials,
  getIntegrationCredentials
} from '@codeware/shared/feature/infisical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getUmamiAdminApi, getUmamiApi } from './get-umami-api';

vi.mock('@codeware/shared/feature/infisical');

const credentials = vi.mocked(getIntegrationCredentials);
const clear = vi.mocked(clearIntegrationCredentials);

const URL = 'https://umami.test';

describe('getUmamiApi', () => {
  beforeEach(() => {
    credentials.mockReset();
    clear.mockReset();
    credentials.mockResolvedValue({ API_KEY: 'umami_key' });
  });

  afterEach(() => {
    delete process.env['DEPLOY_ENV'];
  });

  it('builds a client from the stored key', async () => {
    const result = await getUmamiApi(URL);

    expect(result.status).toBe('ready');
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(credentials).toHaveBeenCalledWith('umami', expect.anything());
    expect(clear).not.toHaveBeenCalled();
  });

  it('is unconfigured without a url, and does not read the vault', async () => {
    expect(await getUmamiApi(undefined)).toEqual({ status: 'unconfigured' });
    expect(await getUmamiApi('')).toEqual({ status: 'unconfigured' });
    expect(credentials).not.toHaveBeenCalled();
  });

  it('reads from the environment the deployment runs in', async () => {
    process.env['DEPLOY_ENV'] = 'production';

    await getUmamiApi(URL);

    expect(credentials).toHaveBeenCalledWith('umami', {
      environment: 'production'
    });
  });

  it('is unconfigured without a key, reading Infisical once', async () => {
    credentials.mockResolvedValue({});

    expect(await getUmamiApi(URL)).toEqual({ status: 'unconfigured' });
    expect(credentials).toHaveBeenCalledTimes(1);
  });

  it('is unreachable, not unconfigured, when the secret store fails', async () => {
    credentials.mockRejectedValue(new Error('vault down'));

    expect(await getUmamiApi(URL)).toEqual({
      status: 'unreachable',
      error: 'vault down'
    });
  });

  it('describes a thrown non-error', async () => {
    credentials.mockRejectedValue('boom');

    expect(await getUmamiApi(URL)).toEqual({
      status: 'unreachable',
      error: 'boom'
    });
  });
});

describe('getUmamiAdminApi', () => {
  beforeEach(() => {
    credentials.mockReset();
  });

  it('builds a client from ADMIN_API_KEY', async () => {
    credentials.mockResolvedValue({ ADMIN_API_KEY: 'admin_key' });

    expect((await getUmamiAdminApi(URL)).status).toBe('ready');
  });

  it('never falls back to the read key', async () => {
    credentials.mockResolvedValue({ API_KEY: 'umami_key' });

    expect(await getUmamiAdminApi(URL)).toEqual({ status: 'unconfigured' });
  });

  it('is unconfigured without a url, and does not read the vault', async () => {
    expect(await getUmamiAdminApi(undefined)).toEqual({
      status: 'unconfigured'
    });
    expect(credentials).not.toHaveBeenCalled();
  });

  it('is unreachable when the secret store fails', async () => {
    credentials.mockRejectedValue(new Error('vault down'));

    expect(await getUmamiAdminApi(URL)).toEqual({
      status: 'unreachable',
      error: 'vault down'
    });
  });
});
