import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type FlyAppReading,
  type PlatformReadings,
  SHARED_KEY,
  type TenantRecord,
  appOwner,
  buildRows,
  failed,
  libpqEnv,
  ok,
  oneLine,
  parseSql,
  splitDatabase,
  switchRecords,
  vanishedFilter
} from './platform.logic';

const AT = '2026-11-15T10:00:00.000Z';

describe('libpqEnv', () => {
  it('splits a connection url into the libpq variables', () => {
    expect(
      libpqEnv(
        'postgres://platform_reader:p%40ss@db.internal:5433/cms?sslmode=require'
      )
    ).toEqual({
      PGHOST: 'db.internal',
      PGPORT: '5433',
      PGUSER: 'platform_reader',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'cms',
      PGSSLMODE: 'require'
    });
  });

  it('leaves out what the url does not name, and unwraps an IPv6 host', () => {
    expect(libpqEnv('postgresql://reader@[fdaa::3]/cms')).toEqual({
      PGHOST: 'fdaa::3',
      PGUSER: 'reader',
      PGDATABASE: 'cms'
    });
  });

  it('throws on anything else, without quoting it', () => {
    expect(() => libpqEnv('not a url secret')).toThrow(
      'the database url does not parse'
    );
    expect(() => libpqEnv('mysql://u:secret@h/db')).toThrow(
      /^the database url is not a postgres:\/\/ url$/
    );
  });
});

const acme: TenantRecord = {
  slug: 'acme',
  name: 'Acme',
  deployment: 'acme-dep',
  status: 'active',
  domains: [
    {
      hostname: 'acme.example',
      app: 'cms',
      primary: true,
      certificateStatus: 'ready'
    },
    {
      hostname: 'www.acme.example',
      app: 'headless',
      primary: false,
      certificateStatus: null
    }
  ]
};
const beta: TenantRecord = {
  slug: 'beta',
  name: 'Beta',
  deployment: null,
  status: null,
  domains: []
};

const machine = {
  id: 'm1',
  state: 'started',
  region: 'arn',
  imageRef: { repository: 'cdwr-cms', tag: 'deployment-1' },
  config: {
    env: { GIT_SHA: 'abc1234def', DATABASE_URL: 'postgres://u:pw@h/db' },
    guest: { memory_mb: 512 }
  }
};

const flyApp = (
  name: string,
  over: Partial<FlyAppReading> = {}
): FlyAppReading => ({
  name,
  machines: ok([machine]),
  certs: ok([{ hostname: 'acme.example', clientStatus: 'Ready' }]),
  health: { ok: true, status: 200, ms: 40 },
  ...over
});

const db = {
  sizeBytes: 1000,
  sessions: 3,
  byApplication: { cms: 2, '(none)': 1 }
};

const readings = (over: Partial<PlatformReadings> = {}): PlatformReadings => ({
  at: AT,
  tenants: ok([beta, acme]),
  db: ok(db),
  fly: ok([
    flyApp('cdwr-cms'),
    flyApp('cdwr-cms-acme-dep'),
    flyApp('cdwr-headless-acme-dep', {
      certs: ok([{ hostname: 'www.acme.example', clientStatus: 'Pending' }])
    }),
    flyApp('cdwr-headless-beta')
  ]),
  switches: ok([
    { app: 'cms', environment: 'production', tenant: null, flag: 'on' },
    { app: 'cms', environment: 'production', tenant: 'acme-dep', flag: 'on' },
    { app: 'headless', environment: 'production', tenant: 'beta', flag: 'off' }
  ]),
  ...over
});

const row = (rows: ReturnType<typeof buildRows>['rows'], key: string) => {
  const found = rows.find((r) => r.key === key);
  if (!found) throw new Error(`no row ${key}`);
  return found;
};

