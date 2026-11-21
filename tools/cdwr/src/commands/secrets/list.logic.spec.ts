import type { InfisicalRunner } from '@codeware/shared/util/infisical-cli';

import { PROJECTS } from './catalog';
import type { CatalogEntry } from './catalog';
import { buildRows, groupByFolder, readProject, scope } from './list.logic';

/** Canned folders and shared secrets per path; records every call */
const fakeRunner = (
  folders: Record<string, string[]>,
  secrets: Record<string, Record<string, string>>
): { run: InfisicalRunner; calls: string[][] } => {
  const calls: string[][] = [];
  const run: InfisicalRunner = (args) => {
    calls.push(args);
    const path =
      args.find((arg) => arg.startsWith('--path='))?.split('=')[1] ?? '';
    if (args[0] === 'export') {
      return JSON.stringify(
        Object.entries(secrets[path] ?? {}).map(([key, value]) => ({
          key,
          value,
          type: 'shared'
        }))
      );
    }
    return JSON.stringify(
      (folders[path] ?? []).map((folderName) => ({ folderName }))
    );
  };
  return { run, calls };
};

describe('scope', () => {
  it('covers every project environment without a filter', () => {
    expect(scope()).toEqual([
      { project: 'codeware', environment: 'production' },
      { project: 'codeware', environment: 'preview' },
      { project: 'agent-host', environment: 'production' }
    ]);
  });

  it('filters by project and by environment', () => {
    expect(scope('agent-host')).toEqual([
      { project: 'agent-host', environment: 'production' }
    ]);
    expect(scope(undefined, 'preview')).toEqual([
      { project: 'codeware', environment: 'preview' }
    ]);
  });

  it('is empty where the project lacks the environment', () => {
    expect(scope('agent-host', 'preview')).toEqual([]);
  });
});

describe('readProject', () => {
  it('passes the project id to the folder listing and the export', () => {
    const { run, calls } = fakeRunner(
      { '/': ['apps'], '/apps': [] },
      { '/': { A: 'x' }, '/apps': { B: 'yy' } }
    );
    const keys = readProject('agent-host', 'production', run);
    expect(keys).toEqual([
      { path: '/', key: 'A', length: 1 },
      { path: '/apps', key: 'B', length: 2 }
    ]);
    const id = `--projectId=${PROJECTS['agent-host'].id}`;
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) expect(args).toContain(id);
    expect(calls.some((args) => args[0] === 'export')).toBe(true);
    expect(calls.some((args) => args[0] !== 'export')).toBe(true);
  });
});

const catalog: CatalogEntry[] = [
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'FLY_TOKEN',
    kind: 'token',
    purpose: 'Deploys',
    rotation: { command: ['fly', 'rotate'] },
    expiry: { source: 'fly', tokenName: 'cms-deploy' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'BUILDER_TOKEN',
    kind: 'token',
    purpose: 'Builds',
    rotation: { manual: 'Generate a new one in the builder' },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'OTHER',
    kind: 'api-key',
    purpose: 'Other',
    rotation: { manual: 'by hand' },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'LOG_LEVEL',
    kind: 'setting',
    purpose: 'Verbosity'
  }
];

const read = (
  keys: Array<{ key: string; length: number | null; path?: string }>
) => [
  {
    project: 'codeware' as const,
    environment: 'production' as const,
    keys: keys.map((k) => ({ path: '/apps/cms', ...k }))
  }
];

const token = (id: string, name: string, extra = {}) => ({
  id,
  name,
  expiresAt: '2027-03-04T10:00:00Z',
  ...extra
});

