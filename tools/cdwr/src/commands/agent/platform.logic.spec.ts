import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type BackupRead,
  type FlyAppReading,
  type MachineInput,
  type PlatformReadings,
  type ReleaseRead,
  SHARED_KEY,
  type TenantRecord,
  appOwner,
  behindFlag,
  buildRows,
  dayStart,
  daysBefore,
  deployConclusion,
  failed,
  healthChecksOf,
  healthPath,
  libpqEnv,
  ok,
  oneLine,
  parseSql,
  plainText,
  projectOf,
  releaseShas,
  releaseTag,
  sentrySignal,
  splitDatabase,
  stockholmDay,
  switchRecords,
  vanishedFilter,
  visitorsSignal
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
  statsWebsiteId: 'site-acme',
  domains: [
    {
      hostname: 'acme.example',
      app: 'cdwr-cms-acme-dep',
      primary: true,
      certificateStatus: 'ready'
    },
    {
      hostname: 'www.acme.example',
      app: 'cdwr-headless-acme-dep',
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
  statsWebsiteId: null,
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

const deploy = {
  runId: 42,
  sha: 'abc1234def',
  conclusion: 'success',
  url: 'https://github.com/codeware-sthlm/cdwr/actions/runs/42',
  at: '2026-11-15T09:00:00Z'
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
  sentry: ok({
    org: 'cdwr',
    day: { acme: 3 },
    week: { acme: 10, beta: 1 },
    tops: {
      acme: ok({
        shortId: 'CDWR-1',
        level: 'error',
        count: 3,
        title: 'Boom'
      })
    }
  }),
  visitors: {
    acme: ok({ today: 5, days: [{ date: '2026-11-14', visitors: 9 }] })
  },
  deploy: ok(deploy),
  releases: {
    fetchError: null,
    projects: Object.fromEntries(
      ['cms', 'headless'].map((project) => [
        project,
        ok({
          latest: `${project}-1.1.0`,
          machines: {
            abc1234def: ok({ version: `${project}-1.1.0`, current: true })
          }
        })
      ])
    )
  },
  backup: null,
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

describe('health check paths', () => {
  const toml = (app: string, check: string) =>
    `app = '${app}'\n[http_service]\n  internal_port = 3000\n${check}`;
  const get = (path: string) =>
    `[[http_service.checks]]\n  method = 'GET'\n  path = '${path}'\n`;
  const checks = healthChecksOf({
    umami: toml('cdwr-umami', get('/api/heartbeat')),
    cms: toml('cdwr-cms', get('/api/health')),
    nocheck: toml('cdwr-builder', ''),
    broken: 'app = [',
    post: toml(
      'cdwr-post',
      "[[http_service.checks]]\n  method = 'POST'\n  path = '/x'\n"
    ),
    nomethod: toml('cdwr-open', "[[http_service.checks]]\n  path = '/open'\n")
  });

  it('reads the GET path by base app name, skipping a file with none or a broken one', () => {
    expect([...checks.keys()].sort()).toEqual([
      'cdwr-cms',
      'cdwr-open',
      'cdwr-umami'
    ]);
    expect(checks.get('cdwr-open')).toBe('/open');
  });

  it('gives an app the path of its base name, defaulting to /api/health', () => {
    expect(healthPath('cdwr-umami', checks)).toBe('/api/heartbeat');
    expect(healthPath('cdwr-cms-moon', checks)).toBe('/api/health');
    expect(healthPath('cdwr-unknown', checks)).toBe('/api/health');
    expect(healthPath('cdwr-umamix', checks)).toBe('/api/health');
  });

  it('prefers the longest base name', () => {
    const nested = new Map([
      ['cdwr-c', '/short'],
      ['cdwr-cms', '/long']
    ]);
    expect(healthPath('cdwr-cms-moon', nested)).toBe('/long');
    expect(healthPath('cdwr-cms', nested)).toBe('/long');
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
        app: 'cdwr-cms-acme-dep',
        primary: true,
        certificate: 'Ready',
        recordedCertificate: 'ready'
      },
      {
        hostname: 'www.acme.example',
        app: 'cdwr-headless-acme-dep',
        primary: false,
        certificate: 'Pending',
        recordedCertificate: null
      }
    ]);

    const missing = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms-acme-dep', { certs: ok([]) }),
          flyApp('cdwr-headless-acme-dep', { certs: ok([]) })
        ])
      })
    );
    const missingRow = row(missing.rows, 'acme');
    expect(
      (missingRow.domains as { certificate: string }[]).map(
        (d) => d.certificate
      )
    ).toEqual(['missing', 'missing']);
    expect(missingRow.errors).toEqual({});
  });

  it('looks a domain up on the app it names, the host app included', () => {
    const onHost: TenantRecord = {
      ...acme,
      domains: [
        {
          hostname: 'host.acme.example',
          app: 'cdwr-cms',
          primary: true,
          certificateStatus: null
        }
      ]
    };
    const { rows } = buildRows(
      readings({
        tenants: ok([onHost, beta]),
        fly: ok([
          flyApp('cdwr-cms', {
            certs: ok([
              { hostname: 'host.acme.example', clientStatus: 'Ready' }
            ])
          }),
          flyApp('cdwr-cms-acme-dep', { certs: ok([]) })
        ])
      })
    );
    const acmeRow = row(rows, 'acme');
    expect(acmeRow.domains).toMatchObject([
      { hostname: 'host.acme.example', app: 'cdwr-cms', certificate: 'Ready' }
    ]);
    expect(acmeRow.errors).toEqual({});
    expect(row(rows, SHARED_KEY).domains).toEqual([]);
  });

  it('reads a domain on its named app as missing when that app lacks it, without falling back', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms-acme-dep', {
            certs: ok([
              { hostname: 'acme.example', clientStatus: 'Ready' },
              { hostname: 'www.acme.example', clientStatus: 'Ready' }
            ])
          }),
          flyApp('cdwr-headless-acme-dep', { certs: ok([]) })
        ])
      })
    );
    expect(
      (row(rows, 'acme').domains as { certificate: string }[]).map(
        (d) => d.certificate
      )
    ).toEqual(['Ready', 'missing']);
  });

  it('falls back to the own apps when the named app was not read, and notes it when they lack it too', () => {
    const kindOnly: TenantRecord = {
      ...acme,
      domains: [
        {
          hostname: 'acme.example',
          app: 'cms',
          primary: true,
          certificateStatus: 'ready'
        },
        {
          hostname: 'www.acme.example',
          app: 'cdwr-headless-gone',
          primary: false,
          certificateStatus: null
        },
        {
          hostname: 'none.acme.example',
          app: null,
          primary: false,
          certificateStatus: null
        }
      ]
    };
    const { rows } = buildRows(
      readings({
        tenants: ok([kindOnly, beta]),
        fly: ok([flyApp('cdwr-cms-acme-dep')])
      })
    );
    const acmeRow = row(rows, 'acme');
    expect(
      (acmeRow.domains as { certificate: string }[]).map((d) => d.certificate)
    ).toEqual(['Ready', 'unknown', 'missing']);
    expect(acmeRow.errors).toEqual({
      certs: 'www.acme.example: cdwr-headless-gone was not read'
    });
  });

  it('notes a failed certificate read of a named app on another row, once', () => {
    const onHost: TenantRecord = {
      ...acme,
      domains: ['a.acme.example', 'b.acme.example'].map((hostname) => ({
        hostname,
        app: 'cdwr-cms',
        primary: false,
        certificateStatus: null
      }))
    };
    const { rows } = buildRows(
      readings({
        tenants: ok([onHost, beta]),
        fly: ok([flyApp('cdwr-cms', { certs: failed('fly timed out') })])
      })
    );
    const acmeRow = row(rows, 'acme');
    expect(
      (acmeRow.domains as { certificate: string }[]).map((d) => d.certificate)
    ).toEqual(['unknown', 'unknown']);
    expect(acmeRow.errors).toEqual({ certs: 'cdwr-cms: fly timed out' });
    expect(row(rows, SHARED_KEY).errors).toEqual({
      certs: 'cdwr-cms: fly timed out'
    });
  });

  it('lists the certificates of the host apps on the shared row', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms', {
            certs: ok([{ hostname: 'cms.example', clientStatus: 'Ready' }])
          }),
          flyApp('cdwr-umami', { certs: failed('nope') }),
          // An app of no known tenant also sits on the shared row, but is no host
          flyApp('cdwr-cms-gone', {
            certs: ok([{ hostname: 'gone.example', clientStatus: 'Pending' }])
          })
        ])
      })
    );
    expect(row(rows, SHARED_KEY).domains).toEqual([
      {
        hostname: 'cms.example',
        app: 'cms',
        primary: false,
        certificate: 'Ready',
        recordedCertificate: null
      }
    ]);
  });

  it('records a failed certificate read as unknown with the reason in errors', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms-acme-dep', {
            certs: failed(new Error('flyctl exploded\nsecond line'))
          }),
          flyApp('cdwr-headless-acme-dep', { certs: failed('timed out') })
        ])
      })
    );
    const acmeRow = row(rows, 'acme');
    expect(acmeRow.errors).toEqual({
      certs:
        'cdwr-cms-acme-dep: flyctl exploded second line; cdwr-headless-acme-dep: timed out'
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

  it('marks a tenant app gated by tenant and kind, and leaves unknown out', () => {
    const { rows } = buildRows(
      readings({
        switches: ok([
          {
            app: 'cms',
            environment: 'production',
            tenant: 'acme-dep',
            flag: 'on',
            gated: true
          },
          {
            app: 'headless',
            environment: 'production',
            tenant: 'acme-dep',
            flag: 'on',
            gated: false
          },
          // Host switch: the shared cms stays unmarked
          {
            app: 'cms',
            environment: 'production',
            tenant: null,
            flag: 'on',
            gated: true
          }
        ])
      })
    );
    const acmeApps = row(rows, 'acme').apps as {
      kind: string;
      gated?: boolean;
    }[];
    expect(acmeApps.map((a) => [a.kind, a.gated])).toEqual([
      ['cms', true],
      ['headless', false]
    ]);
    // No Infisical entry for beta's app, and no gate on the shared row
    for (const key of ['beta', SHARED_KEY]) {
      for (const app of row(rows, key).apps as object[]) {
        expect(app).not.toHaveProperty('gated');
      }
    }
    // The switches column keeps its named fields
    expect(row(rows, 'acme').switches).toEqual([
      { app: 'cms', environment: 'production', tenant: 'acme-dep', flag: 'on' },
      {
        app: 'headless',
        environment: 'production',
        tenant: 'acme-dep',
        flag: 'on'
      }
    ]);
  });

  it('leaves gated out when Infisical was not read', () => {
    const { rows } = buildRows(readings({ switches: failed('no infisical') }));
    for (const app of row(rows, 'acme').apps as object[]) {
      expect(app).not.toHaveProperty('gated');
    }
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

describe('the sentry column', () => {
  it('counts the tenant, with its top issue; a tenant absent from the result has 0 and 0', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, 'acme').sentry).toEqual({
      org: 'cdwr',
      count24h: 3,
      count7d: 10,
      top: { shortId: 'CDWR-1', level: 'error', count: 3, title: 'Boom' }
    });
    expect(row(rows, 'beta').sentry).toEqual({
      org: 'cdwr',
      count24h: 0,
      count7d: 1,
      top: null
    });
    expect(row(rows, SHARED_KEY).sentry).toEqual({});
  });

  it('cleans the title of urls and cuts it to 120 characters', () => {
    const read = {
      org: 'cdwr',
      day: { acme: 1 },
      week: { acme: 1 },
      tops: {
        acme: ok({
          shortId: 'CDWR-2',
          level: 'error',
          count: 1,
          title: `fetch https://x.io/a?b=1   failed\n${'y'.repeat(300)}`
        })
      }
    };
    const { top } = sentrySignal(read, 'acme');
    expect(top?.title).toHaveLength(120);
    expect(top?.title.startsWith('fetch [url] failed yyy')).toBe(true);
    expect(plainText('a\n b', 10)).toBe('a b');
  });

  it('names a failed read on every row and never records zero errors', () => {
    const { rows } = buildRows(readings({ sentry: failed('not configured') }));
    for (const r of rows) {
      expect(r.errors).toEqual({ sentry: 'not configured' });
      expect(r.sentry).toEqual({});
    }
  });

  it('names a failed top issue read on its tenant, leaving the counts', () => {
    const { rows } = buildRows(
      readings({
        sentry: ok({
          org: 'cdwr',
          day: { acme: 3 },
          week: { acme: 3 },
          tops: { acme: failed('Sentry answered 500') }
        })
      })
    );
    expect(row(rows, 'acme').errors).toEqual({
      sentry: 'top issue: Sentry answered 500'
    });
    expect(row(rows, 'acme').sentry).toMatchObject({ count24h: 3, top: null });
  });
});

describe('the visitors column', () => {
  it('lists the seven days before today, oldest first, a missing day as 0', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, 'acme').visitors).toEqual({
      today: 5,
      days: [
        { date: '2026-11-08', visitors: 0 },
        { date: '2026-11-09', visitors: 0 },
        { date: '2026-11-10', visitors: 0 },
        { date: '2026-11-11', visitors: 0 },
        { date: '2026-11-12', visitors: 0 },
        { date: '2026-11-13', visitors: 0 },
        { date: '2026-11-14', visitors: 9 }
      ]
    });
  });

  it('leaves a tenant without a statistics website empty, with no error', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, 'beta').visitors).toEqual({});
    expect(row(rows, 'beta').errors).toEqual({});
    expect(row(rows, SHARED_KEY).visitors).toEqual({});
  });

  it('names a failed read on the tenant, not as zero visitors', () => {
    const { rows } = buildRows(
      readings({ visitors: { acme: failed('not configured') } })
    );
    expect(row(rows, 'acme').errors).toEqual({ umami: 'not configured' });
    expect(row(rows, 'acme').visitors).toEqual({});
  });

  it('names a tenant with a website that was not read', () => {
    const { rows } = buildRows(readings({ visitors: {} }));
    expect(row(rows, 'acme').errors).toEqual({ umami: 'not read' });
  });

  it('keeps a day that really had 0 visitors apart from a failure', () => {
    expect(visitorsSignal({ today: 0, days: [] }, ['2026-11-14'])).toEqual({
      today: 0,
      days: [{ date: '2026-11-14', visitors: 0 }]
    });
  });
});

