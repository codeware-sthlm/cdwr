import {
  type AppKind,
  FLIP_STEP,
  type Folder,
  type TenantRow,
  conflictMessage,
  deployArgs,
  flagActionOf,
  flipsStatus,
  folderPath,
  normalizeDomain,
  pausedMessage,
  pickShare,
  planFlyAppsToDeploy,
  planFolders,
  provisionSteps,
  reasonSkipped,
  statsDomain,
  statsStep,
  statsWrites,
  tenantRowSchema,
  workspaceChoices
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
    status: 'active',
    deployment: 'acme',
    apiKey: 'key',
    statsWebsiteId: null,
    statsShareId: null,
    domains: []
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

  it('plans each parent folder once, down to the app', async () => {
    const namesIn = vi.fn(async () => []);
    const folders = await planFolders('demo', ['cms'], namesIn);
    expect(folders.map(folderPath)).toEqual([
      '/tenants',
      '/tenants/demo',
      '/tenants/demo/apps',
      '/tenants/demo/apps/cms'
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
      provisionSteps('demo', [], [], [{ app: 'cms', action: 'create' }])
    ).toEqual(['Set DEPLOY_ENABLED=true in /tenants/demo/apps/cms']);
    expect(
      provisionSteps(
        'demo',
        [],
        [],
        [{ app: 'cms', action: 'paused', value: 'false' }]
      )
    ).toEqual(['Keep DEPLOY_ENABLED=false in /tenants/demo/apps/cms (paused)']);
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
  const apps = [{ app: 'cms' as AppKind, flyApp: 'cdwr-cms-demo' }];

  it('includes apps that do not exist yet', () => {
    expect(planFlyAppsToDeploy(apps, [], [])).toEqual([
      { app: 'cms', flyApp: 'cdwr-cms-demo', exists: false }
    ]);
  });

  it('excludes an existing app whose key was not just written', () => {
    expect(planFlyAppsToDeploy(apps, ['cdwr-cms-demo'], [])).toEqual([]);
  });

  it('keeps an existing app whose key was just written', () => {
    expect(planFlyAppsToDeploy(apps, ['cdwr-cms-demo'], ['cms'])).toEqual([
      { app: 'cms', flyApp: 'cdwr-cms-demo', exists: true }
    ]);
  });

  it('treats every app as new when the Fly list could not be read', () => {
    expect(planFlyAppsToDeploy(apps, null, [])).toEqual([
      { app: 'cms', flyApp: 'cdwr-cms-demo', exists: false }
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
    expect(deployArgs('preview', 'demo', 'cms', 12, 'feature/x')).toEqual([
      'workflow',
      'run',
      'fly-deployment.yml',
      '--ref',
      'feature/x',
      '-f',
      'app=cms',
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
    const keys = [{ app: 'cms' as AppKind, action: 'create' as const }];
    expect(provisionSteps('demo', folders, keys)).toEqual([
      'Create folder /tenants',
      'Set PAYLOAD_API_KEY in /tenants/demo/apps/cms'
    ]);
    expect(
      provisionSteps('demo', [], [{ app: 'cms', action: 'matches' }])
    ).toEqual([
      'Keep PAYLOAD_API_KEY in /tenants/demo/apps/cms (already matches)'
    ]);
  });
});

describe('conflictMessage', () => {
  it('names every conflicting app', () => {
    expect(conflictMessage('demo', ['cms'])).toBe(
      [
        'These folders already hold a different PAYLOAD_API_KEY:',
        '  /tenants/demo/apps/cms',
        '',
        'A running app may authenticate with it, so nothing was written.',
        "If this workspace's key is the one to keep, use `cdwr tenant rotate-key`."
      ].join('\n')
    );
  });
});

describe('normalizeDomain', () => {
  it.each([
    ['Acme.SE', 'acme.se'],
    ['https://www.acme.se/path?x=1', 'www.acme.se'],
    ['acme.se.', 'acme.se'],
    [' http://acme.se/ ', 'acme.se']
  ])('turns %s into %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe('statsDomain', () => {
  const row: TenantRow = {
    id: 1,
    name: 'Acme',
    slug: 'acme',
    status: 'active',
    deployment: 'acme',
    apiKey: 'key',
    statsWebsiteId: null,
    statsShareId: null,
    domains: []
  };

  it('prefers the primary domain of the cms app', () => {
    expect(
      statsDomain(
        {
          ...row,
          domains: [
            { hostname: 'other.se', app: 'cdwr-cms-acme', isPrimary: false },
            { hostname: 'Acme.SE', app: 'cdwr-cms-acme', isPrimary: true }
          ]
        },
        'cdwr-cms-acme'
      )
    ).toBe('acme.se');
  });

  it('ignores a primary domain of another app', () => {
    expect(
      statsDomain(
        {
          ...row,
          domains: [
            { hostname: 'web.acme.se', app: 'cdwr-web-acme', isPrimary: true }
          ]
        },
        'cdwr-cms-acme'
      )
    ).toBe('cdwr-cms-acme.fly.dev');
  });

  it('falls back to the Fly hostname', () => {
    expect(statsDomain(row, 'cdwr-cms-acme')).toBe('cdwr-cms-acme.fly.dev');
  });
});

describe('statsStep', () => {
  it.each([
    [
      { action: 'create', name: 'Acme', domain: 'acme.se' } as const,
      'Create statistics website acme.se in Umami with a share link'
    ],
    [
      {
        action: 'adopt',
        id: 'w1',
        domain: 'acme.se',
        shareId: null
      } as const,
      'Adopt statistics website acme.se (w1) with a share link'
    ],
    [
      {
        action: 'adopt',
        id: 'w1',
        domain: 'acme.se',
        shareId: 'abc'
      } as const,
      'Adopt statistics website acme.se (w1) and its share link'
    ],
    [
      { action: 'keep', id: 'w1', shareId: 'abc' } as const,
      'Keep statistics website w1 and its share link'
    ],
    [
      { action: 'keep', id: 'w1', shareId: null } as const,
      'Keep statistics website w1; add a share link'
    ],
    [
      { action: 'skip', reason: 'preview' } as const,
      'Statistics skipped: preview'
    ],
    [
      { action: 'skip', reason: 'unconfigured' } as const,
      'Statistics skipped: Umami not configured'
    ],
    [
      { action: 'unknown', id: 'w1' } as const,
      'Statistics website w1 is unknown to Umami; left as it is'
    ]
  ])('describes %j', (plan, line) => {
    expect(statsStep(plan)).toBe(line);
  });

  it('is appended after the flags by provisionSteps', () => {
    const steps = provisionSteps('acme', [], [], [], {
      action: 'keep',
      id: 'w1',
      shareId: 'abc'
    });
    expect(steps).toEqual(['Keep statistics website w1 and its share link']);
  });
});

describe('tenantRowSchema', () => {
  const row = {
    id: 1,
    name: 'Acme',
    slug: 'acme',
    status: 'active',
    deployment: 'acme',
    apiKey: 'key',
    statsWebsiteId: null,
    statsShareId: null,
    domains: []
  };

  it('reads a row without a status as active', () => {
    expect(tenantRowSchema.parse(row).status).toBe('active');
  });

  it('keeps a pending status', () => {
    expect(tenantRowSchema.parse({ ...row, status: 'pending' }).status).toBe(
      'pending'
    );
  });

  it('refuses an unknown status', () => {
    expect(() => tenantRowSchema.parse({ ...row, status: 'gone' })).toThrow();
  });
});

describe('workspaceChoices', () => {
  const row = (
    slug: string,
    status: TenantRow['status'],
    over: Partial<TenantRow> = {}
  ): TenantRow => ({
    id: 1,
    name: slug.toUpperCase(),
    slug,
    status,
    deployment: `cdwr-${slug}`,
    apiKey: 'key',
    statsWebsiteId: null,
    statsShareId: null,
    domains: [],
    ...over
  });

  it('puts new signups first, each hinted, and keeps the rest in order', () => {
    const choices = workspaceChoices([
      row('a', 'active'),
      row('b', 'pending'),
      row('c', 'active'),
      row('d', 'pending')
    ]);

    expect(choices).toEqual([
      { value: 'cdwr-b', hint: 'B (b) · new signup' },
      { value: 'cdwr-d', hint: 'D (d) · new signup' },
      { value: 'cdwr-a', hint: 'A (a)' },
      { value: 'cdwr-c', hint: 'C (c)' }
    ]);
  });

  it('leaves out workspaces that cannot be provisioned', () => {
    expect(
      workspaceChoices([
        row('a', 'pending', { apiKey: null }),
        row('b', 'active', { deployment: null }),
        row('c', 'active')
      ])
    ).toEqual([{ value: 'cdwr-c', hint: 'C (c)' }]);
  });
});

describe('flipsStatus', () => {
  it.each([
    ['pending', ['cms'], true, true],
    ['pending', ['cms'], false, false],
    ['active', ['cms'], true, false]
  ] as const)('%s with %j, wait %s -> %s', (status, apps, wait, expected) => {
    expect(flipsStatus({ status }, apps, wait)).toBe(expected);
  });
});

describe('flipsStatus with a paused cms', () => {
  it('does not flip', () => {
    expect(
      flipsStatus({ status: 'pending' }, ['cms'], true, [
        { app: 'cms', action: 'paused', value: 'false' }
      ])
    ).toBe(false);
  });
});

describe('provisionSteps flip', () => {
  it('lists the flip only when asked', () => {
    expect(provisionSteps('acme', [], [], [], undefined, true)).toContain(
      FLIP_STEP
    );
    expect(provisionSteps('acme', [], [], [], undefined, false)).not.toContain(
      FLIP_STEP
    );
  });
});

describe('pickShare', () => {
  it('returns the recorded slug when Umami lists it', () => {
    expect(pickShare(['a', 'b'], 'b')).toBe('b');
  });

  it('answers null when Umami no longer lists the recorded slug', () => {
    expect(pickShare(['a', 'b'], 'x')).toBeNull();
    expect(pickShare([], 'x')).toBeNull();
  });

  it('takes the first listed slug when none is recorded', () => {
    expect(pickShare(['a', 'b'], null)).toBe('a');
  });

  it('answers null for an empty list and no recorded slug', () => {
    expect(pickShare([], null)).toBeNull();
  });
});

describe('statsWrites', () => {
  const keep = (shareId: string | null) =>
    ({ action: 'keep', id: 'w', shareId }) as const;

  it.each([
    [{ action: 'create', name: 'n', domain: 'd' }, null, 1],
    [{ action: 'create', name: 'n', domain: 'd' }, 's', 1],
    [{ action: 'adopt', id: 'w', domain: 'd', shareId: 's' }, 's', 1],
    [{ action: 'adopt', id: 'w', domain: 'd', shareId: null }, null, 1],
    [keep(null), null, 1],
    [keep(null), 's', 1],
    [keep('s'), null, 1],
    [keep('s'), 'x', 1],
    [keep('s'), 's', 0],
    [{ action: 'unknown', id: 'w' }, 's', 0],
    [{ action: 'skip', reason: 'preview' }, null, 0]
  ] as const)('%j with recorded %j writes %i', (plan, recorded, writes) => {
    expect(statsWrites(plan, recorded)).toBe(writes);
  });
});

describe('provisionSteps team', () => {
  it('lists the team steps before the website step', () => {
    expect(
      provisionSteps(
        'acme',
        [],
        [],
        [],
        { action: 'unknown', id: 'w1' },
        false,
        ['create-team', 'add-reader']
      )
    ).toEqual([
      'Statistics: create team',
      'Statistics: add reader',
      'Statistics website w1 is unknown to Umami; left as it is'
    ]);
  });
});
