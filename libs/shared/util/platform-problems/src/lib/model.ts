/** A `tenant_state` row as read: the shape of the desk's generated row, without its types */
export type TenantStateInput = {
  key: string;
  at: string;
  name: string | null;
  deployment: string | null;
  status: string | null;
  apps: unknown;
  domains: unknown;
  switches: unknown;
  db: unknown;
  sentry: unknown;
  visitors: unknown;
  deploy: unknown;
  backup: unknown;
  errors: unknown;
};

// The tenant view's rows: a `tenant_state` row with its jsonb columns parsed. The NUC's
// platform step writes them (tools/cdwr/src/commands/agent/platform.logic.ts); nothing is
// trusted, so a field of another shape reads as absent rather than failing the page.

/** The row of what belongs to no tenant: the host apps and the database */
export const SHARED_KEY = '_shared';

/** One Fly machine of an app */
export type TenantMachine = {
  id: string;
  state: string;
  region: string;
  memoryMb: number | null;
  /** `repository:tag` */
  image: string | null;
  /** The commit the machine was deployed from; null when it carries none */
  sha: string | null;
  /** The newest release tag the machine's commit holds, e.g. `cms-1.65.3`; null when unknown */
  version: string | null;
};

export type TenantCert = { hostname: string; state: string };

/** One Fly app, with what was read of it; null where the read failed */
export type TenantApp = {
  app: string;
  /** `cms`, `headless`, `builder`, `umami` or `other` */
  kind: string;
  machines: TenantMachine[] | null;
  certs: TenantCert[] | null;
  health: { ok: boolean; status: number | null; ms: number | null } | null;
  /** The project's newest production release tag on main, e.g. `cms-1.65.4`; null when unknown */
  latest: string | null;
  /** Some machine's commit does not hold the `latest` tag; null when unknown */
  behind: boolean | null;
  /** Whether the site gate is closed; null when the NUC did not read it */
  gated: boolean | null;
};

export type TenantDomain = {
  hostname: string;
  app: string | null;
  primary: boolean;
  /** The Fly certificate's state, or `unknown` when Fly was not read and `missing` when the app has none */
  certificate: string;
};

/** A deploy switch: `flag` is `on`, `off`, `no flag` or `invalid name` */
export type TenantSwitch = {
  app: string;
  environment: string;
  tenant: string | null;
  flag: string;
};

/** The database, on the shared row only */
export type TenantDb = {
  sizeBytes: number | null;
  sessions: number;
  /** The sessions that take a slot in the pool (Supavisor's); null on a row written before it was read */
  pooler: number | null;
  /** Client backends across the whole server, by application name; on an old row, the cms database's only */
  byApplication: Record<string, number>;
  /** Client backends across the server; null on a row written before it was read */
  connections: number | null;
  /** The usable connection limit: max_connections less the reserved slots; null on an old row */
  limit: number | null;
  /** The most connections seen at a tick this UTC day, and when (ISO time) */
  peak: { connections: number; at: string } | null;
  /** Sessions opened since the previous tick, all databases; null on the first tick or an old row */
  opened: number | null;
};

/** The clock time of an ISO time in UTC, `HH:MM`; the input as it came when it does not parse */
export const utcClock = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(11, 16) : iso;
};

/** An unresolved issue first seen on production in the last 24 hours */
export type TenantFreshIssue = {
  shortId: string;
  level: string;
  title: string;
  /** ISO time, as Sentry gave it */
  firstSeen: string;
};

/** A tenant's Sentry read: the event counts of the last day (all, and of unresolved issues; null on a row from before the open count) and week, the busiest issue, and the issues first seen in the last day (null when not read: an old row, or a failed read) */
export type TenantSentry = {
  org: string;
  count24h: number;
  open24h: number | null;
  count7d: number;
  top: { shortId: string; level: string; count: number; title: string } | null;
  fresh: TenantFreshIssue[] | null;
};

/** A tenant's Umami read: visitors today and the seven days before, oldest first */
export type TenantVisitors = {
  today: number;
  days: { date: string; visitors: number }[];
};