describe('Stockholm days', () => {
  it('names the day by the clock in Stockholm', () => {
    expect(stockholmDay(Date.parse('2026-11-14T23:30:00Z'))).toBe('2026-11-15');
    expect(stockholmDay(Date.parse('2026-06-30T21:59:00Z'))).toBe('2026-06-30');
    expect(stockholmDay(Date.parse('2026-06-30T22:00:00Z'))).toBe('2026-07-01');
  });

  it('starts the day at local midnight, through the switches of summer time', () => {
    expect(dayStart('2026-11-15')).toBe(Date.parse('2026-11-14T23:00:00Z'));
    expect(dayStart('2026-07-01')).toBe(Date.parse('2026-06-30T22:00:00Z'));
    expect(dayStart('2026-03-29')).toBe(Date.parse('2026-03-28T23:00:00Z'));
    expect(dayStart('2026-10-25')).toBe(Date.parse('2026-10-24T22:00:00Z'));
  });

  it('lists the days before a day, oldest first', () => {
    expect(daysBefore('2026-03-01', 3)).toEqual([
      '2026-02-26',
      '2026-02-27',
      '2026-02-28'
    ]);
  });
});

describe('the deploy column', () => {
  it('goes to the shared row only', () => {
    const { rows } = buildRows(readings());
    expect(row(rows, SHARED_KEY).deploy).toEqual(deploy);
    expect(row(rows, 'acme').deploy).toEqual({});
  });

  it('names a failed read on the shared row, leaving the column empty', () => {
    const { rows } = buildRows(
      readings({ deploy: failed('GitHub answered 403') })
    );
    expect(row(rows, SHARED_KEY).errors).toEqual({
      github: 'GitHub answered 403'
    });
    expect(row(rows, SHARED_KEY).deploy).toEqual({});
    expect(row(rows, 'acme').errors).toEqual({});
  });

  it('takes the conclusion of the deploy job', () => {
    const job = (name: string, conclusion: string | null) => ({
      name,
      conclusion
    });
    expect(
      deployConclusion([job('build', 'success'), job('deploy', 'success')])
    ).toBe('success');
    expect(deployConclusion([job('deploy', 'failure')])).toBe('failure');
    expect(deployConclusion([job('deploy', 'skipped')])).toBe('skipped');
    expect(deployConclusion([job('deploy', 'cancelled')])).toBe('cancelled');
    expect(deployConclusion([job('build', 'failure')])).toBe('none');
    expect(deployConclusion([])).toBe('none');
    expect(
      deployConclusion([
        job('deploy (a)', 'success'),
        job('deploy (b)', 'failure')
      ])
    ).toBe('failure');
    expect(
      deployConclusion([
        job('deploy (a)', 'success'),
        job('deploy (b)', 'skipped')
      ])
    ).toBe('success');
    expect(deployConclusion([job('deployment', 'failure')])).toBe('none');
  });
});

