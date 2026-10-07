import { describeLayers } from './describe-layers';

describe('describeLayers', () => {
  const sources = {
    A: 'vault',
    B: 'vault',
    Z_KEY: 'environment',
    DATABASE_URL: 'environment'
  } as const;

  it('names layers and sorted environment keys online', () => {
    expect(
      describeLayers({
        mode: 'online',
        environment: 'development',
        path: '/apps/cms',
        cacheName: 'apps/cms/.env.offline',
        sources
      })
    ).toBe(
      '[SECRETS] Infisical development /apps/cms: 2 from the vault, DATABASE_URL, Z_KEY from the environment'
    );
  });

  it('names the cache offline', () => {
    expect(
      describeLayers({
        mode: 'offline',
        environment: 'development',
        path: '/apps/cms',
        cacheName: 'apps/cms/.env.offline',
        sources: { A: 'vault' }
      })
    ).toBe('[SECRETS] OFFLINE apps/cms/.env.offline: 1 from the cache');
  });

  it('never contains a value', () => {
    const sentinel = 'S3NTINEL-VALUE';
    const line = describeLayers({
      mode: 'online',
      environment: 'development',
      path: '/apps/cms',
      cacheName: 'x',
      sources
    });
    expect(line).not.toContain(sentinel);
  });
});
