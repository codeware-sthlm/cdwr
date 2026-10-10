import {
  type AppKind,
  type Folder,
  type TenantRow,
  conflictMessage,
  deployArgs,
  flagActionOf,
  folderPath,
  pausedMessage,
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
    expect(reasonSkipped({ ...base, deployment: 'Bad Name' })).toBe(
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

describe('flagActionOf', () => {
  it('creates the flag when absent', () => {
    expect(flagActionOf(undefined)).toBe('create');
  });

  it('keeps a true flag, trimmed and case-insensitive', () => {
    expect(flagActionOf('true')).toBe('enabled');
    expect(flagActionOf(' TRUE ')).toBe('enabled');
  });

  it('treats any other value as a pause', () => {
    expect(flagActionOf('false')).toBe('paused');
    expect(flagActionOf('')).toBe('paused');
  });
});

describe('provisionSteps flags', () => {
  it('shows the flag write, keep and pause', () => {
    expect(
      provisionSteps(
        'demo',
        [],
        [],
        [
          { app: 'cms', action: 'create' },
          { app: 'web', action: 'paused', value: 'false' }
        ]
      )
    ).toEqual([
      'Set DEPLOY_ENABLED=true in /tenants/demo/apps/cms',
      'Keep DEPLOY_ENABLED=false in /tenants/demo/apps/web (paused)'
    ]);
    expect(
      provisionSteps('demo', [], [], [{ app: 'cms', action: 'enabled' }])
    ).toEqual(['Keep DEPLOY_ENABLED in /tenants/demo/apps/cms (already true)']);
  });
});

describe('pausedMessage', () => {
  it('names each paused app and its value', () => {
    const message = pausedMessage('production', 'demo', [
      { app: 'cms', action: 'paused', value: 'false' }
    ]);
    expect(message).toContain("'demo' stays paused in production for cms");
    expect(message).toContain(
      '/tenants/demo/apps/cms has DEPLOY_ENABLED=false'
    );
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
