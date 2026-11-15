import type { TenantStateRow } from '../supabase';

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
  /** Affected since its machines' commit and still on it; null when unknown */
  behind: boolean | null;
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
  byApplication: Record<string, number>;
};

/** A tenant's Sentry read: the issue counts of the last day and week, and the busiest issue */
export type TenantSentry = {
  org: string;
  count24h: number;
  count7d: number;
  top: { shortId: string; level: string; count: number; title: string } | null;
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

const machine = (r: Rec): TenantMachine => ({
  id: str(r['id']) ?? '',
  state: str(r['state']) ?? 'unknown',
  region: str(r['region']) ?? '',
  memoryMb: num(r['memoryMb']),
  image: str(r['image']),
  sha: str(r['sha'])
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
    behind: typeof r['behind'] === 'boolean' ? r['behind'] : null
  };
};

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
    count7d,
    top:
      isRecord(top) && shortId && count !== null
        ? {
            shortId,
            level: str(top['level']) ?? 'error',
            count,
            title: str(top['title']) ?? ''
          }
        : null
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

const database = (value: unknown): TenantDb | null => {
  if (!isRecord(value)) return null;
  const sessions = num(value['sessions']);
  if (sessions === null) return null;
  const by = value['byApplication'];
  return {
    sizeBytes: num(value['sizeBytes']),
    sessions,
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
export const parseTenantRow = (row: TenantStateRow): TenantRow => ({
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
  errors: isRecord(row.errors)
    ? Object.fromEntries(
        Object.entries(row.errors).flatMap(([k, v]) => {
          const text = str(v);
          return text === null ? [] : [[k, text]];
        })
      )
    : {}
});
