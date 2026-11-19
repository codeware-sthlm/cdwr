import * as TOML from 'smol-toml';
import { z } from 'zod';

import { libpqEnv } from '../../services/libpq';
import { APPS, summarize } from '../infisical/analysis.logic';
import { GATE_KEY } from '../tenant/gate.logic';

import type { Database } from './supabase.types';

/** The row for what belongs to no tenant: the host apps and the database */
export const SHARED_KEY = '_shared';

export type TenantStateRow =
  Database['public']['Tables']['tenant_state']['Insert'];

/** What one read gave: its value, or a one-line reason it gave none (never "none found") */
export type Reading<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Reading<T> => ({ ok: true, value });

/**
 * One line, short, with anything shaped like a url (a connection string with a
 * password) removed: an error message ends up in a table the desk shows.
 */
export const oneLine = (error: unknown): string =>
  plainText(error instanceof Error ? error.message : String(error), 200) ||
  'unknown error';

/** `text` on one line, urls removed, cut to `max` characters; for text from a third party */
export const plainText = (text: string, max: number): string =>
  text
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export const failed = (error: unknown): Reading<never> => ({
  ok: false,
  reason: oneLine(error)
});

// --- the database read ---

export { libpqEnv };

const SqlSchema = z.object({
  tenants: z.array(
    z.object({
      slug: z.string(),
      name: z.string().nullable(),
      deployment: z.string().nullable(),
      status: z.string().nullable(),
      statsWebsiteId: z.string().nullable(),
      domains: z.array(
        z.object({
          hostname: z.string(),
          app: z.string().nullable(),
          primary: z.boolean(),
          certificateStatus: z.string().nullable()
        })
      )
    })
  ),
  db: z.object({
    sizeBytes: z.number().nullable(),
    sessions: z.number(),
    poolerSessions: z.number(),
    seesAllSessions: z.boolean(),
    connections: z.number(),
    maxConnections: z.number(),
    reservedConnections: z.number(),
    sessionsOpened: z.number(),
    byApplication: z.record(z.string(), z.number())
  })
});

export type TenantRecord = z.infer<typeof SqlSchema>['tenants'][number];
export type DbRecord = z.infer<typeof SqlSchema>['db'];

/** What `platform.sql` printed; throws without echoing any of it */
export const parseSql = (
  stdout: string
): { tenants: TenantRecord[]; db: DbRecord } => {
  try {
    return SqlSchema.parse(JSON.parse(stdout.trim()));
  } catch {
    throw new Error('psql did not print the expected JSON');
  }
};

// --- the fly and health reads ---

const DEFAULT_HEALTH_PATH = '/api/health';

const FlyTomlSchema = z.object({
  app: z.string(),
  http_service: z.object({
    checks: z.array(
      z.object({ method: z.string().optional(), path: z.string().optional() })
    )
  })
});

/**
 * The GET health check path of each app, by the base app name in its fly.toml
 * (raw text, keyed by anything). A file that does not parse or names no app or
 * GET check is skipped.
 */
export const healthChecksOf = (
  tomls: Record<string, string>
): Map<string, string> => {
  const checks = new Map<string, string>();
  for (const text of Object.values(tomls)) {
    let parsed: unknown;
    try {
      parsed = TOML.parse(text);
    } catch {
      continue;
    }
    const config = FlyTomlSchema.safeParse(parsed);
    if (!config.success) continue;
    const path = config.data.http_service.checks.find(
      (c) => (c.method ?? 'GET').toUpperCase() === 'GET' && c.path
    )?.path;
    if (path) checks.set(config.data.app, path);
  }
  return checks;
};

/** The health path of a Fly app: that of the longest base name it is or extends with `-` */
export const healthPath = (
  app: string,
  checks: Map<string, string>
): string => {
  let best: string | undefined;
  for (const base of checks.keys()) {
    if (
      (app === base || app.startsWith(`${base}-`)) &&
      (best === undefined || base.length > best.length)
    ) {
      best = base;
    }
  }
  return (
    (best !== undefined ? checks.get(best) : undefined) ?? DEFAULT_HEALTH_PATH
  );
};

/** The part of a Fly machine that is read; the rest of it is never looked at */
export type MachineInput = {
  id: string;
  state: string;
  region: string;
  imageRef?: { repository?: string; tag?: string };
  config?: {
    env?: Record<string, string>;
    guest?: { memory_mb?: number };
  };
};

