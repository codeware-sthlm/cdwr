import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { backupsRoot, listBackups } from '../../services/backups';
import { belongsTo, fly, listAppNames } from '../../services/fly';
import { CommandError, childEnv, run } from '../../services/shell';
import { deployments, tenancyConfig } from '../../services/tenancy';
import { websiteDays, websiteStats } from '../../services/umami';
import { APPS } from '../infisical/analysis.logic';

import { type PlatformAlerts, PlatformAlertsSchema } from './platform.alerts';
import {
  type BackupRead,
  type DbPeak,
  DbPeakSchema,
  type DbRecord,
  type DeployRead,
  type FlyAppReading,
  type HealthInput,
  type MachineRelease,
  type Reading,
  type ReleaseRead,
  type ReleasesRead,
  SHARED_KEY,
  STATS_TIMEZONE,
  type SentryFresh,
  type SentryRead,
  type SentryTop,
  type SwitchRecord,
  type TenantRecord,
  VISITOR_DAYS,
  type VisitorsRead,
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
  releaseTag,
  stockholmDay,
  switchRecords
} from './platform.logic';

export const DATABASE_URL_ENV = 'PLATFORM_DATABASE_URL';
export const INFISICAL_ENVS = [
  'PLATFORM_INFISICAL_CLIENT_ID',
  'PLATFORM_INFISICAL_CLIENT_SECRET',
  'PLATFORM_INFISICAL_PROJECT_ID'
] as const;

const SQL_FILE = join(dirname(fileURLToPath(import.meta.url)), 'platform.sql');
const HEALTH_TIMEOUT_MS = 10_000;
const PSQL_TIMEOUT_MS = 30_000;
const HTTP_TIMEOUT_MS = 15_000;

/** Tenants and database figures, from the read-only query beside this file */
export async function readDatabase(
  env: NodeJS.ProcessEnv
): Promise<Reading<{ tenants: TenantRecord[]; db: DbRecord }>> {
  const url = env[DATABASE_URL_ENV];
  if (!url) return failed(`${DATABASE_URL_ENV} is not set`);
  try {
    // The connection string goes through the child's env, never its arguments or our output
    const { stdout } = await run(
      'psql',
      [
        '--no-psqlrc',
        '-X',
        '-q',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        SQL_FILE
      ],
      {
        env: childEnv(env, { ...libpqEnv(url), PGCONNECT_TIMEOUT: '10' }),
        timeout: PSQL_TIMEOUT_MS
      }
    );
    return ok(parseSql(stdout));
  } catch (error) {
    // A CommandError names the command and its stderr, which can quote the connection
    return failed(
      error instanceof CommandError
        ? `psql failed (${error.code}): ${error.stderr}`
        : error
    );
  }
}

/** The fly.toml of each app folder as raw text; an unreadable one is left out */
function readTomls(root: string): Record<string, string> {
  const tomls: Record<string, string> = {};
  let folders: string[] = [];
  try {
    folders = readdirSync(join(root, 'apps'));
  } catch {
    return tomls;
  }
  for (const folder of folders) {
    try {
      tomls[folder] = readFileSync(
        join(root, 'apps', folder, 'fly.toml'),
        'utf8'
      );
    } catch {
      continue;
    }
  }
  return tomls;
}

/** `GET` of an app's health check path (its `fly.toml`'s): down is a result, not a failed read */
export async function readHealth(
  app: string,
  path: string
): Promise<HealthInput> {
  const started = Date.now();
  try {
    const response = await fetch(`https://${app}.fly.dev${path}`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    await response.body?.cancel();
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: oneLine(error)
    };
  }
}

/** Machines, certificates and health of every production `cdwr-*` app */
export async function readFly(root: string): Promise<Reading<FlyAppReading[]>> {
  let names: string[];
  try {
    names = (await listAppNames()).filter(
      (name) => name.startsWith('cdwr-') && belongsTo(name, 'production')
    );
  } catch (error) {
    return failed(error);
  }
  const checks = healthChecksOf(readTomls(root));
  const apps: FlyAppReading[] = [];
  for (const name of names) {
    const [machines, certs, health] = await Promise.all([
      fly()
        .status({ app: name })
        .then((status) =>
          status ? ok(status.machines) : failed(`${name} was not found`)
        )
        .catch(failed),
      fly()
        .certs.list({ app: name })
        .then((list) =>
          ok(
            list.map(({ hostname, clientStatus }) => ({
              hostname,
              clientStatus
            }))
          )
        )
        .catch(failed),
      readHealth(name, healthPath(name, checks))
    ]);
    apps.push({ name, machines, certs, health });
  }
  return ok(apps);
}

