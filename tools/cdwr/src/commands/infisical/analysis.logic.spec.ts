import { APPS, summarize } from './analysis.logic';

describe('summarize', () => {
  it('rows every app even without tenants or secrets', () => {
    const result = summarize('production', {}, {});
    expect(result).toEqual({
      environment: 'production',
      apps: APPS.map((app) => ({ app, tenants: [], secrets: {} }))
    });
  });

  it('combines tenants and secrets per app', () => {
    const result = summarize(
      'preview',
      { cms: [{ tenant: 'acme' }, { tenant: 'globex' }], web: [] },
      { cms: { DATABASE_URL: 'postgres://x' } }
    );
    expect(result).toEqual({
      environment: 'preview',
      apps: [
        {
          app: 'cms',
          tenants: ['acme', 'globex'],
          secrets: { DATABASE_URL: 'postgres://x' }
        },
        { app: 'web', tenants: [], secrets: {} }
      ]
    });
  });
});