export type CertInput = { hostname: string; clientStatus: string };

export type HealthInput = {
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
};

export type FlyAppReading = {
  name: string;
  machines: Reading<MachineInput[]>;
  certs: Reading<CertInput[]>;
  health: HealthInput;
};

export type SwitchRecord = {
  app: string;
  environment: string;
  tenant: string | null;
  flag: string;
  /** Whether the tenant app's secrets name the site gate password; absent when the app was not read */
  gated?: boolean;
};

/** A deployed commit; anything else in `GIT_SHA` is not taken */
const SHA = /^[0-9a-f]{7,40}$/;

const machineState = (m: MachineInput) => ({
  id: m.id,
  state: m.state,
  region: m.region,
  memoryMb: m.config?.guest?.memory_mb ?? null,
  image: m.imageRef?.repository
    ? m.imageRef.tag
      ? `${m.imageRef.repository}:${m.imageRef.tag}`
      : m.imageRef.repository
    : null,
  sha: SHA.test(m.config?.env?.['GIT_SHA'] ?? '')
    ? (m.config?.env?.['GIT_SHA'] ?? null)
    : null
});

/** A machine's state with the release its commit holds; null when that wasn't read */
const machineWithVersion = (m: MachineInput, release: ReleaseRead | null) => {
  const state = machineState(m);
  const read = state.sha ? release?.machines[state.sha] : undefined;
  return { ...state, version: read?.ok ? read.value.version : null };
};

const appState = (
  reading: FlyAppReading,
  kind: string,
  behind: boolean | null,
  release: ReleaseRead | null,
  gated?: boolean
) => ({
  app: reading.name,
  kind,
  ...(gated === undefined ? {} : { gated }),
  machines: reading.machines.ok
    ? reading.machines.value.map((m) => machineWithVersion(m, release))
    : null,
  behind,
  latest: release?.latest ?? null,
  certs: reading.certs.ok
    ? reading.certs.value.map((c) => ({
        hostname: c.hostname,
        state: c.clientStatus
      }))
    : null,
  health: {
    ok: reading.health.ok,
    status: reading.health.status,
    ms: reading.health.ms
  }
});

type AppState = ReturnType<typeof appState>;

/**
 * What a Fly app is: `cdwr-<app>` is a host app and `cdwr-<app>-<tenant>` a
 * tenant's, the suffix being the tenant's deployment name (or slug). A host app
 * and an app of no known tenant belong to the shared row; with the tenants
 * unread, a suffixed app can't be placed and is left out.
 */
export const appOwner = (
  app: string,
  tenants: TenantRecord[] | null
): { key: string; kind: string } | null => {
  for (const base of APPS) {
    const prefix = `cdwr-${base}`;
    if (app === prefix) return { key: SHARED_KEY, kind: base };
    if (app.startsWith(`${prefix}-`)) {
      if (!tenants) return null;
      const suffix = app.slice(prefix.length + 1);
      const tenant = tenantOf(suffix, tenants);
      return { key: tenant?.slug ?? SHARED_KEY, kind: base };
    }
  }
  return { key: SHARED_KEY, kind: 'other' };
};

const tenantOf = (
  name: string,
  tenants: TenantRecord[]
): TenantRecord | undefined =>
  tenants.find((t) => t.deployment === name) ??
  tenants.find((t) => t.slug === name);

/** The deploy switches as the tenancy lib reports them, named fields only */
export const switchRecords = (
  environment: string,
  deployments: Parameters<typeof summarize>[1],
  skipped: Parameters<typeof summarize>[2]
): SwitchRecord[] => {
  const records: SwitchRecord[] = [];
  const analysis = summarize(
    environment as Parameters<typeof summarize>[0],
    deployments,
    skipped,
    {}
  );
  for (const { app, host, tenants } of analysis.apps) {
    if (host !== null) {
      records.push({ app, environment, tenant: null, flag: host });
    }
    for (const { tenant, flag } of tenants) {
      records.push({ app, environment, tenant, flag });
    }
  }
  // Only the secret names are looked at, and only for whether the gate is among them
  for (const record of records) {
    const shipped = record.tenant
      ? deployments[record.app]?.find(({ tenant }) => tenant === record.tenant)
      : undefined;
    if (shipped) record.gated = GATE_KEY in (shipped.secrets ?? {});
  }
  return records;
};

// --- the sentry read ---