/** The newest deploy run of main, on the shared row */
export type TenantDeploy = {
  runId: number;
  sha: string;
  /** The deploy job's conclusion: success, failure, skipped, cancelled or none */
  conclusion: string;
  url: string;
  at: string;
};

/** The NUC's database backup, on the shared row; null when none is configured or none ran yet */
export type TenantBackup = {
  /** The newest dump's folder name */
  newest: string | null;
  /** When the newest dump was made, ISO */
  newestAt: string | null;
  /** Dumps kept on the NUC */
  count: number;
  /** The newest dump's size */
  bytes: number | null;
  lastRun: { at: string; ok: boolean; error: string | null } | null;
};

export type TenantRow = {
  /** The tenant's slug, or `_shared` */
  key: string;
  /** When the row was last written, ms; NaN when it does not parse */
  at: number;
  name: string | null;
  deployment: string | null;
  status: string | null;
  apps: TenantApp[];
  domains: TenantDomain[];
  switches: TenantSwitch[];
  db: TenantDb | null;
  sentry: TenantSentry | null;
  visitors: TenantVisitors | null;
  deploy: TenantDeploy | null;
  backup: TenantBackup | null;
  /** Source -> the one line a failed read left */
  errors: Record<string, string>;
};

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const records = (value: unknown): Rec[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** A release tag such as `cms-1.65.4`; anything else reads as absent */
const releaseTag = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-z][a-z0-9-]*-\d+\.\d+\.\d+$/.test(value)
    ? value
    : null;

const machine = (r: Rec): TenantMachine => ({
  id: str(r['id']) ?? '',
  state: str(r['state']) ?? 'unknown',
  region: str(r['region']) ?? '',
  memoryMb: num(r['memoryMb']),
  image: str(r['image']),
  sha: str(r['sha']),
  version: releaseTag(r['version'])
});

const app = (r: Rec): TenantApp | null => {
  const name = str(r['app']);
  if (!name) return null;
  const health = r['health'];
  return {
    app: name,
    kind: str(r['kind']) ?? 'other',
    machines: Array.isArray(r['machines'])
      ? records(r['machines']).map(machine)
      : null,
    certs: Array.isArray(r['certs'])
      ? records(r['certs']).flatMap((c) => {
          const hostname = str(c['hostname']);
          return hostname
            ? [{ hostname, state: str(c['state']) ?? 'unknown' }]
            : [];
        })
      : null,
    health:
      isRecord(health) && typeof health['ok'] === 'boolean'
        ? {
            ok: health['ok'],
            status: num(health['status']),
            ms: num(health['ms'])
          }
        : null,
    latest: releaseTag(r['latest']),
    behind: typeof r['behind'] === 'boolean' ? r['behind'] : null,
    gated: typeof r['gated'] === 'boolean' ? r['gated'] : null
  };
};

const freshIssues = (value: unknown): TenantFreshIssue[] | null =>
  Array.isArray(value)
    ? records(value).flatMap((r) => {
        const shortId = str(r['shortId']);
        return shortId
          ? [
              {
                shortId,
                level: str(r['level']) ?? 'error',
                title: str(r['title']) ?? '',
                firstSeen: str(r['firstSeen']) ?? ''
              }
            ]
          : [];
      })
    : null;

const sentry = (value: unknown): TenantSentry | null => {
  if (!isRecord(value)) return null;
  const org = str(value['org']);
  const count24h = num(value['count24h']);
  const count7d = num(value['count7d']);
  // The org becomes a host name, so only a slug passes
  if (
    !org ||
    !/^[a-z0-9][a-z0-9-]*$/i.test(org) ||
    count24h === null ||
    count7d === null
  )
    return null;
  const top = value['top'];
  const shortId = isRecord(top) ? str(top['shortId']) : null;
  const count = isRecord(top) ? num(top['count']) : null;
  return {
    org,
    count24h,
    // A row from before the open count has none; a malformed value reads the same way, so the
    // rule falls back on the total rather than dropping the whole sentry read
    open24h: num(value['open24h']),
    count7d,
    top:
      isRecord(top) && shortId && count !== null
        ? {
            shortId,
            level: str(top['level']) ?? 'error',
            count,
            title: str(top['title']) ?? ''
          }
        : null,
    fresh: freshIssues(value['fresh'])
  };
};

