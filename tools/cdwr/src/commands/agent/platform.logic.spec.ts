import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type AffectedCache,
  type FlyAppReading,
  type PlatformReadings,
  SHARED_KEY,
  type TenantRecord,
  appOwner,
  behindFlag,
  behindPairs,
  buildRows,
  dayStart,
  daysBefore,
  deployConclusion,
  failed,
  libpqEnv,
  ok,
  oneLine,
  pairKey,
  parseAffectedCache,
  parseSql,
  plainText,
  projectOf,
  pruneAffected,
  sentrySignal,
  splitDatabase,
  stockholmDay,
  switchRecords,
  uncachedPairs,
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
  affected: {},
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

describe('behind main', () => {
  const head = 'd'.repeat(40);
  const base = 'a'.repeat(40);
  const key = pairKey({ base, head });

  it('maps an app kind to its Nx project', () => {
    expect(projectOf('cms')).toBe('cms');
    expect(projectOf('umami')).toBe('umami');
    expect(projectOf('other')).toBeNull();
  });

  it('is true when the project is affected between the machine and the deploy', () => {
    expect(
      behindFlag('cms', [{ sha: base }], head, { [key]: ok(['cms', 'ui']) })
    ).toEqual({ behind: true });
  });

  it('is false when the project is not affected, or every machine is at the deploy', () => {
    expect(
      behindFlag('cms', [{ sha: base }], head, { [key]: ok(['headless']) })
    ).toEqual({ behind: false });
    expect(behindFlag('cms', [{ sha: head }], head, {})).toEqual({
      behind: false
    });
    // A short sha of the same commit is the same commit
    expect(behindFlag('cms', [{ sha: 'dddddddd' }], head, {})).toEqual({
      behind: false
    });
  });

  it('is true when any machine is behind', () => {
    expect(
      behindFlag('cms', [{ sha: head }, { sha: base }], head, {
        [key]: ok(['cms'])
      })
    ).toEqual({ behind: true });
  });

  it('is null when it cannot be told', () => {
    expect(behindFlag('cms', [{ sha: base }], null, {})).toEqual({
      behind: null
    });
    expect(behindFlag('cms', null, head, {})).toEqual({ behind: null });
    expect(behindFlag('cms', [{ sha: null }], head, {})).toEqual({
      behind: null
    });
    expect(
      behindFlag('other', [{ sha: base }], head, { [key]: ok(['cms']) })
    ).toEqual({ behind: null });
  });

  it('is null with the reason when the projects could not be read', () => {
    expect(
      behindFlag('cms', [{ sha: base }], head, {
        [key]: failed('the commit is not in the local git')
      })
    ).toEqual({ behind: null, error: 'the commit is not in the local git' });
    expect(behindFlag('cms', [{ sha: base }], head, {})).toEqual({
      behind: null,
      error: 'not read'
    });
  });

  it('asks once for each commit pair a machine is apart from the deploy', () => {
    const second = { ...machine, id: 'm2' };
    const pairs = behindPairs(
      [
        flyApp('cdwr-cms', {
          machines: ok([
            { ...machine, config: { env: { GIT_SHA: base } } },
            { ...second, config: { env: { GIT_SHA: base } } },
            { ...second, id: 'm3', config: { env: { GIT_SHA: head } } },
            { id: 'm4', state: 'stopped', region: 'arn' }
          ])
        }),
        flyApp('cdwr-cms-x', { machines: failed('down') })
      ],
      head
    );
    expect(pairs).toEqual([{ base, head }]);
  });

  it('puts the flag on the app and the reason in errors of its row', () => {
    const stale = {
      ...machine,
      config: { env: { GIT_SHA: base } }
    };
    const { rows } = buildRows(
      readings({
        deploy: ok({ ...deploy, sha: head }),
        fly: ok([
          flyApp('cdwr-cms', { machines: ok([stale]) }),
          flyApp('cdwr-cms-acme-dep', { machines: ok([stale]) })
        ]),
        affected: { [key]: failed('nx failed (1)') }
      })
    );
    expect(row(rows, SHARED_KEY).apps).toMatchObject([{ behind: null }]);
    expect(row(rows, SHARED_KEY).errors).toEqual({
      behind: 'cdwr-cms: nx failed (1)'
    });
    const ok2 = buildRows(
      readings({
        deploy: ok({ ...deploy, sha: head }),
        fly: ok([flyApp('cdwr-cms', { machines: ok([stale]) })]),
        affected: { [key]: ok(['cms']) }
      })
    );
    expect(row(ok2.rows, SHARED_KEY).apps).toMatchObject([{ behind: true }]);
    expect(row(ok2.rows, SHARED_KEY).errors).toEqual({});
  });

  it('is null on every app, with no behind error, when the deploy was not read', () => {
    const { rows } = buildRows(readings({ deploy: failed('x') }));
    expect(row(rows, SHARED_KEY).apps).toMatchObject([{ behind: null }]);
    expect(row(rows, SHARED_KEY).errors).toEqual({ github: 'x' });
  });
});

describe('the affected cache', () => {
  const entry = (n: number) => ({ key: `a${n}..b${n}`, projects: [`p${n}`] });

  it('asks only for pairs it has not seen', () => {
    const cache: AffectedCache = [entry(1)];
    expect(
      uncachedPairs(
        [
          { base: 'a1', head: 'b1' },
          { base: 'a2', head: 'b2' }
        ],
        cache
      )
    ).toEqual([{ base: 'a2', head: 'b2' }]);
  });

  it('keeps the newest 50 pairs', () => {
    const cache = Array.from({ length: 60 }, (_, i) => entry(i));
    const kept = pruneAffected(cache);
    expect(kept).toHaveLength(50);
    expect(kept[0]).toEqual(entry(10));
    expect(kept.at(-1)).toEqual(entry(59));
  });

  it('keeps a pair once, as the newest', () => {
    const kept = pruneAffected([
      entry(1),
      entry(2),
      { ...entry(1), projects: ['new'] }
    ]);
    expect(kept).toEqual([entry(2), { ...entry(1), projects: ['new'] }]);
  });

  it('reads a file back, and an unreadable one as empty', () => {
    expect(parseAffectedCache(JSON.stringify([entry(1)]))).toEqual([entry(1)]);
    expect(parseAffectedCache('not json')).toEqual([]);
    expect(parseAffectedCache('{"key":1}')).toEqual([]);
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
        } as never)
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