describe('buildRows', () => {
  const [flyRead] = [read([{ key: 'FLY_TOKEN', length: 64 }])];

  it('reads the expiry from the Fly token', () => {
    const [row] = buildRows(flyRead, [token('1', 'cms-deploy')], catalog);
    expect(row).toMatchObject({
      value: 'set · 64 chars',
      kind: 'token',
      purpose: 'Deploys',
      expiry: '2027-03-04',
      rotate: 'cdwr fly rotate',
      rotateBy: 'command'
    });
  });

  it('ignores a revoked token', () => {
    const [row] = buildRows(
      flyRead,
      [token('1', 'cms-deploy', { revokedAt: '2027-01-01T00:00:00Z' })],
      catalog
    );
    expect(row?.expiry).toBe('unknown (no token named "cms-deploy")');
  });

  it('shows the date an expired token lapsed', () => {
    const [row] = buildRows(
      flyRead,
      [token('1', 'cms-deploy')],
      catalog,
      new Date('2028-01-01T00:00:00Z')
    );
    expect(row?.expiry).toBe('expired 2027-03-04');
  });

  it('says so when the token is ambiguous', () => {
    const [row] = buildRows(
      flyRead,
      [token('1', 'cms-deploy'), token('2', 'cms-deploy')],
      catalog
    );
    expect(row?.expiry).toBe('unknown (ambiguous)');
  });

  it('says so when the Fly read failed', () => {
    const [row] = buildRows(flyRead, { error: 'not logged in' }, catalog);
    expect(row?.expiry).toBe('unknown (fly read failed)');
  });

  it('handles none and unknown expiry with manual rotation', () => {
    const rows = buildRows(
      read([
        { key: 'BUILDER_TOKEN', length: 8 },
        { key: 'OTHER', length: 8 }
      ]),
      [],
      catalog
    );
    expect(
      rows.map(({ key, expiry, rotate }) => [key, expiry, rotate])
    ).toEqual([
      ['BUILDER_TOKEN', 'none', 'Generate a new one in the builder'],
      ['OTHER', 'unknown', 'by hand']
    ]);
  });

  it('leaves expiry and rotation out for a setting', () => {
    const [row] = buildRows(
      read([{ key: 'LOG_LEVEL', length: 4 }]),
      [],
      catalog
    );
    expect(row).toMatchObject({ kind: 'setting', expiry: '-', rotate: '-' });
  });

  it('marks an unknown key', () => {
    const [row] = buildRows(read([{ key: 'MYSTERY', length: 3 }]), [], catalog);
    expect(row).toMatchObject({
      known: false,
      kind: 'not in the catalog',
      purpose: 'not in the catalog',
      expiry: 'unknown',
      rotate: '-'
    });
  });

  it('writes length only: empty, one char, many', () => {
    const rows = buildRows(
      read([
        { key: 'A', length: 0 },
        { key: 'B', length: 1 },
        { key: 'C', length: 2 }
      ]),
      [],
      catalog
    );
    expect(rows.map((row) => row.value)).toEqual([
      'empty',
      'set · 1 char',
      'set · 2 chars'
    ]);
  });

  it('describes a key that only has a personal override', () => {
    const [row] = buildRows(read([{ key: 'A', length: null }]), [], catalog);
    expect(row?.value).toBe('personal override only');
  });

  it('sorts by project, environment, path, key', () => {
    const rows = buildRows(
      [
        {
          project: 'codeware',
          environment: 'preview',
          keys: [{ path: '/b', key: 'Z', length: 1 }]
        },
        {
          project: 'agent-host',
          environment: 'production',
          keys: [{ path: '/', key: 'Z', length: 1 }]
        },
        {
          project: 'codeware',
          environment: 'preview',
          keys: [
            { path: '/a', key: 'B', length: 1 },
            { path: '/a', key: 'A', length: 1 }
          ]
        }
      ],
      [],
      catalog
    );
    expect(
      rows.map(({ project, path, key }) => `${project}${path}:${key}`)
    ).toEqual([
      'codeware/a:A',
      'codeware/a:B',
      'codeware/b:Z',
      'agent-host/:Z'
    ]);
  });

  it('puts production before preview within a project', () => {
    const rows = buildRows(
      [
        {
          project: 'codeware',
          environment: 'preview',
          keys: [{ path: '/a', key: 'A', length: 1 }]
        },
        {
          project: 'codeware',
          environment: 'production',
          keys: [{ path: '/z', key: 'Z', length: 1 }]
        }
      ],
      [],
      catalog
    );
    expect(rows.map((row) => row.environment)).toEqual([
      'production',
      'preview'
    ]);
  });

  it('never carries a value through read and join', () => {
    const { run } = fakeRunner(
      { '/': ['apps'], '/apps': ['cms'], '/apps/cms': [] },
      {
        '/': { TOP: 'SENTINEL-VALUE-123' },
        '/apps/cms': {
          FLY_TOKEN: 'SENTINEL-VALUE-456',
          LOG_LEVEL: 'SENTINEL-VALUE-789'
        }
      }
    );
    const keys = readProject('codeware', 'production', run);
    const rows = buildRows(
      [{ project: 'codeware', environment: 'production', keys }],
      [token('1', 'cms-deploy')],
      catalog
    );
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain('SENTINEL');
    expect(JSON.stringify(keys)).not.toContain('SENTINEL');
  });
});

describe('groupByFolder', () => {
  it('groups rows under one heading per project, environment and path', () => {
    const rows = buildRows(
      [
        {
          project: 'codeware',
          environment: 'production',
          keys: [
            { path: '/a', key: 'X', length: 1 },
            { path: '/a', key: 'Y', length: 1 },
            { path: '/b', key: 'Z', length: 0 }
          ]
        }
      ],
      [],
      []
    );
    expect(
      [...groupByFolder(rows)].map(([heading, folder]) => [
        heading,
        folder.map((row) => row.key)
      ])
    ).toEqual([
      ['codeware · production · /a', ['X', 'Y']],
      ['codeware · production · /b', ['Z']]
    ]);
    expect(rows.every((row) => row.rotateBy === 'none')).toBe(true);
  });
});
