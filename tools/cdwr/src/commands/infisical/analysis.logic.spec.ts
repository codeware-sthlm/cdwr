import { APPS, flagStateOf, summarize } from './analysis.logic';

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
        host: 'no flag',
        tenants: [],
        secrets: {}
      }))
    });
  });

  it('combines host, tenant flags and secrets per app', () => {
    const result = summarize(
      'preview',
      { cms: [{}, { tenant: 'globex' }, { tenant: 'acme' }], web: [] },
      [
        { app: 'cms', tenant: 'initech', reason: 'flag-off' },
        { app: 'cms', tenant: 'umbrella', reason: 'no-flag' },
        { app: 'web', reason: 'flag-off' }
      ],
      { cms: { DATABASE_URL: 'postgres://x' } }
    );
    expect(result.apps).toEqual([
      {
        app: 'cms',
        host: 'on',
        tenants: [
          { tenant: 'acme', flag: 'on' },
          { tenant: 'globex', flag: 'on' },
          { tenant: 'initech', flag: 'off' },
          { tenant: 'umbrella', flag: 'no flag' }
        ],
        secrets: { DATABASE_URL: 'postgres://x' }
      },
      { app: 'web', host: 'off', tenants: [], secrets: {} },
      { app: 'builder', host: 'no flag', tenants: [], secrets: {} }
    ]);
  });
});
