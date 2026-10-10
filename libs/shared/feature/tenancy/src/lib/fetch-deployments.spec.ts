import * as core from '@actions/core';
import * as infisicalModule from '@codeware/shared/feature/infisical';

import { fetchDeployments } from './fetch-deployments';
import type { InfisicalConfig } from './infisical-config';

vi.mock('@actions/core');
vi.mock('@codeware/shared/feature/infisical');

describe('fetchDeployments', () => {
  let mockWithInfisical: ReturnType<typeof vi.fn>;

  const config: InfisicalConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    environment: 'production',
    projectId: 'test-project-id',
    site: 'eu'
  };

  const on = { secretKey: 'DEPLOY_ENABLED', secretValue: 'true' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWithInfisical = vi.fn().mockResolvedValue([]);
    vi.mocked(infisicalModule.withInfisical).mockImplementation(
      mockWithInfisical as never
    );
  });

  it('skips Infisical when no apps are provided', async () => {
    const result = await fetchDeployments(config, []);

    expect(result).toEqual({ deployments: {}, skipped: [] });
    expect(core.info).toHaveBeenCalledWith(
      '[fetch-deployments] No apps provided, skipping fetch'
    );
    expect(mockWithInfisical).not.toHaveBeenCalled();
  });

  it('reads /apps and /tenants recursively grouped by folder', async () => {
    await fetchDeployments(config, ['cms']);

    expect(mockWithInfisical).toHaveBeenCalledTimes(2);
    for (const path of ['/apps', '/tenants']) {
      expect(mockWithInfisical).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
          site: 'eu',
          filter: { path, recurse: true },
          groupByFolder: true
        })
      );
    }
  });

  it('plans deployments from both paths and logs them', async () => {
    mockWithInfisical.mockImplementation(async ({ filter }) =>
      filter.path === '/apps'
        ? [
            { path: '/apps/cms', secrets: [{ ...on, secretMetadata: [] }] },
            {
              path: '/apps/web',
              secrets: [
                {
                  secretKey: 'A',
                  secretValue: '1',
                  secretMetadata: []
                }
              ]
            }
          ]
        : [
            {
              path: '/tenants/moon/apps/cms',
              secrets: [
                { ...on, secretMetadata: [] },
                { secretKey: 'K', secretValue: 'v', secretMetadata: [] }
              ]
            }
          ]
    );

    const result = await fetchDeployments(config, ['cms', 'web']);

    expect(result).toEqual({
      deployments: {
        cms: [{}, { tenant: 'moon', secrets: { K: 'v' } }],
        web: []
      },
      skipped: [{ app: 'web', reason: 'no-flag' }]
    });
    expect(core.info).toHaveBeenCalledWith(
      "[fetch-deployments] Enabled: app 'cms' host"
    );
    expect(core.info).toHaveBeenCalledWith(
      "[fetch-deployments] Enabled: app 'cms' tenant 'moon' (0 env, 1 secrets)"
    );
    expect(core.info).toHaveBeenCalledWith(
      "[fetch-deployments] Skipped: app 'web' host in 'production': no DEPLOY_ENABLED secret"
    );
    expect(core.info).toHaveBeenCalledWith(
      '[fetch-deployments] Total: 2 deployment(s) enabled, 1 skipped'
    );
  });

  it('logs and rethrows errors', async () => {
    const error = new Error('boom');
    mockWithInfisical.mockRejectedValue(error);

    await expect(fetchDeployments(config, ['cms'])).rejects.toBe(error);
    expect(core.error).toHaveBeenCalledWith('[fetch-deployments] Error: boom');
  });
});
