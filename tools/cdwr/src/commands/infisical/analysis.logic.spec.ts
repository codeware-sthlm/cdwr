import {
  APPS,
  flagStateOf,
  missingCmsKeys,
  missingHeadlessKeys,
  summarize
} from './analysis.logic';

describe('flagStateOf', () => {
  it('is on only for true', () => {
    expect(flagStateOf(' TRUE ')).toBe('on');
  });

  it('is off for any other value', () => {
    expect(flagStateOf('false')).toBe('off');
    expect(flagStateOf('')).toBe('off');
  });

  it('is no flag when absent', () => {
    expect(flagStateOf(undefined)).toBe('no flag');
  });
});

describe('summarize', () => {
  it('names an invalid tenant folder name instead of calling it no flag', () => {
    const result = summarize(
      'production',
      {},
      [{ app: 'cms', tenant: '_default', reason: 'invalid-name' }],
      {}
    );
    expect(result.apps[0]?.tenants).toEqual([
      { tenant: '_default', flag: 'invalid name' }
    ]);
  });

  it('rows every app even without deployments or secrets', () => {
    const result = summarize('production', {}, [], {});
    expect(result).toEqual({
      environment: 'production',
      apps: APPS.map((app) => ({
        app,
        host: app === 'headless' ? null : 'no flag',
        tenants: [],
        secrets: {}
      }))
    });
  });

  it('combines host, tenant flags and secrets per app', () => {
    const result = summarize(
      'preview',
      { cms: [{}, { tenant: 'globex' }, { tenant: 'acme' }], builder: [] },
      [
        { app: 'cms', tenant: 'initech', reason: 'flag-off' },
        { app: 'cms', tenant: 'umbrella', reason: 'no-flag' },
        { app: 'builder', reason: 'flag-off' }
      ],
      { cms: { DATABASE_URL: 'postgres://x' } }
    );
    const missing = ['DATABASE_SCHEMA', 'DATABASE_URL', 'PAYLOAD_SECRET_KEY'];
    expect(result.apps).toEqual([
      {
        app: 'cms',
        host: 'on',
        tenants: [
          { tenant: 'acme', flag: 'on', missing },
          { tenant: 'globex', flag: 'on', missing },
          { tenant: 'initech', flag: 'off' },
          { tenant: 'umbrella', flag: 'no flag' }
        ],
        secrets: { DATABASE_URL: 'postgres://x' }
      },
      { app: 'headless', host: null, tenants: [], secrets: {} },
      { app: 'builder', host: 'off', tenants: [], secrets: {} },
      { app: 'umami', host: 'no flag', tenants: [], secrets: {} }
    ]);
  });
});

describe('missingHeadlessKeys', () => {
  const all = {
    PAYLOAD_URL: 'https://cms.example.com',
    PAYLOAD_API_KEY: 'k',
    SIGNATURE_SECRET: 's'
  };

  it('is empty when every required key is delivered', () => {
    expect(missingHeadlessKeys({ env: all })).toEqual([]);
  });

  it('names what is missing, sorted', () => {
    expect(missingHeadlessKeys({ secrets: { PAYLOAD_API_KEY: 'k' } })).toEqual([
      'PAYLOAD_URL',
      'SIGNATURE_SECRET'
    ]);
  });

  it('counts a key from env or secrets as present', () => {
    expect(
      missingHeadlessKeys({
        env: { PAYLOAD_URL: 'https://x' },
        secrets: { PAYLOAD_API_KEY: 'k', SIGNATURE_SECRET: 's' }
      })
    ).toEqual([]);
  });

  it('never reports a key the deploy sets itself', () => {
    expect(missingHeadlessKeys({})).not.toContain('TENANT_ID');
  });
});

describe('summarize headless', () => {
  it('checks enabled headless tenants only', () => {
    const result = summarize(
      'preview',
      {
        headless: [{ tenant: 'moon', secrets: { PAYLOAD_API_KEY: 'k' } }],
        cms: [{ tenant: 'moon' }]
      },
      [{ app: 'headless', tenant: 'sun', reason: 'flag-off' }],
      {}
    );
    const headless = result.apps.find(({ app }) => app === 'headless');
    expect(headless?.tenants).toEqual([
      {
        tenant: 'moon',
        flag: 'on',
        missing: ['PAYLOAD_URL', 'SIGNATURE_SECRET']
      },
      { tenant: 'sun', flag: 'off' }
    ]);
    expect(result.apps.find(({ app }) => app === 'cms')?.tenants).toEqual([
      {
        tenant: 'moon',
        flag: 'on',
        missing: ['DATABASE_SCHEMA', 'DATABASE_URL', 'PAYLOAD_SECRET_KEY']
      }
    ]);
  });
});

describe('missingCmsKeys', () => {
  const all = {
    DATABASE_URL: 'postgres://x',
    DATABASE_SCHEMA: 'moon',
    PAYLOAD_SECRET_KEY: 's'
  };

  it('is empty when every required key is delivered', () => {
    expect(missingCmsKeys({ env: all })).toEqual([]);
  });

  it('names what is missing, sorted, counting env and secrets as present', () => {
    expect(
      missingCmsKeys({
        env: { DATABASE_SCHEMA: 'moon' },
        secrets: { PAYLOAD_SECRET_KEY: 's' }
      })
    ).toEqual(['DATABASE_URL']);
    expect(missingCmsKeys({})).toEqual([
      'DATABASE_SCHEMA',
      'DATABASE_URL',
      'PAYLOAD_SECRET_KEY'
    ]);
  });

  it('never reports a key the deploy sets itself', () => {
    for (const key of [
      'APP_NAME',
      'DEPLOY_ENV',
      'FLY_URL',
      'PR_NUMBER',
      'TENANT_ID'
    ]) {
      expect(missingCmsKeys({})).not.toContain(key);
    }
  });

  it('does not report optional keys or keys with a default', () => {
    expect(missingCmsKeys({})).not.toContain('SIGNATURE_SECRET');
    expect(missingCmsKeys({})).not.toContain('PAYLOAD_URL');
    expect(missingCmsKeys({})).not.toContain('LOG_LEVEL');
  });
});

describe('summarize cms tenants', () => {
  it('reports an enabled tenant that lacks a key, not a complete or disabled one', () => {
    const result = summarize(
      'production',
      {
        cms: [
          {},
          {
            tenant: 'complete',
            env: { DATABASE_URL: 'postgres://x', DATABASE_SCHEMA: 'complete' },
            secrets: { PAYLOAD_SECRET_KEY: 's' }
          },
          {
            tenant: 'partial',
            secrets: { DATABASE_URL: 'postgres://x', PAYLOAD_SECRET_KEY: 's' }
          }
        ]
      },
      [{ app: 'cms', tenant: 'disabled', reason: 'flag-off' }],
      {}
    );
    expect(result.apps.find(({ app }) => app === 'cms')?.tenants).toEqual([
      { tenant: 'complete', flag: 'on', missing: [] },
      { tenant: 'disabled', flag: 'off' },
      { tenant: 'partial', flag: 'on', missing: ['DATABASE_SCHEMA'] }
    ]);
  });
});