describe('appOwner', () => {
  const tenants = [acme, beta];

  it('puts host apps in the shared row', () => {
    expect(appOwner('cdwr-cms', tenants)).toEqual({
      key: SHARED_KEY,
      kind: 'cms'
    });
    expect(appOwner('cdwr-builder', null)).toEqual({
      key: SHARED_KEY,
      kind: 'builder'
    });
  });

  it('maps a tenant app by deployment name or slug', () => {
    expect(appOwner('cdwr-cms-acme-dep', tenants)).toEqual({
      key: 'acme',
      kind: 'cms'
    });
    expect(appOwner('cdwr-headless-beta', tenants)).toEqual({
      key: 'beta',
      kind: 'headless'
    });
  });

  it('puts an app of no known tenant in the shared row', () => {
    expect(appOwner('cdwr-cms-ghost', tenants)).toEqual({
      key: SHARED_KEY,
      kind: 'cms'
    });
  });

  it('leaves a tenant app out when the tenants were not read', () => {
    expect(appOwner('cdwr-cms-acme-dep', null)).toBeNull();
  });
});

describe('buildRows', () => {
  it('builds one row per tenant plus the shared row', () => {
    const { rows, prune } = buildRows(readings());
    expect(rows.map((r) => r.key)).toEqual(['acme', 'beta', SHARED_KEY]);
    expect(prune).toEqual(['acme', 'beta', SHARED_KEY]);
    expect(row(rows, 'acme')).toMatchObject({
      at: AT,
      name: 'Acme',
      deployment: 'acme-dep',
      status: 'active',
      db: {},
      errors: {}
    });
  });

  it('reads machines: state, region, memory, image and sha', () => {
    const { rows } = buildRows(readings());
    const apps = row(rows, 'acme').apps as { app: string }[];
    expect(apps.map((a) => a.app)).toEqual([
      'cdwr-cms-acme-dep',
      'cdwr-headless-acme-dep'
    ]);
    expect(apps[0]).toMatchObject({
      kind: 'cms',
      machines: [
        {
          id: 'm1',
          state: 'started',
          region: 'arn',
          memoryMb: 512,
          image: 'cdwr-cms:deployment-1',
          sha: 'abc1234def'
        }
      ],
      health: { ok: true, status: 200, ms: 40 }
    });
    expect(row(rows, SHARED_KEY).apps).toHaveLength(1);
  });

  it('records a missing or odd GIT_SHA as null', () => {
    const odd = { ...machine, config: { env: { GIT_SHA: 'not a sha!' } } };
    const bare = { id: 'm2', state: 'stopped', region: 'ams' };
    const { rows } = buildRows(
      readings({
        fly: ok([flyApp('cdwr-cms', { machines: ok([odd, bare]) })])
      })
    );
    expect(row(rows, SHARED_KEY).apps).toMatchObject([
      {
        machines: [
          { sha: null, memoryMb: null, image: 'cdwr-cms:deployment-1' },
          { sha: null, memoryMb: null, image: null }
        ]
      }
    ]);
  });

  it('gives each domain its certificate state, unknown when unread, missing when absent', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, 'acme').domains).toEqual([
      {
        hostname: 'acme.example',
        app: 'cms',
        primary: true,
        certificate: 'Ready',
        recordedCertificate: 'ready'
      },
      {
        hostname: 'www.acme.example',
        app: 'headless',
        primary: false,
        certificate: 'Pending',
        recordedCertificate: null
      }
    ]);

    const missing = buildRows(
      readings({ fly: ok([flyApp('cdwr-cms-acme-dep', { certs: ok([]) })]) })
    );
    expect(
      (row(missing.rows, 'acme').domains as { certificate: string }[]).map(
        (d) => d.certificate
      )
    ).toEqual(['missing', 'missing']);
  });

  it('records a failed certificate read as unknown with the reason in errors', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms-acme-dep', {
            certs: failed(new Error('flyctl exploded\nsecond line'))
          })
        ])
      })
    );
    const acmeRow = row(rows, 'acme');
    expect(acmeRow.errors).toEqual({
      certs: 'cdwr-cms-acme-dep: flyctl exploded second line'
    });
    expect(
      (acmeRow.domains as { certificate: string }[]).map((d) => d.certificate)
    ).toEqual(['unknown', 'unknown']);
    expect((acmeRow.apps as { certs: unknown }[])[0]?.certs).toBeNull();
  });

  it('records a failed machine read in errors without hiding the app', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([flyApp('cdwr-cms', { machines: failed('no machines') })])
      })
    );
    const shared = row(rows, SHARED_KEY);
    expect(shared.errors).toEqual({ fly: 'cdwr-cms: no machines' });
    expect(shared.apps).toMatchObject([{ app: 'cdwr-cms', machines: null }]);
  });

  it('keeps the health result of an app that is down', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms', {
            health: { ok: false, status: null, ms: 10_000, error: 'timeout' }
          })
        ])
      })
    );
    expect(row(rows, SHARED_KEY).apps).toMatchObject([
      { health: { ok: false, status: null, ms: 10_000 } }
    ]);
  });

  it('places switches by tenant, host switches in the shared row', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, 'acme').switches).toEqual([
      { app: 'cms', environment: 'production', tenant: 'acme-dep', flag: 'on' }
    ]);
    expect(row(rows, 'beta').switches).toEqual([
      {
        app: 'headless',
        environment: 'production',
        tenant: 'beta',
        flag: 'off'
      }
    ]);
    expect(row(rows, SHARED_KEY).switches).toEqual([
      { app: 'cms', environment: 'production', tenant: null, flag: 'on' }
    ]);
  });

  it('puts the database figures in the shared row only', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, SHARED_KEY).db).toEqual({
      sizeBytes: 1000,
      sessions: 3,
      byApplication: { cms: 2, '(none)': 1 }
    });
    expect(row(rows, 'acme').db).toEqual({});
  });

  it('names a failed whole source in the errors of every row it feeds', () => {
    const { rows } = buildRows(
      readings({
        fly: failed('fly down'),
        switches: failed('no infisical')
      })
    );
    for (const r of rows) {
      expect(r.errors).toEqual({ fly: 'fly down', switches: 'no infisical' });
    }
    expect(row(rows, 'acme').apps).toEqual([]);
  });

  it('with the tenants unread: only the shared row, errors on tenants and db, nothing to prune', () => {
    const { tenants, db: dbReading } = splitDatabase(failed('psql failed'));
    const { rows, prune } = buildRows(readings({ tenants, db: dbReading }));
    expect(rows.map((r) => r.key)).toEqual([SHARED_KEY]);
    expect(rows[0]?.errors).toEqual({
      tenants: 'psql failed',
      db: 'psql failed'
    });
    expect(rows[0]?.apps).toHaveLength(1);
    expect(rows[0]?.switches).toEqual([
      { app: 'cms', environment: 'production', tenant: null, flag: 'on' }
    ]);
    expect(prune).toBeNull();
  });

  it('records a failed database read apart from the tenants when only db fails', () => {
    const { rows } = buildRows(readings({ db: failed('no stats') }));
    expect(row(rows, SHARED_KEY).errors).toEqual({ db: 'no stats' });
    expect(row(rows, SHARED_KEY).db).toEqual({});
  });
});

