import { defineCommand } from '../../cli/command';
import { keyHeaders } from '../../services/supabase-rest';

import {
  DATABASE_URL_ENV,
  readBackup,
  readDatabase,
  readDbPeak,
  readDeploy,
  readFly,
  readReleases,
  readSentry,
  readSwitches,
  readVisitors,
  writeDbPeak
} from './platform.collect';
import {
  type DbPeak,
  type TenantStateRow,
  buildRows,
  mergePeak,
  releaseShas,
  splitDatabase,
  vanishedFilter
} from './platform.logic';

const URL_ENV = 'AGENT_SUPABASE_URL';
const KEY_ENV = 'AGENT_SUPABASE_SERVICE_KEY';
const TABLE = 'tenant_state';
const DEADLINE_MS = 240_000;

interface Data {
  rows: TenantStateRow[];
  /** Keys that stay; null when the tenants weren't read, which deletes nothing */
  prune: string[] | null;
  url: string;
  key: string;
  /** Kept for the next tick once the rows are sent; null when the database wasn't read */
  peak: DbPeak | null;
}

const none = (): Data => ({
  rows: [],
  prune: null,
  url: '',
  key: '',
  peak: null
});

export default defineCommand({
  summary: 'Send the platform state to the telemetry database',
  description: `Reads the tenants and database figures (psql, read-only), the Fly apps with their machines, certificates and health, and the deploy switches (Infisical), and upserts one row per tenant plus a shared row into the tenant_state table of the agent-queue Supabase project, through PostgREST with the service key. A source that fails is named in that row's errors and never recorded as empty; rows of tenants that no longer exist are deleted only when the tenants were read. Needs ${URL_ENV}, ${KEY_ENV} and ${DATABASE_URL_ENV}; without them it does nothing. The Fly CLI reads FLY_API_TOKEN, the switches PLATFORM_INFISICAL_CLIENT_ID, PLATFORM_INFISICAL_CLIENT_SECRET and PLATFORM_INFISICAL_PROJECT_ID. It also reads the errors per tenant from Sentry (PLATFORM_SENTRY_AUTH_TOKEN, PLATFORM_SENTRY_ORG), the visitors per tenant from Umami (PLATFORM_UMAMI_URL, PLATFORM_UMAMI_API_KEY), the last deploy of main from GitHub (public, no token), and the release each app's machines run: the newest \`<project>-<version>\` tag their commit holds in this checkout (tags fetched first). An app is behind when some machine's commit doesn't hold the project's newest release tag on main, the rule that decides a deploy. The backups \`cdwr agent backup\` left there (the newest, how many, its size and how the last run went) go on the shared row, and so do the client connections against the usable limit, the day's peak and the sessions opened since the last run, kept in db-peak.json there. Only states, names and counts leave the machine, never a secret value.`,
  danger: 'mutate',
  // The scheduler runs it every run
  history: false,
  inputs: {},

  async plan(ctx) {
    const url = ctx.env[URL_ENV];
    const key = ctx.env[KEY_ENV];
    const missing = [URL_ENV, KEY_ENV, DATABASE_URL_ENV].filter(
      (name) => !ctx.env[name]
    );
    if (!url || !key || missing.length > 0) {
      return {
        steps: [],
        nothing: `${missing.join(', ')} not set; nothing recorded`,
        data: none()
      };
    }
    // One deadline: a hung CLI would otherwise hold the scheduler's tick
    const guard = setTimeout(() => process.exit(1), DEADLINE_MS);
    guard.unref();

    const database = await readDatabase(ctx.env);
    const now = new Date();
    const split = splitDatabase(database);
    // A role that sees only its own sessions would record a peak of 1 for the
    // day; the sessions opened are counted from pg_stat_database all the same
    const dbPeak = split.db.ok
      ? mergePeak(readDbPeak(ctx.env), {
          at: now.toISOString(),
          connections: split.db.value.seesAllSessions
            ? split.db.value.connections
            : null,
          sessionsOpened: split.db.value.sessionsOpened
        })
      : null;
    const [fly, switches, sentry, visitors, deploy] = await Promise.all([
      readFly(ctx.root),
      readSwitches(ctx.env),
      readSentry(ctx.env),
      readVisitors(ctx.env, split.tenants.ok ? split.tenants.value : null, now),
      readDeploy()
    ]);
    // Behind the release needs the machines' commits
    const releases = await readReleases(
      ctx.root,
      fly.ok ? releaseShas(fly.value) : {}
    );
    const { rows, prune } = buildRows({
      at: now.toISOString(),
      ...split,
      fly,
      switches,
      sentry,
      visitors,
      deploy,
      releases,
      backup: readBackup(ctx.env),
      dbPeak
    });
    clearTimeout(guard);

    if (ctx.flags.dryRun) {
      ctx.ui.table(
        ['key', 'apps', 'domains', 'switches', 'errors'],
        rows.map((r) => [
          r.key,
          String(Array.isArray(r.apps) ? r.apps.length : 0),
          String(Array.isArray(r.domains) ? r.domains.length : 0),
          String(Array.isArray(r.switches) ? r.switches.length : 0),
          Object.keys(r.errors ?? {}).join(', ') || '—'
        ])
      );
    }
    const endpoint = url.replace(/\/$/, '');
    const steps = [
      {
        label: `Upsert ${rows.length} ${TABLE} rows`,
        detail: `${endpoint}/rest/v1/${TABLE}`
      }
    ];
    if (prune) {
      steps.push({
        label: `Delete ${TABLE} rows of tenants that are gone`,
        detail: `${endpoint}/rest/v1/${TABLE}`
      });
    }
    return {
      steps,
      data: { rows, prune, url, key, peak: dbPeak?.peak ?? null }
    };
  },

  async apply(ctx, { rows, prune, url, key, peak }) {
    const deadline = AbortSignal.timeout(60_000);
    const base = url.replace(/\/$/, '');
    const headers = keyHeaders(key);

    const upsert = await fetch(`${base}/rest/v1/${TABLE}?on_conflict=key`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows),
      signal: deadline
    });
    if (!upsert.ok) {
      throw new Error(
        `Supabase answered ${upsert.status} for the ${TABLE} rows: ${(await upsert.text()).slice(0, 200)}`
      );
    }
    // Only once the rows are sent, so a dry run or a failed upsert keeps the last peak
    if (peak) writeDbPeak(ctx.env, peak);
    // Only after the upsert, and only with the tenants read: a failed read is not "no tenants"
    if (prune) {
      const remove = await fetch(
        `${base}/rest/v1/${TABLE}?key=${encodeURIComponent(vanishedFilter(prune))}`,
        {
          method: 'DELETE',
          headers: { ...headers, Prefer: 'return=minimal' },
          signal: deadline
        }
      );
      if (!remove.ok) {
        throw new Error(
          `Supabase answered ${remove.status} for the ${TABLE} cleanup: ${(await remove.text()).slice(0, 200)}`
        );
      }
    }
    return {
      summary: `Sent ${rows.length} ${TABLE} rows`,
      json: {
        rows: rows.length,
        errors: Object.fromEntries(
          rows
            .filter((r) => Object.keys(r.errors ?? {}).length > 0)
            .map((r) => [r.key, Object.keys(r.errors ?? {})])
        )
      }
    };
  }
});