export type SentryTop = {
  shortId: string;
  level: string;
  count: number;
  title: string;
};

/** Errors per tenant slug over 24 hours and 7 days, and the top unresolved issue of each tenant with errors today */
export type SentryRead = {
  org: string;
  day: Record<string, number>;
  week: Record<string, number>;
  tops: Record<string, Reading<SentryTop | null>>;
};

const TITLE_MAX = 120;

/** The top issue as a row field: strings from Sentry are one line, urlless and short */
export const sentryTop = (top: SentryTop): SentryTop => ({
  shortId: plainText(top.shortId, 40),
  level: plainText(top.level, 20),
  count: top.count,
  title: plainText(top.title, TITLE_MAX)
});

/** The `sentry` column of a tenant; a tenant absent from the grouped result has none */
export const sentrySignal = (read: SentryRead, slug: string) => {
  const top = read.tops[slug];
  return {
    org: plainText(read.org, 80),
    count24h: read.day[slug] ?? 0,
    count7d: read.week[slug] ?? 0,
    top: top?.ok && top.value ? sentryTop(top.value) : null
  };
};

// --- the umami read ---

export const STATS_TIMEZONE = 'Europe/Stockholm';
export const VISITOR_DAYS = 7;

/** The visitors of today so far and the per-day series as Umami answered it */
export type VisitorsRead = {
  today: number;
  days: Array<{ date: string; visitors: number }>;
};

/** Milliseconds the timezone is ahead of UTC at this instant */
const offsetAt = (ms: number): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STATS_TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, Number(p.value)])
  ) as Record<string, number>;
  const wall = Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
    parts['second'] ?? 0
  );
  return wall - Math.floor(ms / 1000) * 1000;
};

/** The calendar day (`YYYY-MM-DD`) in Stockholm at this instant */
export const stockholmDay = (ms: number): string =>
  new Date(ms + offsetAt(ms)).toISOString().slice(0, 10);

/** The instant Stockholm's `day` (`YYYY-MM-DD`) starts, in epoch milliseconds */
export const dayStart = (day: string): number => {
  const utc = Date.parse(`${day}T00:00:00Z`);
  // Midnight comes before a switch of summer time, so the second step settles the day of the switch
  const first = utc - offsetAt(utc);
  return utc - offsetAt(first);
};

/** The `count` days before `today`, oldest first */
export const daysBefore = (today: string, count: number): string[] => {
  const start = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(start - (count - i) * 86_400_000).toISOString().slice(0, 10)
  );
};

/** The `visitors` column: today and each of `days`, a day Umami didn't list counting 0 */
export const visitorsSignal = (read: VisitorsRead, days: string[]) => {
  const per = new Map(read.days.map((d) => [d.date, d.visitors]));
  return {
    today: read.today,
    days: days.map((date) => ({ date, visitors: per.get(date) ?? 0 }))
  };
};

// --- the deploy read and behind main ---

/** The last completed deploy of main */
export type DeployRead = {
  runId: number;
  sha: string;
  conclusion: string;
  url: string;
  at: string;
};

/**
 * What the deploy job of a run concluded; a matrix names its jobs `deploy (x)`
 * and one failure fails them all. `none` when the run has no deploy job.
 */
export const deployConclusion = (
  jobs: Array<{ name: string; conclusion: string | null }>
): string => {
  const own = jobs.filter(
    (j) => j.name === 'deploy' || j.name.startsWith('deploy (')
  );
  if (own.length === 0) return 'none';
  const seen = own.map((j) => j.conclusion ?? 'unknown');
  if (seen.some((c) => c === 'failure' || c === 'timed_out')) return 'failure';
  for (const c of ['cancelled', 'success', 'skipped']) {
    if (seen.includes(c)) return c;
  }
  return seen[0] ?? 'none';
};

/** The Nx project an app kind is deployed from; the apps share their names with their projects */
export const projectOf = (kind: string): string | null =>
  (APPS as readonly string[]).includes(kind) ? kind : null;

/** A production release tag of a project, `<project>-<x.y.z>`; previews and anything else are not taken */
export const releaseTag = (project: string, tag: string): string | null =>
  new RegExp(`^${project}-\\d+\\.\\d+\\.\\d+$`).test(tag) ? tag : null;

/** What a machine's commit holds: the newest release tag it contains, and whether that is the latest */
export type MachineRelease = { version: string | null; current: boolean };