describe('the vanished-tenant delete rule', () => {
  it('keeps exactly the current tenants and the shared row', () => {
    const { prune } = buildRows(readings());
    expect(vanishedFilter(prune ?? [])).toBe(
      'not.in.("acme","beta","_shared")'
    );
  });

  it('prunes only when the tenants were read', () => {
    expect(buildRows(readings()).prune).not.toBeNull();
    expect(buildRows(readings({ tenants: failed('x') })).prune).toBeNull();
  });

  it('prunes with an empty but successful tenants read, keeping the shared row', () => {
    const { prune } = buildRows(readings({ tenants: ok([]) }));
    expect(prune).toEqual([SHARED_KEY]);
  });

  it('quotes keys', () => {
    expect(vanishedFilter(['a"b', 'c\\d'])).toBe('not.in.("a\\"b","c\\\\d")');
  });
});

describe('switchRecords', () => {
  it('flattens what the deploy ships and skips, without secrets', () => {
    const records = switchRecords(
      'production',
      {
        cms: [{ env: { A: '1' }, secrets: { TOKEN: 'shh' } }],
        headless: [{ tenant: 'acme-dep', secrets: { TOKEN: 'shh' } }]
      },
      [{ app: 'headless', tenant: 'beta', reason: 'flag-off' }]
    );
    expect(records).toContainEqual({
      app: 'cms',
      environment: 'production',
      tenant: null,
      flag: 'on'
    });
    expect(records).toContainEqual({
      app: 'headless',
      environment: 'production',
      tenant: 'acme-dep',
      flag: 'on'
    });
    expect(records).toContainEqual({
      app: 'headless',
      environment: 'production',
      tenant: 'beta',
      flag: 'off'
    });
    expect(JSON.stringify(records)).not.toContain('shh');
  });
});

