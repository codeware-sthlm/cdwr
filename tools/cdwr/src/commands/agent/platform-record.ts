import { defineCommand } from '../../cli/command';

import {
  DATABASE_URL_ENV,
  readDatabase,
  readFly,
  readSwitches
} from './platform.collect';
import {
  type TenantStateRow,
  buildRows,
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
}

const none = (): Data => ({ rows: [], prune: null, url: '', key: '' });

export default defineCommand({
  summary: 'Send the platform state to the telemetry database',
  description: `Reads the tenants and database figures (psql, read-only), the Fly apps with their machines, certificates and health, and the deploy switches (Infisical), and upserts one row per tenant plus a shared row into the tenant_state table of the agent-queue Supabase project, through PostgREST with the service key. A source that fails is named in that row's errors and never recorded as empty; rows of tenants that no longer exist are deleted only when the tenants were read. Needs ${URL_ENV}, ${KEY_ENV} and ${DATABASE_URL_ENV}; without them it does nothing. The Fly CLI reads FLY_API_TOKEN, the switches PLATFORM_INFISICAL_CLIENT_ID, PLATFORM_INFISICAL_CLIENT_SECRET and PLATFORM_INFISICAL_PROJECT_ID. Only states, names and counts leave the machine, never a secret value.`,
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
    const [fly, switches] = await Promise.all([
      readFly(),
      readSwitches(ctx.env)
    ]);
    const { rows, prune } = buildRows({
      at: new Date().toISOString(),
      ...splitDatabase(database),
      fly,
      switches
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
    return { steps, data: { rows, prune, url, key } };
  },

  async apply(_ctx, { rows, prune, url, key }) {
    const deadline = AbortSignal.timeout(60_000);
    const base = url.replace(/\/$/, '');
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

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