/** A project's newest release tag on main, and per machine commit what it runs */
export type ReleaseRead = {
  latest: string | null;
  machines: Record<string, Reading<MachineRelease>>;
};

export type ReleasesRead = {
  /** Why fetching the tags failed; the local tags were used */
  fetchError: string | null;
  /** By project */
  projects: Record<string, Reading<ReleaseRead>>;
};

/** The commits the machines of each project run, each once, for the release read */
export const releaseShas = (
  apps: FlyAppReading[]
): Record<string, string[]> => {
  const shas: Record<string, Set<string>> = {};
  for (const app of apps) {
    const project = projectOf(appOwner(app.name, [])?.kind ?? '');
    if (!project || !app.machines.ok) continue;
    for (const m of app.machines.value) {
      const sha = machineState(m).sha;
      if (sha) (shas[project] ??= new Set()).add(sha);
    }
  }
  return Object.fromEntries(
    Object.entries(shas).map(([project, set]) => [project, [...set]])
  );
};

/**
 * Whether an app is behind, by the rule that decides a deploy: some machine's
 * commit doesn't contain the project's newest release tag. The tag is set on
 * the deployed commit, so a machine on that commit or a newer one is current.
 * `behind` is null when that can't be told (no project, no machines, no tag);
 * `error` says why when a read failed rather than there being nothing to compare.
 */
export const behindFlag = (
  kind: string,
  machines: Array<{ sha: string | null }> | null,
  releases: Record<string, Reading<ReleaseRead>>
): { behind: boolean | null; error?: string } => {
  const project = projectOf(kind);
  if (!project || !machines) return { behind: null };
  const shas = machines.flatMap((m) => (m.sha ? [m.sha] : []));
  if (shas.length === 0) return { behind: null };
  const read = releases[project];
  if (!read) return { behind: null, error: 'not read' };
  if (!read.ok) return { behind: null, error: read.reason };
  if (read.value.latest === null) return { behind: null };
  let error: string | undefined;
  for (const sha of shas) {
    const machine = read.value.machines[sha];
    if (!machine) {
      error ??= 'not read';
    } else if (!machine.ok) {
      error ??= machine.reason;
    } else if (!machine.value.current) {
      return { behind: true };
    }
  }
  return error === undefined ? { behind: false } : { behind: null, error };
};

// --- the backup read ---

/** How the last `cdwr agent backup` run went, as it wrote it */
export type BackupRun = { at: string; ok: boolean; error: string | null };

/**
 * What `cdwr agent backup` left under the queue's home: the newest dump (with
 * the size of its two files, null when they can't be read), how many dumps
 * there are, and the status file, which is a reading of its own so an
 * unreadable one is named instead of passing for "never ran".
 */
export type BackupRead = {
  newest: { name: string; takenAt: string; bytes: number | null } | null;
  count: number;
  lastRun: Reading<BackupRun | null>;
};

// --- the day's connection peak ---

/** `db-peak.json` in the queue home, as the last tick left it */
export const DbPeakSchema = z.object({
  /** The UTC day the peak belongs to, `YYYY-MM-DD` */
  day: z.string(),
  /** Null while no tick of the day could count every session */
  connections: z.number().nullable(),
  at: z.string(),
  /** Set by a tick that counted every session; a file older than this flag reads as not */
  counted: z.boolean().default(false),
  /** `sessionsOpened` at the last tick, for the next tick's delta */
  sessionsOpened: z.number()
});

export type DbPeak = z.infer<typeof DbPeakSchema>;

/**
 * The tick's sample merged into the day's peak. A tick samples once every 10
 * minutes and misses a short burst, so `opened` (sessions opened since the last
 * tick) shows one anyway. It is null on the first tick, and when the counter
 * went down (a restart or a statistics reset).
 */
export const mergePeak = (
  previous: DbPeak | null,
  sample: { at: string; connections: number | null; sessionsOpened: number }
): { peak: DbPeak; opened: number | null } => {
  const day = sample.at.slice(0, 10);
  // A sample that could not count every session never lowers or sets the
  // peak, and keeps only a peak that was counted: one the old code wrote while
  // the role saw its own session alone is dropped
  const keep =
    previous !== null &&
    previous.day === day &&
    previous.connections !== null &&
    previous.counted &&
    (sample.connections === null || previous.connections >= sample.connections);
  return {
    peak: {
      day,
      connections: keep ? previous.connections : sample.connections,
      at: keep ? previous.at : sample.at,
      counted: keep || sample.connections !== null,
      sessionsOpened: sample.sessionsOpened
    },
    opened:
      previous !== null && sample.sessionsOpened >= previous.sessionsOpened
        ? sample.sessionsOpened - previous.sessionsOpened
        : null
  };
};