describe('parseSql', () => {
  it('reads the query output', () => {
    const parsed = parseSql(JSON.stringify({ tenants: [acme], db }) + '\n');
    expect(parsed.tenants[0]?.slug).toBe('acme');
    expect(parsed.db.sessions).toBe(3);
  });

  it('drops fields it does not name', () => {
    const parsed = parseSql(
      JSON.stringify({
        tenants: [{ ...acme, apiKey: 'k-123', salt: 's' }],
        db: { ...db, DATABASE_URL: 'postgres://u:pw@h/db' }
      })
    );
    expect(JSON.stringify(parsed)).not.toMatch(/k-123|apiKey|salt|postgres/);
  });

  it('throws without echoing the output', () => {
    expect(() => parseSql('postgres://u:pw@h/db not json')).toThrow(
      'psql did not print the expected JSON'
    );
    expect(() => parseSql('{"tenants":[]}')).toThrow(/expected JSON/);
  });
});

describe('oneLine', () => {
  it('makes one short line without urls', () => {
    const line = oneLine(
      new Error('connect to postgres://u:pw@db.example:5432/x failed\n  retry')
    );
    expect(line).toBe('connect to [url] failed retry');
    expect(oneLine('x'.repeat(500))).toHaveLength(200);
    expect(oneLine('')).toBe('unknown error');
  });
});

describe('platform.sql', () => {
  const sql = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'platform.sql'),
    'utf8'
  );
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('is one read-only SELECT', () => {
    expect(statements.trim().startsWith('SELECT')).toBe(true);
    expect(statements).not.toMatch(
      /\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i
    );
    expect(statements.trim().split(';').filter(Boolean)).toHaveLength(1);
  });

  it('never reads a credential column', () => {
    expect(statements).not.toMatch(/api_?key|salt|hash|token|secret|password/i);
  });
});

describe('what leaves the machine', () => {
  const planted = {
    keys: [
      'DATABASE_URL',
      'PAYLOAD_API_KEY',
      'apiKey',
      'api_key',
      'enableAPIKey',
      'secrets',
      'INFISICAL_CLIENT_SECRET'
    ],
    values: [
      'postgres://user:pw@db.internal:5432/cms',
      'sk_live_abcdef0123456789',
      'tok_9f8e7d6c5b4a',
      'hunter2-secret'
    ]
  };

  it('keeps every secret-shaped key and value out of the rows', () => {
    const stuffed = {
      ...machine,
      config: {
        env: {
          GIT_SHA: 'abc1234def',
          DATABASE_URL: planted.values[0] as string,
          PAYLOAD_API_KEY: planted.values[1] as string,
          apiKey: planted.values[2] as string
        },
        guest: { memory_mb: 256 },
        secrets: { x: planted.values[3] }
      },
      apiKey: planted.values[1],
      token: planted.values[2]
    };
    const stuffedTenant = {
      ...acme,
      apiKey: planted.values[2],
      salt: planted.values[3],
      domains: [{ ...(acme.domains[0] as object), token: planted.values[2] }]
    } as unknown as TenantRecord;
    const { rows } = buildRows(
      readings({
        tenants: ok([stuffedTenant, beta]),
        db: ok({
          ...db,
          DATABASE_URL: planted.values[0]
        } as unknown as typeof db),
        fly: ok([
          flyApp('cdwr-cms-acme-dep', {
            machines: ok([stuffed]),
            certs: failed(
              new Error(`cert read at ${planted.values[0] as string} failed`)
            ),
            health: {
              ok: false,
              status: null,
              ms: 1,
              error: planted.values[0]
            }
          })
        ]),
        switches: ok([
          {
            app: 'cms',
            environment: 'production',
            tenant: 'acme-dep',
            flag: 'on',
            value: planted.values[3],
            secrets: { PAYLOAD_API_KEY: planted.values[1] }
          } as never
        ])
      })
    );
    const text = JSON.stringify(rows);
    for (const key of planted.keys) expect(text).not.toContain(key);
    for (const value of planted.values) expect(text).not.toContain(value);
    // A wrongly spread source would also bring the extra named fields
    expect(text).not.toContain('"token"');
    expect(text).not.toContain('"salt"');
    expect(text).not.toContain('"value"');
  });
});