const visitors = (value: unknown): TenantVisitors | null => {
  if (!isRecord(value)) return null;
  const today = num(value['today']);
  if (today === null) return null;
  return {
    today,
    days: records(value['days']).flatMap((d) => {
      const date = str(d['date']);
      const n = num(d['visitors']);
      return date && n !== null ? [{ date, visitors: n }] : [];
    })
  };
};

const deployRun = (value: unknown): TenantDeploy | null => {
  if (!isRecord(value)) return null;
  const runId = num(value['runId']);
  const conclusion = str(value['conclusion']);
  if (runId === null || !conclusion) return null;
  return {
    runId,
    sha: str(value['sha']) ?? '',
    conclusion,
    url: str(value['url']) ?? '',
    at: str(value['at']) ?? ''
  };
};

const backupOf = (value: unknown): TenantBackup | null => {
  if (!isRecord(value)) return null;
  const count = num(value['count']);
  if (count === null) return null;
  const run = value['lastRun'];
  const at = isRecord(run) ? str(run['at']) : null;
  return {
    newest: str(value['newest']),
    newestAt: str(value['newestAt']),
    count,
    bytes: num(value['bytes']),
    lastRun:
      isRecord(run) && at && typeof run['ok'] === 'boolean'
        ? { at, ok: run['ok'], error: str(run['error']) }
        : null
  };
};

const database = (value: unknown): TenantDb | null => {
  if (!isRecord(value)) return null;
  const sessions = num(value['sessions']);
  if (sessions === null) return null;
  const by = value['byApplication'];
  const peak = value['peak'];
  const peakConnections = isRecord(peak) ? num(peak['connections']) : null;
  const peakAt = isRecord(peak) ? str(peak['at']) : null;
  return {
    connections: num(value['connections']),
    limit: num(value['limit']),
    peak:
      peakConnections !== null && peakAt
        ? { connections: peakConnections, at: peakAt }
        : null,
    opened: num(value['opened']),
    sizeBytes: num(value['sizeBytes']),
    sessions,
    pooler: num(value['poolerSessions']),
    byApplication: isRecord(by)
      ? Object.fromEntries(
          Object.entries(by).flatMap(([k, v]) => {
            const n = num(v);
            return n === null ? [] : [[k, n]];
          })
        )
      : {}
  };
};

/** A `tenant_state` row with its columns parsed */
export const parseTenantRow = (row: TenantStateInput): TenantRow => ({
  key: row.key,
  at: Date.parse(row.at),
  name: row.name,
  deployment: row.deployment,
  status: row.status,
  apps: records(row.apps).flatMap((r) => app(r) ?? []),
  domains: records(row.domains).flatMap((r) => {
    const hostname = str(r['hostname']);
    return hostname
      ? [
          {
            hostname,
            app: str(r['app']),
            primary: r['primary'] === true,
            certificate: str(r['certificate']) ?? 'unknown'
          }
        ]
      : [];
  }),
  switches: records(row.switches).flatMap((r) => {
    const name = str(r['app']);
    const flag = str(r['flag']);
    return name && flag
      ? [
          {
            app: name,
            environment: str(r['environment']) ?? '',
            tenant: str(r['tenant']),
            flag
          }
        ]
      : [];
  }),
  db: database(row.db),
  sentry: sentry(row.sentry),
  visitors: visitors(row.visitors),
  deploy: deployRun(row.deploy),
  backup: backupOf(row.backup),
  errors: isRecord(row.errors)
    ? Object.fromEntries(
        Object.entries(row.errors).flatMap(([k, v]) => {
          const text = str(v);
          return text === null ? [] : [[k, text]];
        })
      )
    : {}
});