describe('the backup column', () => {
  const read: BackupRead = {
    newest: {
      name: 'cms-production-2026-11-15T03-00-00',
      takenAt: '2026-11-15T03:00:00Z',
      bytes: 1234
    },
    count: 7,
    lastRun: ok({ at: '2026-11-15T03:00:09.000Z', ok: true, error: null })
  };

  it('goes to the shared row only, with exactly the contract fields', () => {
    const { rows } = buildRows(readings({ backup: read }));
    expect(row(rows, SHARED_KEY).backup).toEqual({
      newest: 'cms-production-2026-11-15T03-00-00',
      newestAt: '2026-11-15T03:00:00Z',
      count: 7,
      bytes: 1234,
      lastRun: { at: '2026-11-15T03:00:09.000Z', ok: true, error: null }
    });
    expect(row(rows, 'acme').backup).toEqual({});
    expect(row(rows, 'beta').backup).toEqual({});
    expect(row(rows, SHARED_KEY).errors).toEqual({});
  });

  it('is empty when nothing was read, with no error', () => {
    const { rows } = buildRows(readings({ backup: null }));
    expect(row(rows, SHARED_KEY).backup).toEqual({});
    expect(row(rows, SHARED_KEY).errors).toEqual({});
  });

  it('has no newest and no size when there is no dump, only a status', () => {
    const { rows } = buildRows(
      readings({
        backup: {
          newest: null,
          count: 0,
          lastRun: ok({ at: 'x', ok: false, error: 'pg_dump failed' })
        }
      })
    );
    expect(row(rows, SHARED_KEY).backup).toEqual({
      newest: null,
      newestAt: null,
      count: 0,
      bytes: null,
      lastRun: { at: 'x', ok: false, error: 'pg_dump failed' }
    });
  });

  it('cleans the error of the last run and cuts it to 200 characters', () => {
    const { rows } = buildRows(
      readings({
        backup: {
          ...read,
          lastRun: ok({
            at: 'x',
            ok: false,
            error: `connect postgres://u:pw@h/db ${'z'.repeat(300)}`
          })
        }
      })
    );
    const { lastRun } = row(rows, SHARED_KEY).backup as {
      lastRun: { error: string };
    };
    expect(lastRun.error).toHaveLength(200);
    expect(lastRun.error.startsWith('connect [url] zzz')).toBe(true);
  });

  it('names an unreadable status file under backup and leaves lastRun null', () => {
    const { rows } = buildRows(
      readings({
        backup: { ...read, lastRun: failed('backup-status.json is bad') }
      })
    );
    expect(row(rows, SHARED_KEY).errors).toEqual({
      backup: 'backup-status.json is bad'
    });
    expect(row(rows, SHARED_KEY).backup).toMatchObject({
      count: 7,
      lastRun: null
    });
    expect(row(rows, 'acme').errors).toEqual({});
  });
});

