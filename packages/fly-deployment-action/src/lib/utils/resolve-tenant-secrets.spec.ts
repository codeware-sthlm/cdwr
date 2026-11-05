import * as core from '@actions/core';
import { fetchDeployments } from '@codeware/shared/feature/tenancy';
import * as github from '@codeware/shared/util/github';

import { resolveTenantSecrets } from './resolve-tenant-secrets';

vi.mock('@actions/core');
vi.mock('@codeware/shared/feature/tenancy', () => ({
  fetchDeployments: vi.fn()
}));
vi.mock('@codeware/shared/util/github', async () => ({
  ...(await vi.importActual('@codeware/shared/util/github')),
  maskSecrets: vi.fn()
}));

describe('resolveTenantSecrets', () => {
  const mockFetchDeployments = vi.mocked(fetchDeployments);
  const mockMaskSecrets = vi.mocked(github.maskSecrets);

  const infisical = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    projectId: 'project-id',
    site: 'eu' as const
  };

  const fetched = (
    deployments: Awaited<ReturnType<typeof fetchDeployments>>['deployments']
  ) => mockFetchDeployments.mockResolvedValue({ deployments, skipped: [] });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not contact Infisical for a host-only plan', async () => {
    const result = await resolveTenantSecrets(
      { cms: [{}] },
      'production',
      undefined
    );

    expect(mockFetchDeployments).not.toHaveBeenCalled();
    expect(result).toEqual({ cms: [{}] });
  });

  it('should not contact Infisical when a tenant names no secrets', async () => {
    const result = await resolveTenantSecrets(
      {
        cms: [
          {},
          { tenant: 'acme', env: { URL: 'https://acme.com' } },
          { tenant: 'moon', secretNames: [] }
        ]
      },
      'production',
      undefined
    );

    expect(mockFetchDeployments).not.toHaveBeenCalled();
    expect(result).toEqual({
      cms: [
        {},
        { tenant: 'acme', env: { URL: 'https://acme.com' } },
        { tenant: 'moon' }
      ]
    });
  });

  it('should error the named deployments without credentials, leaving the rest to deploy', async () => {
    const result = await resolveTenantSecrets(
      {
        cms: [
          {},
          { tenant: 'moon', env: { URL: 'https://moon.com' } },
          { tenant: 'acme', secretNames: ['API_KEY'] }
        ]
      },
      'production',
      undefined
    );

    expect(mockFetchDeployments).not.toHaveBeenCalled();
    expect(result['cms'][0]).toEqual({});
    expect(result['cms'][1]).toEqual({
      tenant: 'moon',
      env: { URL: 'https://moon.com' }
    });
    expect(result['cms'][2].error).toContain('Infisical credentials');
    expect(result['cms'][2]).not.toHaveProperty('secretNames');
  });

  it('should error the named deployments only when the read rejects', async () => {
    mockFetchDeployments.mockRejectedValue(new Error('network down'));

    const result = await resolveTenantSecrets(
      { cms: [{}, { tenant: 'acme', secretNames: ['API_KEY'] }] },
      'production',
      infisical
    );

    expect(result['cms'][0]).toEqual({});
    expect(result['cms'][1].error).toBe(
      'Could not read secrets from Infisical: network down'
    );
    expect(core.error).toHaveBeenCalledTimes(1);
  });

  it('should not treat an inherited property name as a read secret', async () => {
    fetched({ cms: [{ tenant: 'acme', secrets: { OTHER: 'other-value' } }] });

    const result = await resolveTenantSecrets(
      { cms: [{ tenant: 'acme', secretNames: ['constructor'] }] },
      'production',
      infisical
    );

    expect(result['cms'][0].error).toContain('constructor');
    expect(result['cms'][0].secrets).toBeUndefined();
  });

  it('should fill in the values of the planned names only', async () => {
    fetched({
      cms: [
        {},
        {
          tenant: 'acme',
          env: { FRESH: 'ignored' },
          secrets: { API_KEY: 'api-key-value', DB_URL: 'db-url-value' }
        }
      ]
    });

    const result = await resolveTenantSecrets(
      {
        cms: [
          {},
          {
            tenant: 'acme',
            env: { URL: 'https://acme.com' },
            secretNames: ['API_KEY']
          }
        ]
      },
      'production',
      infisical
    );

    expect(mockFetchDeployments).toHaveBeenCalledWith(
      { ...infisical, environment: 'production' },
      ['cms']
    );
    // The plan decides env; the fresh read only supplies secret values
    expect(result).toEqual({
      cms: [
        {},
        {
          tenant: 'acme',
          env: { URL: 'https://acme.com' },
          secrets: { API_KEY: 'api-key-value' }
        }
      ]
    });
    expect(result['cms'][1]).not.toHaveProperty('secretNames');
  });

  it('should mask every fetched value before returning', async () => {
    fetched({
      cms: [
        {
          tenant: 'acme',
          secrets: { API_KEY: 'api-key-value', UNPLANNED: 'unplanned-value' }
        }
      ]
    });

    await resolveTenantSecrets(
      { cms: [{ tenant: 'acme', secretNames: ['API_KEY'] }] },
      'production',
      infisical
    );

    expect(mockMaskSecrets).toHaveBeenCalledTimes(1);
    expect(mockMaskSecrets).toHaveBeenCalledWith([
      'api-key-value',
      'unplanned-value'
    ]);
  });

  it('should mark a deployment with a missing secret as errored, without any value', async () => {
    fetched({
      cms: [
        {
          tenant: 'acme',
          secrets: { OTHER: 'other-secret-value' }
        }
      ]
    });

    const result = await resolveTenantSecrets(
      { cms: [{ tenant: 'acme', secretNames: ['API_KEY'] }] },
      'production',
      infisical
    );

    const [entry] = result['cms'];
    expect(entry.error).toContain('API_KEY');
    expect(entry.error).not.toContain('other-secret-value');
    expect(entry.secrets).toBeUndefined();
  });

  it('should mark a tenant absent from the fresh read as errored', async () => {
    fetched({ cms: [{}] });

    const result = await resolveTenantSecrets(
      { cms: [{}, { tenant: 'acme', secretNames: ['API_KEY'] }] },
      'production',
      infisical
    );

    expect(result['cms'][0]).toEqual({});
    expect(result['cms'][1].error).toContain('API_KEY');
    expect(result['cms'][1].secrets).toBeUndefined();
  });

  it('should warn about a secret added since pre-deploy and leave it out', async () => {
    fetched({
      cms: [
        {
          tenant: 'acme',
          secrets: { API_KEY: 'api-key-value', ADDED: 'added-value' }
        }
      ]
    });

    const result = await resolveTenantSecrets(
      { cms: [{ tenant: 'acme', secretNames: ['API_KEY'] }] },
      'production',
      infisical
    );

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('ADDED'));
    expect(core.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('added-value')
    );
    expect(result['cms'][0].secrets).toEqual({ API_KEY: 'api-key-value' });
  });
});
