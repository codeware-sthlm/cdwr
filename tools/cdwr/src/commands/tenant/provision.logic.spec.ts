import {
  type AppKind,
  type Folder,
  type TenantRow,
  conflictMessage,
  deployArgs,
  deployRuleGaps,
  folderPath,
  metadataOf,
  planFlyAppsToDeploy,
  planFolders,
  provisionSteps,
  reasonSkipped
} from './provision.logic';

describe('folderPath', () => {
  it('joins a parent and a name', () => {
    expect(folderPath({ parent: '/tenants', name: 'demo' })).toBe(
      '/tenants/demo'
    );
  });

  it('does not double the leading slash at the root', () => {
    expect(folderPath({ parent: '/', name: 'tenants' })).toBe('/tenants');
  });
});

describe('metadataOf', () => {
  it('passes an array through', () => {
    const value = [{ key: 'apps', value: '*' }];
    expect(metadataOf(value)).toBe(value);
  });

  it('wraps a single object', () => {
    const value = { key: 'apps', value: '*' };
    expect(metadataOf(value)).toEqual([value]);
  });

  it('is empty for nothing', () => {
    expect(metadataOf(undefined)).toEqual([]);
    expect(metadataOf(null)).toEqual([]);
  });
});

describe('reasonSkipped', () => {
  const base: TenantRow = {
    id: 1,
    name: 'Acme',
    slug: 'acme',
    deployment: 'acme',
    apiKey: 'key'
  };

  it('is null when a row is ready', () => {
    expect(reasonSkipped(base)).toBeNull();
  });

  it('flags a missing deployment name', () => {
    expect(reasonSkipped({ ...base, deployment: null })).toBe(
      'no deployment name'
    );
  });

  it('flags a missing api key', () => {
    expect(reasonSkipped({ ...base, apiKey: null })).toBe('no API key');
  });

  it('flags an invalid deployment name', () => {
    expect(reasonSkipped({ ...base, deployment: '_default' })).toBe(
      'invalid deployment name'
    );
  });
});

describe('planFolders', () => {
  it('plans the whole chain when nothing exists', async () => {
    const namesIn = vi.fn(async () => []);
    const folders = await planFolders('demo', ['cms'], namesIn);
    expect(folders.map(folderPath)).toEqual([
      '/tenants',
      '/tenants/demo',
      '/tenants/demo/apps',
      '/tenants/demo/apps/cms'
    ]);
  });

  it('skips folders that already exist', async () => {
    const namesIn = vi.fn(async (parent: string) =>
      parent === '/' ? ['tenants'] : []
    );
    const folders = await planFolders('demo', ['cms'], namesIn);
    expect(folders.map(folderPath)).toEqual([
      '/tenants/demo',
      '/tenants/demo/apps',
      '/tenants/demo/apps/cms'
    ]);
  });

  it('never looks up a folder below one about to be created', async () => {
    const namesIn = vi.fn(async () => []);
    await planFolders('demo', ['cms'], namesIn);
    expect(namesIn).not.toHaveBeenCalledWith('/tenants/demo/apps');
  });

  it('does not repeat a folder shared by two apps', async () => {
    const namesIn = vi.fn(async () => []);
    const folders = await planFolders('demo', ['cms', 'web'], namesIn);
    expect(folders.map(folderPath)).toEqual([
      '/tenants',
      '/tenants/demo',
      '/tenants/demo/apps',
      '/tenants/demo/apps/cms',
      '/tenants/demo/apps/web'
    ]);
  });

  it('plans nothing when everything already exists', async () => {
    const namesIn = vi.fn(
      async (parent: string) =>
        ({
          '/': ['tenants'],
          '/tenants': ['demo'],
          '/tenants/demo': ['apps'],
          '/tenants/demo/apps': ['cms']
        })[parent] ?? []
    );
    expect(await planFolders('demo', ['cms'], namesIn)).toEqual([]);
  });
});

