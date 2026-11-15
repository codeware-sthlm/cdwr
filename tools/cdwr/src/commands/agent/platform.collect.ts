import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { cdwrHome } from '../../cli/prefs';
import { belongsTo, fly, listAppNames } from '../../services/fly';
import { CommandError, childEnv, run } from '../../services/shell';
import { deployments, tenancyConfig } from '../../services/tenancy';
import { websiteDays, websiteStats } from '../../services/umami';
import { APPS } from '../infisical/analysis.logic';

import {
  type AffectedCache,
  type AffectedPair,
  type DbRecord,
  type DeployRead,
  type FlyAppReading,
  type HealthInput,
  type Reading,
  STATS_TIMEZONE,
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
  libpqEnv,
  ok,
  oneLine,
  pairKey,
  parseAffectedCache,
  parseSql,
  pruneAffected,
  stockholmDay,
  switchRecords,
  uncachedPairs
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

/** `GET /api/health` of an app: down is a result, not a failed read */
export async function readHealth(app: string): Promise<HealthInput> {
  const started = Date.now();
  try {
    const response = await fetch(`https://${app}.fly.dev/api/health`, {
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
export async function readFly(): Promise<Reading<FlyAppReading[]>> {
  let names: string[];
  try {
    names = (await listAppNames()).filter(
      (name) => name.startsWith('cdwr-') && belongsTo(name, 'production')
    );
  } catch (error) {
    return failed(error);
  }
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
      readHealth(name)
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
  data: z.array(z.object({ tenant: z.string(), 'count()': z.number() }))
});

const IssuesSchema = z.array(
  z.object({
    shortId: z.string(),
    level: z.string(),
    count: z.union([z.string(), z.number()]).transform(Number),
    title: z.string()
  })
);

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

/** Errors per tenant tag over 24 hours and 7 days, and the top unresolved issue of every tenant with errors today */
export async function readSentry(
  env: NodeJS.ProcessEnv
): Promise<Reading<SentryRead>> {
  const [token, org] = SENTRY_ENVS.map((n) => env[n]);
  if (!token || !org) return failed('not configured');
  try {
    const events = `/organizations/${encodeURIComponent(org)}/events/`;
    const grouped = (statsPeriod: string) =>
      sentryGet(
        token,
        events,
        [
          ['field', 'tenant'],
          ['field', 'count()'],
          ['query', 'has:tenant'],
          ['dataset', 'errors'],
          ['statsPeriod', statsPeriod],
          ['per_page', '100']
        ],
        GroupedSchema
      );
    const [day, week] = await Promise.all([grouped('24h'), grouped('7d')]);
    const counts = (g: z.infer<typeof GroupedSchema>) =>
      Object.fromEntries(g.data.map((r) => [r.tenant, r['count()']]));
    const dayCounts = counts(day);

    const tops: SentryRead['tops'] = Object.fromEntries(
      await Promise.all(
        Object.entries(dayCounts)
          .filter(([, count]) => count > 0)
          .map(async ([slug]): Promise<[string, Reading<SentryTop | null>]> => {
            try {
              const [issue] = await sentryGet(
                token,
                `/organizations/${encodeURIComponent(org)}/issues/`,
                [
                  ['query', `is:unresolved tenant:${slug}`],
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
          })
      )
    );
    return ok({ org, day: dayCounts, week: counts(week), tops });
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

async function githubGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
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

/** The last completed deploy run of main (public repository, no token) and what its deploy job concluded */
export async function readDeploy(): Promise<Reading<DeployRead>> {
  try {
    const { workflow_runs } = await githubGet(
      '/actions/workflows/fly-deployment.yml/runs?branch=main&event=push&status=completed&per_page=1',
      RunsSchema
    );
    const latest = workflow_runs[0];
    if (!latest) return failed('no completed deploy run of main');
    const { jobs } = await githubGet(
      `/actions/runs/${latest.id}/jobs?per_page=100`,
      JobsSchema
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

// --- behind main ---

const NX_TIMEOUT_MS = 120_000;
/** No new Nx run starts after this, so the command's deadline holds; the pair is asked again next run */
const NX_BUDGET_MS = 100_000;

const queueHome = (env: NodeJS.ProcessEnv): string =>
  env['AGENT_QUEUE_HOME'] ?? join(cdwrHome(env), 'agent-queue');

const readCache = (file: string): AffectedCache => {
  try {
    return parseAffectedCache(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
};

/** The projects Nx finds affected between two commits of the local checkout */
async function affectedBetween(
  root: string,
  pair: AffectedPair,
  env: NodeJS.ProcessEnv
): Promise<Reading<string[]>> {
  try {
    for (const sha of [pair.base, pair.head]) {
      await run('git', ['-C', root, 'cat-file', '-e', `${sha}^{commit}`]).catch(
        () => {
          throw new Error('the commit is not in the local git');
        }
      );
    }
    const { stdout } = await run(
      'pnpm',
      [
        'exec',
        'nx',
        'show',
        'projects',
        '--affected',
        `--base=${pair.base}`,
        `--head=${pair.head}`,
        '--json'
      ],
      {
        cwd: root,
        env: childEnv(env, { NX_DAEMON: 'false', NX_NO_CLOUD: 'true' }),
        timeout: NX_TIMEOUT_MS
      }
    ).catch((error: unknown) => {
      // The command line and stderr are not for the table
      throw new Error(
        `nx failed (${error instanceof CommandError ? error.code : 'unknown'})`
      );
    });
    const line = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('['))
      .pop();
    const parsed = z.array(z.string()).safeParse(JSON.parse(line ?? 'null'));
    if (!parsed.success) throw new Error('nx printed no project list');
    return ok(parsed.data);
  } catch (error) {
    return failed(error);
  }
}

/**
 * The affected projects of each pair. A pair seen before comes from the cache
 * beside the queue's state, so Nx only runs when a new pair of shas appears.
 */
export async function readAffected(
  pairs: AffectedPair[],
  env: NodeJS.ProcessEnv
): Promise<Record<string, Reading<string[]>>> {
  const result: Record<string, Reading<string[]>> = {};
  if (pairs.length === 0) return result;
  const file = join(queueHome(env), 'platform-affected.json');
  let cache = readCache(file);
  for (const entry of cache) result[entry.key] = ok(entry.projects);

  const todo = uncachedPairs(pairs, cache);
  if (todo.length === 0) return result;

  let root: string;
  try {
    root = (await run('git', ['rev-parse', '--show-toplevel'])).stdout.trim();
  } catch {
    for (const pair of todo) {
      result[pairKey(pair)] = failed(
        'the working directory is not a git checkout'
      );
    }
    return result;
  }
  const started = Date.now();
  let changed = false;
  for (const pair of todo) {
    const key = pairKey(pair);
    if (Date.now() - started > NX_BUDGET_MS) {
      result[key] = failed('out of time, asked again next run');
      continue;
    }
    const reading = await affectedBetween(root, pair, env);
    result[key] = reading;
    if (reading.ok) {
      cache = [...cache, { key, projects: reading.value }];
      changed = true;
    }
  }
  if (changed) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(pruneAffected(cache)));
    } catch {
      // The cache only saves work; the readings stand
    }
  }
  return result;
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
