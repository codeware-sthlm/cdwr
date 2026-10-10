import { describe, expect, it } from 'vitest';

import { addOpinionatedEnv } from './add-opinionated-env';

describe('addOpinionatedEnv', () => {
  it('should add APP_NAME, FLY_URL and PR_NUMBER without tenant', () => {
    const result = addOpinionatedEnv({
      appName: 'my-app',
      prNumber: undefined,
      tenantId: undefined
    });

    expect(result).toEqual({
      APP_NAME: 'my-app',
      FLY_URL: 'https://my-app.fly.dev',
      PR_NUMBER: ''
    });
    expect(result).not.toHaveProperty('TENANT_ID');
  });

  it('should add APP_NAME, FLY_URL, PR_NUMBER and TENANT_ID with tenant', () => {
    const result = addOpinionatedEnv({
      appName: 'my-app',
      prNumber: 123,
      tenantId: 'demo'
    });

    expect(result).toEqual({
      APP_NAME: 'my-app',
      FLY_URL: 'https://my-app.fly.dev',
      PR_NUMBER: '123',
      TENANT_ID: 'demo'
    });
  });

  it('should merge with existing env variables', () => {
    const result = addOpinionatedEnv(
      {
        appName: 'my-app',
        prNumber: 123,
        tenantId: 'demo'
      },
      {
        DATABASE_URL: 'postgres://...',
        API_KEY: 'secret'
      }
    );

    expect(result).toEqual({
      DATABASE_URL: 'postgres://...',
      API_KEY: 'secret',
      APP_NAME: 'my-app',
      FLY_URL: 'https://my-app.fly.dev',
      PR_NUMBER: '123',
      TENANT_ID: 'demo'
    });
  });

  it('should add TENANT_ID for any tenant name', () => {
    const result = addOpinionatedEnv({
      appName: 'cms',
      prNumber: undefined,
      tenantId: 'acme'
    });

    expect(result).toEqual({
      APP_NAME: 'cms',
      FLY_URL: 'https://cms.fly.dev',
      PR_NUMBER: '',
      TENANT_ID: 'acme'
    });
  });

  it('should generate correct FLY_URL for tenant-specific app names', () => {
    const result = addOpinionatedEnv({
      appName: 'my-app-pr-123-demo',
      prNumber: 123,
      tenantId: 'demo'
    });

    expect(result).toEqual({
      APP_NAME: 'my-app-pr-123-demo',
      FLY_URL: 'https://my-app-pr-123-demo.fly.dev',
      PR_NUMBER: '123',
      TENANT_ID: 'demo'
    });
  });
});