// --- sentry ---

export const SENTRY_ENVS = [
  'PLATFORM_SENTRY_AUTH_TOKEN',
  'PLATFORM_SENTRY_ORG'
] as const;
const SENTRY_BASE = 'https://sentry.io/api/0';

const GroupedSchema = z.object({
  data: z.array(
    z.object({ tenant: z.string().nullish(), 'count()': z.number() })
  )
});

const IssuesSchema = z.array(
  z.object({
    shortId: z.string(),
    level: z.string(),
    count: z.union([z.string(), z.number()]).transform(Number),
    title: z.string()
  })
);

const FreshSchema = z.array(
  z.object({
    shortId: z.string(),
    level: z.string(),
    title: z.string(),
    firstSeen: z.string()
  })
);

/** The most new issues kept per row */
const FRESH_LIMIT = '25';

/** One Sentry read; a refusal is named by its status, never by its body or the token */
async function sentryGet<T>(
  token: string,
  path: string,
  params: Array<[string, string]>,
  schema: z.ZodType<T>
): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${SENTRY_BASE}${path}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Sentry answered ${response.status}`);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Sentry answered an unexpected shape');
  return parsed.data;
}

/** Errors per tenant tag (untagged events on the shared key) over 24 hours and 7 days, the open (unresolved) ones of the 24 hours, and the top and the newest (first seen on production in the last 24 hours) unresolved issues of every tenant with open errors */
export async function readSentry(
  env: NodeJS.ProcessEnv
): Promise<Reading<SentryRead>> {
  const [token, org] = SENTRY_ENVS.map((n) => env[n]);
  if (!token || !org) return failed('not configured');
  try {
    const events = `/organizations/${encodeURIComponent(org)}/events/`;
    const grouped = (statsPeriod: string, query?: string) =>
      sentryGet(
        token,
        events,
        [
          ['field', 'tenant'],
          ['field', 'count()'],
          ['dataset', 'errors'],
          ['statsPeriod', statsPeriod],
          ['per_page', '100'],
          ...(query ? [['query', query] satisfies [string, string]] : [])
        ],
        GroupedSchema
      );
    const [day, week, open] = await Promise.all([
      grouped('24h'),
      grouped('7d'),
      grouped('24h', 'is:unresolved')
    ]);
    // Untagged rows come as '' or null, and both fold onto the shared key
    const counts = (g: z.infer<typeof GroupedSchema>) =>
      g.data.reduce<Record<string, number>>((acc, r) => {
        const key = r.tenant || SHARED_KEY;
        acc[key] = (acc[key] ?? 0) + r['count()'];
        return acc;
      }, {});
    const dayCounts = counts(day);
    const openCounts = counts(open);

    const issuesPath = `/organizations/${encodeURIComponent(org)}/issues/`;
    const tenantQuery = (slug: string, base: string) =>
      `${base} ${slug === SHARED_KEY ? '!has:tenant' : `tenant:${slug}`}`;
    const withOpenEvents = Object.entries(openCounts).filter(
      ([, count]) => count > 0
    );

    const tops: SentryRead['tops'] = Object.fromEntries(
      await Promise.all(
        withOpenEvents.map(
          async ([slug]): Promise<[string, Reading<SentryTop | null>]> => {
            try {
              const [issue] = await sentryGet(
                token,
                issuesPath,
                [
                  ['query', tenantQuery(slug, 'is:unresolved')],
                  ['statsPeriod', '24h'],
                  ['sort', 'freq'],
                  ['limit', '1']
                ],
                IssuesSchema
              );
              return [
                slug,
                ok(
                  issue
                    ? {
                        shortId: issue.shortId,
                        level: issue.level,
                        count: issue.count,
                        title: issue.title
                      }
                    : null
                )
              ];
            } catch (error) {
              return [slug, failed(error)];
            }
          }
        )
      )
    );
    const fresh: SentryRead['fresh'] = Object.fromEntries(
      await Promise.all(
        withOpenEvents.map(
          async ([slug]): Promise<[string, Reading<SentryFresh[]>]> => {
            try {
              const issues = await sentryGet(
                token,
                issuesPath,
                [
                  [
                    'query',
                    tenantQuery(
                      slug,
                      'is:unresolved firstSeen:-24h environment:production level:[error,fatal]'
                    )
                  ],
                  ['sort', 'new'],
                  ['limit', FRESH_LIMIT]
                ],
                FreshSchema
              );
              return [slug, ok(issues)];
            } catch (error) {
              return [slug, failed(error)];
            }
          }
        )
      )
    );
    return ok({
      org,
      day: dayCounts,
      week: counts(week),
      open: openCounts,
      tops,
      fresh
    });
  } catch (error) {
    return failed(error);
  }
}

// --- umami ---

export const UMAMI_ENVS = [
  'PLATFORM_UMAMI_URL',
  'PLATFORM_UMAMI_API_KEY'
] as const;

/** Visitors of today so far and of the 7 days before, for every tenant with a statistics website */
export async function readVisitors(
  env: NodeJS.ProcessEnv,
  tenants: TenantRecord[] | null,
  now: Date
): Promise<Record<string, Reading<VisitorsRead>>> {
  const withSite = (tenants ?? []).flatMap((t) =>
    t.statsWebsiteId ? [{ slug: t.slug, id: t.statsWebsiteId }] : []
  );
  const [url, apiKey] = UMAMI_ENVS.map((n) => env[n]);
  if (!url || !apiKey) {
    return Object.fromEntries(
      withSite.map((t) => [t.slug, failed('not configured')])
    );
  }
  const conn = { url, apiKey };
  const today = stockholmDay(now.getTime());
  const todayStart = dayStart(today);
  const first = daysBefore(today, VISITOR_DAYS)[0] ?? today;
  const entries = await Promise.all(
    withSite.map(
      async ({ slug, id }): Promise<[string, Reading<VisitorsRead>]> => {
        try {
          const [stats, days] = await Promise.all([
            websiteStats(conn, id, {
              startAt: todayStart,
              endAt: now.getTime()
            }),
            websiteDays(conn, id, {
              startAt: dayStart(first),
              endAt: todayStart - 1,
              timezone: STATS_TIMEZONE
            })
          ]);
          return [slug, ok({ today: stats.visitors, days })];
        } catch (error) {
          // A zod error would quote the answer
          return [
            slug,
            failed(
              error instanceof z.ZodError
                ? 'Umami answered an unexpected shape'
                : error
            )
          ];
        }
      }
    )
  );
  return Object.fromEntries(entries);
}

// --- github ---

const REPO = 'codeware-sthlm/cdwr';
const RunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      head_sha: z.string(),
      html_url: z.string(),
      updated_at: z.string()
    })
  )
});
const JobsSchema = z.object({
  jobs: z.array(
    z.object({ name: z.string(), conclusion: z.string().nullable() })
  )
});

/** A read-only token run.sh mints for the step; without it the reads draw on the IP's anonymous 60 an hour */
export const GITHUB_TOKEN_ENV = 'PLATFORM_GITHUB_TOKEN';

async function githubGet<T>(
  path: string,
  schema: z.ZodType<T>,
  token: string | undefined
): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`GitHub answered ${response.status}`);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error('GitHub answered an unexpected shape');
  return parsed.data;
}

/**
 * The last completed deploy run of main (public repository, signed when run.sh gave a token) and
 * what its deploy job concluded. A manual run on main counts as well as a push: it is how a
 * production redeploy starts.
 */
export async function readDeploy(
  env: NodeJS.ProcessEnv
): Promise<Reading<DeployRead>> {
  const token = env[GITHUB_TOKEN_ENV] || undefined;
  try {
    const { workflow_runs } = await githubGet(
      '/actions/workflows/fly-deployment.yml/runs?branch=main&status=completed&per_page=1',
      RunsSchema,
      token
    );
    const latest = workflow_runs[0];
    if (!latest) return failed('no completed deploy run of main');
    const { jobs } = await githubGet(
      `/actions/runs/${latest.id}/jobs?per_page=100`,
      JobsSchema,
      token
    );
    return ok({
      runId: latest.id,
      sha: latest.head_sha,
      conclusion: deployConclusion(jobs),
      url: latest.html_url,
      at: latest.updated_at
    });
  } catch (error) {
    return failed(error);
  }
}

// --- behind the release ---

const FETCH_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
/** After the fetch; a read started just before it can add three git timeouts */
const RELEASES_BUDGET_MS = 60_000;
const OUT_OF_TIME = 'out of time, read again next run';

/** A git read in the checkout; the command line and stderr are not for the table */
const git = (root: string, args: string[]) =>
  run('git', ['-C', root, ...args], { timeout: GIT_TIMEOUT_MS });

const codeOf = (error: unknown) =>
  error instanceof CommandError ? error.code : 'unknown';

/** The newest production release tag of a project on main */
async function latestTag(
  root: string,
  project: string
): Promise<string | null> {
  const { stdout } = await git(root, [
    'tag',
    '--list',
    `${project}-*`,
    '--merged',
    'origin/main',
    '--sort=-v:refname'
  ]).catch((error: unknown) => {
    throw new Error(`git tag failed (${codeOf(error)})`);
  });
  for (const line of stdout.split('\n')) {
    const tag = releaseTag(project, line.trim());
    if (tag) return tag;
  }
  return null;
}

/** What a machine's commit holds of a project's releases, against the latest tag */
async function machineRelease(
  root: string,
  project: string,
  sha: string,
  latest: string | null
): Promise<Reading<MachineRelease>> {
  try {
    await git(root, ['cat-file', '-e', `${sha}^{commit}`]).catch(() => {
      throw new Error('the commit is not in the local git');
    });
    // No production tag in its history is a version of null, not a failure
    const version = await git(root, [
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      `${project}-*`,
      '--exclude',
      '*-preview.*',
      sha
    ]).then(
      ({ stdout }) => releaseTag(project, stdout.trim()),
      () => null
    );
    if (latest === null) return ok({ version, current: true });
    // Exit 1 is "not an ancestor"; anything else is a failed read
    const current = await git(root, [
      'merge-base',
      '--is-ancestor',
      `refs/tags/${latest}`,
      sha
    ]).then(
      () => true,
      (error: unknown) => {
        if (codeOf(error) === 1) return false;
        throw new Error(`git merge-base failed (${codeOf(error)})`);
      }
    );
    return ok({ version, current });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Per project, its newest production release tag on main, and for each commit
 * its machines run the newest tag that commit holds and whether it holds the
 * latest. Tags are fetched first, since a paused tick skips the checkout's own
 * fetch; when that fails the local tags are used and the reason is returned.
 * No new read starts after `budgetMs`, so the command's deadline holds; what
 * is left is a failed read, asked again next run.
 */
export async function readReleases(
  root: string,
  shas: Record<string, string[]>,
  budgetMs = RELEASES_BUDGET_MS
): Promise<ReleasesRead> {
  const projects: ReleasesRead['projects'] = {};
  if (Object.keys(shas).length === 0) return { fetchError: null, projects };
  const fetchError = await run(
    'git',
    ['-C', root, 'fetch', '--tags', '-q', 'origin'],
    { timeout: FETCH_TIMEOUT_MS }
  ).then(
    () => null,
    (error: unknown) => `git fetch failed (${codeOf(error)}), local tags used`
  );
  const started = Date.now();
  const late = () => Date.now() - started > budgetMs;
  for (const [project, list] of Object.entries(shas)) {
    if (late()) {
      projects[project] = failed(OUT_OF_TIME);
      continue;
    }
    try {
      const latest = await latestTag(root, project);
      const machines: ReleaseRead['machines'] = {};
      for (const sha of list) {
        machines[sha] = late()
          ? failed(OUT_OF_TIME)
          : await machineRelease(root, project, sha, latest);
      }
      projects[project] = ok({ latest, machines });
    } catch (error) {
      projects[project] = failed(error);
    }
  }
  return { fetchError, projects };
}

// --- backup ---

const BackupStatusSchema = z.object({
  at: z.string(),
  ok: z.boolean(),
  error: z.string().nullable()
});

/**
 * What `cdwr agent backup` left under AGENT_QUEUE_HOME: the dumps, the size of
 * the newest, and its status file. Null when the home is unset or holds
 * neither; an unreadable status file is a failed reading of its own.
 */
export function readBackup(env: NodeJS.ProcessEnv): BackupRead | null {
  const home = env['AGENT_QUEUE_HOME'];
  if (!home) return null;
  const dumps = listBackups(home);
  const statusFile = join(home, 'backup-status.json');

  let lastRun: BackupRead['lastRun'] = ok(null);
  if (existsSync(statusFile)) {
    try {
      const parsed = BackupStatusSchema.safeParse(
        JSON.parse(readFileSync(statusFile, 'utf8'))
      );
      lastRun = parsed.success
        ? ok(parsed.data)
        : failed('backup-status.json has an unexpected shape');
    } catch {
      // The parse error would quote the file
      lastRun = failed('backup-status.json could not be read');
    }
  } else if (dumps.length === 0) {
    return null;
  }

  const [first] = dumps;
  let bytes: number | null = null;
  if (first) {
    try {
      const dir = join(backupsRoot(home), first.name);
      bytes =
        statSync(join(dir, 'schema.sql')).size +
        statSync(join(dir, 'data.sql')).size;
    } catch {
      bytes = null;
    }
  }
  return {
    newest: first ? { name: first.name, takenAt: first.takenAt, bytes } : null,
    count: dumps.length,
    lastRun
  };
}

// --- the day's connection peak ---

const DB_PEAK_FILE = 'db-peak.json';

/**
 * The peak the last tick left under AGENT_QUEUE_HOME. Null when the home is
 * unset, or the file is missing or unreadable: the tick then starts afresh.
 */
export function readDbPeak(env: NodeJS.ProcessEnv): DbPeak | null {
  const home = env['AGENT_QUEUE_HOME'];
  if (!home) return null;
  try {
    const parsed = DbPeakSchema.safeParse(
      JSON.parse(readFileSync(join(home, DB_PEAK_FILE), 'utf8'))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Keeps this tick's peak for the next one; a no-op without a queue home */
export function writeDbPeak(env: NodeJS.ProcessEnv, peak: DbPeak): void {
  const home = env['AGENT_QUEUE_HOME'];
  if (!home) return;
  // A rename, so a tick killed mid-write leaves the old file whole
  const file = join(home, DB_PEAK_FILE);
  writeFileSync(`${file}.partial`, `${JSON.stringify(peak)}\n`);
  renameSync(`${file}.partial`, file);
}

// --- the urgent problems already told ---

const ALERTS_FILE = 'platform-alerts.json';

/**
 * The problem keys the last tick told about, under AGENT_QUEUE_HOME. Null when the home is
 * unset, or the file is missing or unreadable: the tick then seeds it, silently.
 */
export function readPlatformAlerts(
  env: NodeJS.ProcessEnv
): PlatformAlerts | null {
  const home = env['AGENT_QUEUE_HOME'];
  if (!home) return null;
  try {
    const parsed = PlatformAlertsSchema.safeParse(
      JSON.parse(readFileSync(join(home, ALERTS_FILE), 'utf8'))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Keeps the keys told for the next tick; a no-op without a queue home */
export function writePlatformAlerts(
  env: NodeJS.ProcessEnv,
  alerts: PlatformAlerts
): void {
  const home = env['AGENT_QUEUE_HOME'];
  if (!home) return;
  const file = join(home, ALERTS_FILE);
  writeFileSync(`${file}.partial`, `${JSON.stringify(alerts)}\n`);
  renameSync(`${file}.partial`, file);
}

const NOTIFY_TIMEOUT_MS = 30_000;

/** What notify.sh reads: nothing of the collector's credentials */
const NOTIFY_ENV = [
  'PATH',
  'HOME',
  'AGENT_QUEUE_HOME',
  'AGENT_QUEUE_NOTIFY_SPOOL',
  'AGENT_QUEUE_CURL_CMD',
  'SLACK_WEBHOOK_URL',
  'CLAUDE_SLACK_WEBHOOK'
] as const;

/** The environment notify.sh runs with, picked from `env` */
export const notifyEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    NOTIFY_ENV.flatMap((name) =>
      env[name] === undefined ? [] : [[name, env[name]]]
    )
  );

/** One urgent notice through the queue home's notify.sh (no shell); false when it did not exit 0 */
export async function sendNotice(
  env: NodeJS.ProcessEnv,
  text: string
): Promise<boolean> {
  const home = env['AGENT_QUEUE_HOME'];
  if (!home) return false;
  try {
    await run(
      join(home, 'notify.sh'),
      ['--level', 'urgent', '--source', 'platform', text],
      // Strict through the environment, which a notify.sh older than the flag ignores
      {
        env: { ...notifyEnv(env), AGENT_QUEUE_NOTIFY_STRICT: '1' },
        timeout: NOTIFY_TIMEOUT_MS
      }
    );
    return true;
  } catch {
    return false;
  }
}

/** The deploy switches of production, through the Infisical tenancy lib; never a secret value */
export async function readSwitches(
  env: NodeJS.ProcessEnv
): Promise<Reading<SwitchRecord[]>> {
  const [clientId, clientSecret, projectId] = INFISICAL_ENVS.map((n) => env[n]);
  if (!clientId || !clientSecret || !projectId) {
    return failed(`${INFISICAL_ENVS.join(', ')} are not all set`);
  }
  try {
    // The tenancy config is passed whole instead of putting these into process.env
    const config = tenancyConfig(
      {
        INFISICAL_CLIENT_ID: clientId,
        INFISICAL_CLIENT_SECRET: clientSecret,
        INFISICAL_PROJECT_ID: projectId
      },
      'production'
    );
    const plan = await deployments(config, [...APPS]);
    return ok(switchRecords('production', plan.deployments, plan.skipped));
  } catch (error) {
    return failed(error);
  }
}
