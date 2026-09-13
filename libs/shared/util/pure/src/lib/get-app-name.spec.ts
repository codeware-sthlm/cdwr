import { describe, expect, it } from 'vitest';

import { getAppName } from './get-app-name';

describe('getAppName', () => {
  it('uses the config name for a production app without a tenant', () => {
    expect(
      getAppName({ environment: 'production', configAppName: 'cdwr-cms' })
    ).toBe('cdwr-cms');
  });

  it('adds the tenant to a production app', () => {
    expect(
      getAppName({
        environment: 'production',
        configAppName: 'cdwr-cms',
        tenantId: 'demo'
      })
    ).toBe('cdwr-cms-demo');
  });

  it('adds the pull request and the tenant to a preview app', () => {
    expect(
      getAppName({
        environment: 'preview',
        configAppName: 'cdwr-cms',
        pullRequest: 12,
        tenantId: 'demo'
      })
    ).toBe('cdwr-cms-pr-12-demo');
  });

  it('adds no suffix for the reserved _default tenant', () => {
    expect(
      getAppName({
        environment: 'preview',
        configAppName: 'cdwr-cms',
        pullRequest: 12,
        tenantId: '_default'
      })
    ).toBe('cdwr-cms-pr-12');
  });

  it('refuses a preview app without a pull request', () => {
    expect(() =>
      getAppName({ environment: 'preview', configAppName: 'cdwr-cms' })
    ).toThrow('Pull request number is required for preview environment');
  });
});