describe('deployRuleGaps', () => {
  it('reports every rule missing when it could not be read', () => {
    expect(deployRuleGaps('production', 'demo', ['cms'], null)).toEqual([
      "DEPLOY_RULES in production could not be read - check that it deploys 'demo'."
    ]);
  });

  it('is empty when the wildcard allows everything', () => {
    expect(
      deployRuleGaps('production', 'demo', ['cms'], { apps: '*', tenants: '*' })
    ).toEqual([]);
  });

  it('names the tenant gap', () => {
    expect(
      deployRuleGaps('production', 'demo', ['cms'], {
        apps: '*',
        tenants: 'other'
      })
    ).toEqual([
      "Add 'demo' to the tenants rule of DEPLOY_RULES in production (now: other)."
    ]);
  });

  it('names the excluded apps', () => {
    expect(
      deployRuleGaps('production', 'demo', ['cms', 'web'], {
        apps: 'cms',
        tenants: '*'
      })
    ).toEqual([
      'Add web to the apps rule of DEPLOY_RULES in production (now: cms).'
    ]);
  });
});

describe('planFlyAppsToDeploy', () => {
  const apps = [
    { app: 'cms' as AppKind, flyApp: 'cdwr-cms-demo' },
    { app: 'web' as AppKind, flyApp: 'cdwr-web-demo' }
  ];

  it('includes apps that do not exist yet', () => {
    expect(planFlyAppsToDeploy(apps, [], [])).toEqual([
      { app: 'cms', flyApp: 'cdwr-cms-demo', exists: false },
      { app: 'web', flyApp: 'cdwr-web-demo', exists: false }
    ]);
  });

  it('excludes an existing app whose key was not just written', () => {
    expect(planFlyAppsToDeploy(apps, ['cdwr-cms-demo'], [])).toEqual([
      { app: 'web', flyApp: 'cdwr-web-demo', exists: false }
    ]);
  });

  it('keeps an existing app whose key was just written', () => {
    expect(
      planFlyAppsToDeploy(apps, ['cdwr-cms-demo', 'cdwr-web-demo'], ['cms'])
    ).toEqual([{ app: 'cms', flyApp: 'cdwr-cms-demo', exists: true }]);
  });

  it('treats every app as new when the Fly list could not be read', () => {
    expect(planFlyAppsToDeploy(apps, null, [])).toEqual([
      { app: 'cms', flyApp: 'cdwr-cms-demo', exists: false },
      { app: 'web', flyApp: 'cdwr-web-demo', exists: false }
    ]);
  });
});

describe('deployArgs', () => {
  it('builds a production run with no pull request', () => {
    expect(
      deployArgs('production', 'demo', 'cms', undefined, undefined)
    ).toEqual([
      'workflow',
      'run',
      'fly-deployment.yml',
      '-f',
      'app=cms',
      '-f',
      'tenant=demo',
      '-f',
      'environment=production'
    ]);
  });

  it('adds --ref and pr-number for a preview run', () => {
    expect(deployArgs('preview', 'demo', 'web', 12, 'feature/x')).toEqual([
      'workflow',
      'run',
      'fly-deployment.yml',
      '--ref',
      'feature/x',
      '-f',
      'app=web',
      '-f',
      'tenant=demo',
      '-f',
      'environment=preview',
      '-f',
      'pr-number=12'
    ]);
  });
});

describe('provisionSteps', () => {
  it('describes folders then keys', () => {
    const folders: Folder[] = [{ parent: '/', name: 'tenants' }];
    const keys = [
      { app: 'cms' as AppKind, action: 'create' as const },
      { app: 'web' as AppKind, action: 'matches' as const }
    ];
    expect(provisionSteps('demo', folders, keys)).toEqual([
      'Create folder /tenants',
      'Set PAYLOAD_API_KEY in /tenants/demo/apps/cms',
      'Keep PAYLOAD_API_KEY in /tenants/demo/apps/web (already matches)'
    ]);
  });
});

describe('conflictMessage', () => {
  it('names every conflicting app', () => {
    expect(conflictMessage('demo', ['cms', 'web'])).toBe(
      [
        'These folders already hold a different PAYLOAD_API_KEY:',
        '  /tenants/demo/apps/cms',
        '  /tenants/demo/apps/web',
        '',
        'A running app may authenticate with it, so nothing was written.',
        "If this workspace's key is the one to keep, use `cdwr tenant rotate-key`."
      ].join('\n')
    );
  });
});
