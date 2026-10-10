import { type DeploymentFolder, planDeployments } from './deployments';

const secret = (
  secretKey: string,
  secretValue: string,
  env = false,
  secretPath?: string
) => ({
  secretKey,
  secretValue,
  ...(secretPath === undefined ? {} : { secretPath }),
  secretMetadata: env ? [{ key: 'env', value: 'true' }] : []
});

const folder = (
  path: string,
  secrets: DeploymentFolder['secrets'] = []
): DeploymentFolder => ({ path, secrets });

describe('planDeployments', () => {
  describe('host', () => {
    it.each([
      ['true', { cms: [{}] }, []],
      ['TRUE', { cms: [{}] }, []],
      [' true ', { cms: [{}] }, []],
      ['false', { cms: [] }, [{ app: 'cms', reason: 'flag-off' }]],
      ['', { cms: [] }, [{ app: 'cms', reason: 'flag-off' }]],
      ['1', { cms: [] }, [{ app: 'cms', reason: 'flag-off' }]],
      ['yes', { cms: [] }, [{ app: 'cms', reason: 'flag-off' }]]
    ])('flag %j', (value, deployments, skipped) => {
      const result = planDeployments(
        [folder('/apps/cms', [secret('DEPLOY_ENABLED', value)])],
        ['cms']
      );
      expect(result).toEqual({ deployments, skipped });
    });

    it('is skipped as no-flag when other secrets exist without the flag', () => {
      const result = planDeployments(
        [folder('/apps/cms', [secret('DATABASE_URL', 'x')])],
        ['cms']
      );
      expect(result).toEqual({
        deployments: { cms: [] },
        skipped: [{ app: 'cms', reason: 'no-flag' }]
      });
    });

    it('is silent for an empty stray folder', () => {
      expect(planDeployments([folder('/apps/cms')], ['cms'])).toEqual({
        deployments: { cms: [] },
        skipped: []
      });
    });

    it('carries no env or secrets', () => {
      const result = planDeployments(
        [
          folder('/apps/cms', [
            secret('DEPLOY_ENABLED', 'true'),
            secret('DATABASE_URL', 'x'),
            secret('LOG_LEVEL', 'info', true)
          ])
        ],
        ['cms']
      );
      expect(result.deployments).toEqual({ cms: [{}] });
    });
  });

  describe('tenant', () => {
    it('is enabled by the flag and carries env and secrets', () => {
      const result = planDeployments(
        [
          folder('/tenants/moon/apps/cms', [
            secret('DEPLOY_ENABLED', 'true'),
            secret('PUBLIC_URL', 'https://moon', true),
            secret('API_KEY', 'k')
          ])
        ],
        ['cms']
      );
      expect(result).toEqual({
        deployments: {
          cms: [
            {
              tenant: 'moon',
              env: { PUBLIC_URL: 'https://moon' },
              secrets: { API_KEY: 'k' }
            }
          ]
        },
        skipped: []
      });
    });

    it('omits env and secrets when none remain', () => {
      const result = planDeployments(
        [folder('/tenants/moon/apps/cms', [secret('DEPLOY_ENABLED', 'true')])],
        ['cms']
      );
      expect(result.deployments).toEqual({ cms: [{ tenant: 'moon' }] });
    });

    it.each([
      [true, 'with'],
      [false, 'without']
    ])('strips the flag %s env metadata', (env) => {
      const result = planDeployments(
        [
          folder('/tenants/moon/apps/cms', [
            secret('DEPLOY_ENABLED', 'true', env),
            secret('A', '1')
          ])
        ],
        ['cms']
      );
      expect(result.deployments).toEqual({
        cms: [{ tenant: 'moon', secrets: { A: '1' } }]
      });
    });

    it('is skipped as flag-off', () => {
      const result = planDeployments(
        [folder('/tenants/moon/apps/cms', [secret('DEPLOY_ENABLED', 'false')])],
        ['cms']
      );
      expect(result).toEqual({
        deployments: { cms: [] },
        skipped: [{ app: 'cms', tenant: 'moon', reason: 'flag-off' }]
      });
    });

    it('is skipped as no-flag when other secrets exist', () => {
      const result = planDeployments(
        [folder('/tenants/moon/apps/cms', [secret('A', '1')])],
        ['cms']
      );
      expect(result.skipped).toEqual([
        { app: 'cms', tenant: 'moon', reason: 'no-flag' }
      ]);
    });

    it('is silent for an empty stray folder', () => {
      expect(
        planDeployments([folder('/tenants/moon/apps/cms')], ['cms'])
      ).toEqual({ deployments: { cms: [] }, skipped: [] });
    });
  });

  describe('flag origin', () => {
    const path = '/tenants/acme/apps/web';

    it('ignores a flag imported from another path', () => {
      const result = planDeployments(
        [
          folder(path, [
            secret('DEPLOY_ENABLED', 'true', false, '/apps/web'),
            secret('A', '1')
          ])
        ],
        ['web']
      );
      expect(result).toEqual({
        deployments: { web: [] },
        skipped: [{ app: 'web', tenant: 'acme', reason: 'no-flag' }]
      });
    });

    it('is silent for an imported flag alone', () => {
      const result = planDeployments(
        [folder(path, [secret('DEPLOY_ENABLED', 'true', false, '/apps/web')])],
        ['web']
      );
      expect(result).toEqual({ deployments: { web: [] }, skipped: [] });
    });

    it.each([path, `${path}/`])('accepts a flag at %s', (secretPath) => {
      const result = planDeployments(
        [folder(path, [secret('DEPLOY_ENABLED', 'true', false, secretPath)])],
        ['web']
      );
      expect(result.deployments).toEqual({ web: [{ tenant: 'acme' }] });
    });

    it('accepts a flag without a secretPath', () => {
      const result = planDeployments(
        [folder(path, [secret('DEPLOY_ENABLED', 'true')])],
        ['web']
      );
      expect(result.deployments).toEqual({ web: [{ tenant: 'acme' }] });
    });

    it('strips an imported flag key from env and secrets', () => {
      const result = planDeployments(
        [
          folder(path, [
            secret('DEPLOY_ENABLED', 'true', false, path),
            secret('DEPLOY_ENABLED', 'true', true, '/apps/web'),
            secret('A', '1')
          ])
        ],
        ['web']
      );
      expect(result.deployments).toEqual({
        web: [{ tenant: 'acme', secrets: { A: '1' } }]
      });
    });
  });

  describe('invalid tenant name', () => {
    it.each(['_default', 'Acme'])('skips %s even with the flag on', (name) => {
      const result = planDeployments(
        [
          folder(`/tenants/${name}/apps/web`, [
            secret('DEPLOY_ENABLED', 'true')
          ])
        ],
        ['web']
      );
      expect(result).toEqual({
        deployments: { web: [] },
        skipped: [{ app: 'web', tenant: name, reason: 'invalid-name' }]
      });
    });

    it('is silent for an empty folder', () => {
      expect(
        planDeployments([folder('/tenants/_default/apps/web')], ['web'])
      ).toEqual({ deployments: { web: [] }, skipped: [] });
    });
  });

  describe('ignored', () => {
    it('ignores apps that are not listed', () => {
      const result = planDeployments(
        [
          folder('/apps/web', [secret('DEPLOY_ENABLED', 'true')]),
          folder('/tenants/moon/apps/web', [secret('DEPLOY_ENABLED', 'true')])
        ],
        ['cms']
      );
      expect(result).toEqual({ deployments: { cms: [] }, skipped: [] });
    });

    it.each([
      '/apps',
      '/tenants',
      '/tenants/t',
      '/tenants/t/apps',
      '/tenants/t/apps/cms/nested',
      '/apps/cms/nested',
      '/other/cms'
    ])('ignores %s', (path) => {
      const result = planDeployments(
        [folder(path, [secret('DEPLOY_ENABLED', 'true')])],
        ['cms']
      );
      expect(result).toEqual({ deployments: { cms: [] }, skipped: [] });
    });
  });

  describe('ordering', () => {
    it('puts the host first and sorts tenants by name', () => {
      const on = [secret('DEPLOY_ENABLED', 'true')];
      const result = planDeployments(
        [
          folder('/tenants/zed/apps/cms', on),
          folder('/tenants/alpha/apps/cms', on),
          folder('/apps/cms', on)
        ],
        ['cms']
      );
      expect(result.deployments).toEqual({
        cms: [{}, { tenant: 'alpha' }, { tenant: 'zed' }]
      });
    });

    it('sorts skipped by app, host before tenants, then tenant name', () => {
      const off = [secret('DEPLOY_ENABLED', 'false')];
      const result = planDeployments(
        [
          folder('/tenants/zed/apps/cms', off),
          folder('/tenants/alpha/apps/web', off),
          folder('/tenants/alpha/apps/cms', off),
          folder('/apps/web', off),
          folder('/apps/cms', off)
        ],
        ['web', 'cms']
      );
      expect(result.skipped).toEqual([
        { app: 'cms', reason: 'flag-off' },
        { app: 'cms', tenant: 'alpha', reason: 'flag-off' },
        { app: 'cms', tenant: 'zed', reason: 'flag-off' },
        { app: 'web', reason: 'flag-off' },
        { app: 'web', tenant: 'alpha', reason: 'flag-off' }
      ]);
    });
  });

  it('gives an app without folders an empty list', () => {
    expect(planDeployments([], ['cms', 'web'])).toEqual({
      deployments: { cms: [], web: [] },
      skipped: []
    });
  });
});