// --- the rows ---

export interface PlatformReadings {
  at: string;
  tenants: Reading<TenantRecord[]>;
  /** Comes from the same query as the tenants */
  db: Reading<DbRecord>;
  fly: Reading<FlyAppReading[]>;
  switches: Reading<SwitchRecord[]>;
  sentry: Reading<SentryRead>;
  /** By tenant slug, for the tenants that have a statistics website */
  visitors: Record<string, Reading<VisitorsRead>>;
  deploy: Reading<DeployRead>;
  /** Release tags by project, for the commits `releaseShas` named */
  releases: ReleasesRead;
  /** null: no backups folder and no status file, or no queue home */
  backup: BackupRead | null;
  /** `mergePeak` of this tick; null when the database wasn't read */
  dbPeak: { peak: DbPeak; opened: number | null } | null;
}

type Errors = Record<string, string>;

/** The `backup` column of the shared row; the desk parses exactly these fields */
const backupSignal = (read: BackupRead) => {
  const run = read.lastRun.ok ? read.lastRun.value : null;
  return {
    newest: read.newest ? plainText(read.newest.name, 80) : null,
    newestAt: read.newest ? plainText(read.newest.takenAt, 40) : null,
    count: read.count,
    bytes: read.newest?.bytes ?? null,
    lastRun: run
      ? {
          at: plainText(run.at, 40),
          ok: run.ok,
          error: run.error === null ? null : plainText(run.error, 200)
        }
      : null
  };
};

const note = (errors: Errors, source: string, reason: string): void => {
  errors[source] = errors[source] ? `${errors[source]}; ${reason}` : reason;
};

const certificateIn = (
  hostname: string,
  apps: AppState[]
): string | undefined => {
  for (const app of apps) {
    const found = app.certs?.find((c) => c.hostname === hostname);
    if (found) return found.state;
  }
  return undefined;
};

/**
 * A domain's certificate, looked up on the app the domain names (any app read,
 * the host app included). When the domain names no app, or one that wasn't
 * read, the tenant's own apps are searched instead. Returns a `certs` reason
 * for the row when the lookup could not be made.
 */
const certificateOf = (
  domain: { hostname: string; app: string | null },
  own: AppState[],
  byName: Map<string, AppState>,
  flyRead: boolean
): { state: string; error?: string } => {
  if (!flyRead) return { state: 'unknown' };
  const named = domain.app ? byName.get(domain.app) : undefined;
  if (named) {
    if (named.certs === null) return { state: 'unknown' };
    return {
      state: certificateIn(domain.hostname, [named]) ?? 'missing'
    };
  }
  const found = certificateIn(domain.hostname, own);
  if (found) return { state: found };
  if (domain.app) {
    return {
      state: 'unknown',
      error: `${domain.hostname}: ${domain.app} was not read`
    };
  }
  return {
    state: own.some((app) => app.certs === null) ? 'unknown' : 'missing'
  };
};

/**
 * The certificates of the host apps (`cdwr-<app>`), as Fly reports them; there is no recorded domain
 * to match. A hostname a tenant claims stays on that tenant's row only.
 */
const hostDomains = (apps: AppState[], claimed: ReadonlySet<string>) =>
  apps
    .filter((app) => app.app === `cdwr-${app.kind}`)
    .flatMap((app) =>
      (app.certs ?? [])
        .filter((c) => !claimed.has(c.hostname))
        .map((c) => ({
          hostname: c.hostname,
          app: app.kind,
          primary: false,
          certificate: c.state,
          recordedCertificate: null
        }))
    );

/**
 * One row per tenant plus the shared row, from what was read. A failed read
 * leaves an entry under its source name in `errors` of every row it would have
 * filled, so an empty list never reads as "none". The rows are built field by
 * field: nothing a source returns is spread into one.
 */