describe('behind main', () => {
  const old = 'a'.repeat(40);
  const tagged = 'b'.repeat(40);
  const newer = 'c'.repeat(40);

  const release = (
    machines: ReleaseRead['machines'],
    latest: string | null = 'cms-1.1.0'
  ) => ({ cms: ok<ReleaseRead>({ latest, machines }) });
  const current = (version: string | null = 'cms-1.1.0') =>
    ok({ version, current: true });
  const stale = ok({ version: 'cms-1.0.0', current: false });

  it('maps an app kind to its Nx project', () => {
    expect(projectOf('cms')).toBe('cms');
    expect(projectOf('umami')).toBe('umami');
    expect(projectOf('other')).toBeNull();
  });

  it.each([
    ['cms-1.65.4', 'cms', 'cms-1.65.4'],
    ['cms-1.65.4-preview.3', 'cms', null],
    ['cmsx-1.0.0', 'cms', null],
    ['builder-0.0.71', 'builder', 'builder-0.0.71'],
    ['builder-0.0.71', 'cms', null],
    ['cms-1.2', 'cms', null]
  ])('takes the release tag %s of %s as %s', (tag, project, expected) => {
    expect(releaseTag(project, tag)).toBe(expected);
  });

  describe.each([
    {
      name: 'a machine on the release commit is current',
      kind: 'cms',
      machines: [{ sha: tagged }],
      releases: release({ [tagged]: current() }),
      expected: { behind: false }
    },
    {
      name: 'a machine on a newer untagged commit is current',
      kind: 'cms',
      machines: [{ sha: newer }],
      releases: release({ [newer]: current('cms-1.0.0') }),
      expected: { behind: false }
    },
    {
      name: 'a machine whose commit lacks the newest tag is behind',
      kind: 'cms',
      machines: [{ sha: old }],
      releases: release({ [old]: stale }),
      expected: { behind: true }
    },
    {
      name: 'any machine behind makes the app behind',
      kind: 'cms',
      machines: [{ sha: tagged }, { sha: old }],
      releases: release({ [tagged]: current(), [old]: stale }),
      expected: { behind: true }
    },
    {
      name: 'a machine without a sha is not compared',
      kind: 'cms',
      machines: [{ sha: tagged }, { sha: null }],
      releases: release({ [tagged]: current() }),
      expected: { behind: false }
    },
    {
      name: 'no release tag is null without an error',
      kind: 'cms',
      machines: [{ sha: old }],
      releases: release({ [old]: ok({ version: null, current: false }) }, null),
      expected: { behind: null }
    },
    {
      name: 'an unknown commit is null with its reason',
      kind: 'cms',
      machines: [{ sha: old }],
      releases: release({
        [old]: failed('the commit is not in the local git')
      }),
      expected: { behind: null, error: 'the commit is not in the local git' }
    },
    {
      name: 'a machine behind beats another machine unread',
      kind: 'cms',
      machines: [{ sha: old }, { sha: newer }],
      releases: release({ [old]: stale, [newer]: failed('unknown commit') }),
      expected: { behind: true }
    },
    {
      name: 'a machine behind beats an unread machine listed first',
      kind: 'cms',
      machines: [{ sha: newer }, { sha: old }],
      releases: release({ [newer]: failed('unknown commit'), [old]: stale }),
      expected: { behind: true }
    },
    {
      name: 'a machine missing from the read is null as not read',
      kind: 'cms',
      machines: [{ sha: old }],
      releases: release({}),
      expected: { behind: null, error: 'not read' }
    },
    {
      name: 'a failed project read is null with its reason',
      kind: 'cms',
      machines: [{ sha: old }],
      releases: { cms: failed('git tag failed (128)') },
      expected: { behind: null, error: 'git tag failed (128)' }
    },
    {
      name: 'an absent project is null as not read',
      kind: 'cms',
      machines: [{ sha: old }],
      releases: {},
      expected: { behind: null, error: 'not read' }
    },
    {
      name: 'a kind with no project is null',
      kind: 'other',
      machines: [{ sha: old }],
      releases: release({ [old]: stale }),
      expected: { behind: null }
    },
    {
      name: 'machines not read are null',
      kind: 'cms',
      machines: null,
      releases: release({}),
      expected: { behind: null }
    },
    {
      name: 'no machines are null',
      kind: 'cms',
      machines: [],
      releases: release({}),
      expected: { behind: null }
    },
    {
      name: 'machines with no sha are null',
      kind: 'cms',
      machines: [{ sha: null }],
      releases: release({}),
      expected: { behind: null }
    }
  ])('behindFlag', ({ name, kind, machines, releases, expected }) => {
    it(name, () => {
      expect(behindFlag(kind, machines, releases)).toEqual(expected);
    });
  });

  describe('releaseShas', () => {
    const on = (sha: string | undefined, id = 'm1'): MachineInput => ({
      id,
      state: 'started',
      region: 'arn',
      config: { env: sha ? { GIT_SHA: sha } : {} }
    });

    it('lists the commits of a host app and of a tenant app by project', () => {
      expect(
        releaseShas([
          flyApp('cdwr-cms', { machines: ok([on(old)]) }),
          flyApp('cdwr-headless-acme-dep', { machines: ok([on(tagged)]) })
        ])
      ).toEqual({ cms: [old], headless: [tagged] });
    });

    it('lists a commit once across the apps of a project', () => {
      expect(
        releaseShas([
          flyApp('cdwr-cms', { machines: ok([on(old), on(old, 'm2')]) }),
          flyApp('cdwr-cms-acme-dep', {
            machines: ok([on(old), on(newer, 'm3')])
          })
        ])
      ).toEqual({ cms: [old, newer] });
    });

    it('skips failed machine reads, other kinds and machines without a sha', () => {
      expect(
        releaseShas([
          flyApp('cdwr-cms', { machines: failed('down') }),
          flyApp('cdwr-umami-x', { machines: ok([on(old)]) }),
          flyApp('cdwr-thing', { machines: ok([on(old)]) }),
          flyApp('cdwr-headless', {
            machines: ok([
              on(undefined),
              on('not a sha!', 'm2'),
              on(tagged, 'm3')
            ])
          })
        ])
      ).toEqual({ umami: [old], headless: [tagged] });
    });
  });

  it('puts the flag, the latest tag and each machine version on the app', () => {
    const { rows } = buildRows(
      readings({
        fly: ok([
          flyApp('cdwr-cms', {
            machines: ok([
              { ...machine, config: { env: { GIT_SHA: old } } },
              { ...machine, id: 'm2', config: { env: { GIT_SHA: newer } } },
              { ...machine, id: 'm3', config: { env: { GIT_SHA: tagged } } },
              { id: 'm4', state: 'stopped', region: 'arn' }
            ])
          })
        ]),
        releases: {
          fetchError: null,
          projects: release({
            [old]: stale,
            [newer]: current('cms-1.1.0'),
            [tagged]: failed('unknown commit')
          })
        }
      })
    );
    expect(row(rows, SHARED_KEY).apps).toMatchObject([
      {
        behind: true,
        latest: 'cms-1.1.0',
        machines: [
          { version: 'cms-1.0.0' },
          { version: 'cms-1.1.0' },
          { version: null },
          { version: null }
        ]
      }
    ]);
    expect(row(rows, SHARED_KEY).errors).toEqual({});
  });

  it('leaves latest and versions null when nothing was read, noting an unread project', () => {
    const { rows } = buildRows(
      readings({ releases: { fetchError: null, projects: {} } })
    );
    expect(row(rows, SHARED_KEY).apps).toMatchObject([
      { behind: null, latest: null, machines: [{ version: null }] }
    ]);
    expect(row(rows, SHARED_KEY).errors).toEqual({
      behind: 'cdwr-cms: not read'
    });
  });

  it('names the reason in errors of the app row when the project read failed', () => {
    const { rows } = buildRows(
      readings({
        releases: {
          fetchError: null,
          projects: { cms: failed('git tag failed (128)') }
        }
      })
    );
    expect(row(rows, SHARED_KEY).apps).toMatchObject([
      { behind: null, latest: null }
    ]);
    expect(row(rows, 'acme').errors).toMatchObject({
      behind: expect.stringContaining('cdwr-cms-acme-dep: git tag failed (128)')
    });
  });

  it('notes a failed fetch of the tags on the shared row', () => {
    const { rows } = buildRows(
      readings({
        releases: {
          ...readings().releases,
          fetchError: 'git fetch failed (128), local tags used'
        }
      })
    );
    expect(row(rows, SHARED_KEY).errors).toEqual({
      behind: 'git fetch failed (128), local tags used'
    });
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
      flag: 'on',
      gated: false
    });
    expect(records).toContainEqual({
      app: 'headless',
      environment: 'production',
      tenant: 'beta',
      flag: 'off'
    });
    expect(JSON.stringify(records)).not.toContain('shh');
  });

  it('records whether a tenant app holds the gate, never its value', () => {
    const records = switchRecords(
      'production',
      {
        cms: [
          { secrets: { SITE_GATE_PASSWORD: 'hunter2' } },
          { tenant: 'acme-dep', secrets: { SITE_GATE_PASSWORD: 'hunter2' } },
          { tenant: 'beta', secrets: { TOKEN: 'shh' } }
        ],
        headless: [{ tenant: 'acme-dep' }]
      },
      [{ app: 'headless', tenant: 'beta', reason: 'flag-off' }]
    );
    const gated = (app: string, tenant: string | null) =>
      records.find((r) => r.app === app && r.tenant === tenant)?.gated;
    expect(gated('cms', 'acme-dep')).toBe(true);
    expect(gated('cms', 'beta')).toBe(false);
    expect(gated('headless', 'acme-dep')).toBe(false);
    // A host app and a skipped deployment were not read
    expect(gated('cms', null)).toBeUndefined();
    expect(gated('headless', 'beta')).toBeUndefined();
    expect(JSON.stringify(records)).not.toContain('hunter2');
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
        ]),
        sentry: ok({
          org: 'cdwr',
          day: { acme: 1 },
          week: { acme: 1 },
          tops: {
            acme: ok({
              shortId: 'CDWR-1',
              level: 'error',
              count: 1,
              title: `connect ${planted.values[0] as string} failed`,
              apiKey: planted.values[1],
              token: planted.values[2]
            } as never)
          }
        }),
        visitors: {
          acme: ok({
            today: 1,
            days: [],
            apiKey: planted.values[1]
          } as never)
        },
        deploy: ok({
          ...deploy,
          secrets: { PAYLOAD_API_KEY: planted.values[1] }
        } as never),
        backup: {
          newest: {
            name: 'cms-production-2026-11-15T03-00-00',
            takenAt: '2026-11-15T03:00:00Z',
            bytes: 10,
            apiKey: planted.values[1]
          },
          count: 1,
          lastRun: ok({
            at: AT,
            ok: false,
            error: `dump of ${planted.values[0] as string} failed`,
            token: planted.values[2]
          })
        } as never
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