export const buildRows = (
  readings: PlatformReadings
): { rows: TenantStateRow[]; prune: string[] | null } => {
  const {
    at,
    tenants,
    db,
    fly,
    switches,
    sentry,
    visitors,
    deploy,
    releases,
    backup,
    dbPeak
  } = readings;
  const known = tenants.ok ? tenants.value : null;

  const errors = new Map<string, Errors>();
  const errorsOf = (key: string): Errors => {
    let own = errors.get(key);
    if (!own) errors.set(key, (own = {}));
    return own;
  };
  const apps = new Map<string, AppState[]>();
  // Every app read, by name, with its owner and why its certificates weren't read
  const byName = new Map<string, AppState>();
  const appInfo = new Map<string, { key: string; certsReason?: string }>();
  const switchList = new Map<string, SwitchRecord[]>();
  const visitorDays = daysBefore(stockholmDay(Date.parse(at)), VISITOR_DAYS);

  // Failures of a whole source show on every row it feeds
  const keys = [...(known?.map((t) => t.slug) ?? []), SHARED_KEY];
  for (const key of keys) errorsOf(key);
  if (!tenants.ok) note(errorsOf(SHARED_KEY), 'tenants', tenants.reason);
  if (!db.ok) note(errorsOf(SHARED_KEY), 'db', db.reason);
  else if (!db.value.seesAllSessions) {
    note(
      errorsOf(SHARED_KEY),
      'db',
      'platform role lacks pg_read_all_stats: connections counts only its own sessions'
    );
  }
  if (!fly.ok) for (const key of keys) note(errorsOf(key), 'fly', fly.reason);
  if (!switches.ok) {
    for (const key of keys) note(errorsOf(key), 'switches', switches.reason);
  }
  if (!sentry.ok) {
    for (const key of keys) note(errorsOf(key), 'sentry', sentry.reason);
  } else {
    for (const [slug, top] of Object.entries(sentry.value.tops)) {
      if (
        !top.ok &&
        (slug === SHARED_KEY || known?.some((t) => t.slug === slug))
      ) {
        note(errorsOf(slug), 'sentry', `top issue: ${top.reason}`);
      }
    }
  }
  if (!deploy.ok) note(errorsOf(SHARED_KEY), 'github', deploy.reason);
  if (releases.fetchError !== null) {
    note(errorsOf(SHARED_KEY), 'behind', releases.fetchError);
  }
  if (backup && !backup.lastRun.ok) {
    note(errorsOf(SHARED_KEY), 'backup', backup.lastRun.reason);
  }

  // Whether each tenant's app holds the gate password, by tenant slug and app kind
  const gated = new Map<string, boolean>();
  if (switches.ok && known) {
    for (const record of switches.value) {
      if (record.tenant === null || record.gated === undefined) continue;
      const tenant = tenantOf(record.tenant, known);
      if (tenant) gated.set(`${tenant.slug}\u0000${record.app}`, record.gated);
    }
  }

  if (fly.ok) {
    for (const reading of fly.value) {
      const owner = appOwner(reading.name, known);
      if (!owner) continue;
      const own = errorsOf(owner.key);
      const { behind, error } = behindFlag(
        owner.kind,
        reading.machines.ok ? reading.machines.value.map(machineState) : null,
        releases.projects
      );
      const project = projectOf(owner.kind);
      const release = project ? releases.projects[project] : undefined;
      if (error !== undefined) note(own, 'behind', `${reading.name}: ${error}`);
      if (!reading.machines.ok) {
        note(own, 'fly', `${reading.name}: ${reading.machines.reason}`);
      }
      if (!reading.certs.ok) {
        note(own, 'certs', `${reading.name}: ${reading.certs.reason}`);
      }
      const state = appState(
        reading,
        owner.kind,
        behind,
        release?.ok ? release.value : null,
        owner.key === SHARED_KEY
          ? undefined
          : gated.get(`${owner.key}\u0000${owner.kind}`)
      );
      apps.set(owner.key, [...(apps.get(owner.key) ?? []), state]);
      byName.set(reading.name, state);
      appInfo.set(reading.name, {
        key: owner.key,
        ...(reading.certs.ok ? {} : { certsReason: reading.certs.reason })
      });
    }
  }

  if (switches.ok) {
    for (const record of switches.value) {
      // A tenant's switch can't be placed while the tenants are unread
      if (record.tenant !== null && !known) continue;
      const tenant =
        record.tenant !== null && known
          ? tenantOf(record.tenant, known)
          : undefined;
      const key = tenant?.slug ?? SHARED_KEY;
      switchList.set(key, [...(switchList.get(key) ?? []), record]);
    }
  }

  const switchState = (key: string) =>
    (switchList.get(key) ?? []).map((s) => ({
      app: s.app,
      environment: s.environment,
      tenant: s.tenant,
      flag: s.flag
    }));

  const rows: TenantStateRow[] = (known ?? [])
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((t) => {
      const own = apps.get(t.slug) ?? [];
      const seen = t.statsWebsiteId ? visitors[t.slug] : undefined;
      if (t.statsWebsiteId) {
        if (!seen) note(errorsOf(t.slug), 'umami', 'not read');
        else if (!seen.ok) note(errorsOf(t.slug), 'umami', seen.reason);
      }
      // A named app on another row whose certificates weren't read: its
      // reason shows here too, once per app
      const noted = new Set<string>();
      const domains = t.domains.map((d) => {
        const { state, error } = certificateOf(d, own, byName, fly.ok);
        if (error !== undefined) note(errorsOf(t.slug), 'certs', error);
        const info = d.app ? appInfo.get(d.app) : undefined;
        if (
          d.app &&
          info?.certsReason !== undefined &&
          info.key !== t.slug &&
          !noted.has(d.app)
        ) {
          noted.add(d.app);
          note(errorsOf(t.slug), 'certs', `${d.app}: ${info.certsReason}`);
        }
        return {
          hostname: d.hostname,
          app: d.app,
          primary: d.primary,
          certificate: state,
          recordedCertificate: d.certificateStatus
        };
      });
      return {
        key: t.slug,
        at,
        name: t.name,
        deployment: t.deployment,
        status: t.status,
        apps: own,
        domains,
        switches: switchState(t.slug),
        db: {},
        sentry: sentry.ok ? sentrySignal(sentry.value, t.slug) : {},
        visitors: seen?.ok ? visitorsSignal(seen.value, visitorDays) : {},
        deploy: {},
        backup: {},
        errors: errorsOf(t.slug)
      };
    });

  rows.push({
    key: SHARED_KEY,
    at,
    name: null,
    deployment: null,
    status: null,
    apps: apps.get(SHARED_KEY) ?? [],
    domains: hostDomains(
      apps.get(SHARED_KEY) ?? [],
      new Set((known ?? []).flatMap((t) => t.domains.map((d) => d.hostname)))
    ),
    switches: switchState(SHARED_KEY),
    db: db.ok
      ? {
          sizeBytes: db.value.sizeBytes,
          sessions: db.value.sessions,
          poolerSessions: db.value.poolerSessions,
          // Unknown rather than the role's own session, which would read as fine
          connections: db.value.seesAllSessions ? db.value.connections : null,
          // What a role without superuser can use
          limit: db.value.maxConnections - db.value.reservedConnections,
          peak:
            dbPeak && dbPeak.peak.connections !== null
              ? {
                  connections: dbPeak.peak.connections,
                  at: plainText(dbPeak.peak.at, 40)
                }
              : null,
          opened: dbPeak?.opened ?? null,
          byApplication: db.value.seesAllSessions
            ? Object.fromEntries(Object.entries(db.value.byApplication))
            : {}
        }
      : {},
    sentry: sentry.ok ? sentrySignal(sentry.value, SHARED_KEY) : {},
    visitors: {},
    deploy: deploy.ok
      ? {
          runId: deploy.value.runId,
          sha: deploy.value.sha,
          conclusion: deploy.value.conclusion,
          url: deploy.value.url,
          at: deploy.value.at
        }
      : {},
    backup: backup ? backupSignal(backup) : {},
    errors: errorsOf(SHARED_KEY)
  });

  // A vanished tenant's row goes only when the tenants were read: a failed read is not "none"
  return { rows, prune: known ? rows.map((r) => r.key) : null };
};

/** The value of PostgREST's `key=` filter that selects the rows whose key is none of `keep` */
export const vanishedFilter = (keep: string[]): string =>
  `not.in.(${keep
    .map((k) => `"${k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',')})`;

/** The one query's reading as the two readings `buildRows` takes */
export const splitDatabase = (
  reading: Reading<{ tenants: TenantRecord[]; db: DbRecord }>
): { tenants: Reading<TenantRecord[]>; db: Reading<DbRecord> } =>
  reading.ok
    ? {
        tenants: ok(reading.value.tenants),
        db: ok(reading.value.db)
      }
    : { tenants: reading, db: reading };
