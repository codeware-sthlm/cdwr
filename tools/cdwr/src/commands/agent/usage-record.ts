import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';

import { hostId } from './host-id';
import { findTranscripts, readReplies } from './usage.collect';
import {
  type UsageHourRow,
  type UsageTelemetryRow,
  dedupeReplies,
  hourRows,
  localDay,
  usageRows,
  wholeDaysSince,
  wholeHoursSince
} from './usage.logic';

const URL_ENV = 'AGENT_SUPABASE_URL';
const KEY_ENV = 'AGENT_SUPABASE_SERVICE_KEY';
const CONFLICT = 'day,ticket,model,role,host';
const HOUR_CONFLICT = 'hour,model,role,host';
const BATCH = 500;
const DEADLINE_MS = 60_000;
const KEEP_HOURS_DAYS = 14;

const KINDS = ['day', 'hour', 'both'] as const;

interface Data {
  rows: UsageTelemetryRow[];
  hours: UsageHourRow[];
  host: string;
  prune: boolean;
  url: string;
  key: string;
}

export default defineCommand({
  summary: 'Send the agent workflow spend to the telemetry database',
  description: `Upserts the local usage into the usage table (API-equivalent cost, tokens, by day, ticket, model and role) and the usage_hours table (by whole UTC hour, model and role, covering every Claude project on this host) of the agent-queue Supabase project, through PostgREST with the service key. Hour rows older than ${KEEP_HOURS_DAYS} days are deleted for this host. Needs ${URL_ENV} and ${KEY_ENV}; without them it does nothing. Rows already sent are overwritten with the recomputed numbers, so running it again is safe. Only numbers, model names and ticket ids leave the machine.`,
  danger: 'mutate',
  // The scheduler runs it every run
  history: false,
  inputs: {
    days: input.number({
      prompt: 'How many days?',
      short: 'D',
      description: 'Days back from now to send',
      default: 3,
      schema: z.number().int().positive()
    }),
    kind: input.enum(KINDS, {
      prompt: 'Which rows?',
      short: 'k',
      description: 'Send day rows, hour rows or both',
      default: 'both'
    }),
    hours: input.number({
      prompt: 'How many hours?',
      short: 'H',
      description: 'Hours back to send as hour rows',
      default: 6,
      schema: z.number().int().positive()
    })
  },

  async plan(ctx, { days, kind, hours }) {
    const url = ctx.env[URL_ENV];
    const key = ctx.env[KEY_ENV];
    const host = hostId();
    if (!url || !key) {
      return {
        steps: [],
        nothing: `${URL_ENV} and ${KEY_ENV} are not both set; nothing sent`,
        data: {
          rows: [],
          hours: [],
          host,
          prune: false,
          url: '',
          key: ''
        } as Data
      };
    }
    const endpoint = url.replace(/\/$/, '');
    let rows: UsageTelemetryRow[] = [];
    if (kind !== 'hour') {
      const { base, transcripts } = findTranscripts(ctx.root, days);
      const { records } = readReplies(base, transcripts);
      rows = usageRows(dedupeReplies(records), {
        since: wholeDaysSince(new Date(), days),
        host,
        dayOf: localDay
      });
    }
    let hourList: UsageHourRow[] = [];
    if (kind !== 'day') {
      const since = wholeHoursSince(new Date(), hours);
      const { base, transcripts } = findTranscripts(ctx.root, days, {
        allProjects: true,
        after: since.getTime()
      });
      const { records } = readReplies(base, transcripts);
      hourList = hourRows(dedupeReplies(records), { since, host });
    }
    if (ctx.flags.dryRun && rows.length > 0) {
      ctx.ui.table(
        ['day', 'ticket', 'model', 'role', 'in', 'out', 'cost'],
        rows.map((r) => [
          r.day,
          r.ticket ?? '—',
          r.model,
          r.role,
          String(r.input_tokens),
          String(r.output_tokens),
          `$${r.cost_usd.toFixed(2)}`
        ])
      );
    }
    if (ctx.flags.dryRun && hourList.length > 0) {
      ctx.ui.table(
        ['hour', 'role', 'model', 'in', 'out', 'cost'],
        hourList.map((r) => [
          r.hour,
          r.role,
          r.model,
          String(r.input_tokens),
          String(r.output_tokens),
          `$${r.cost_usd.toFixed(2)}`
        ])
      );
    }
    const data: Data = {
      rows,
      hours: hourList,
      host,
      prune: kind !== 'day',
      url,
      key
    };
    if (rows.length === 0 && hourList.length === 0) {
      return {
        steps: [],
        nothing:
          kind === 'hour'
            ? `No usage in the last ${hours} hours`
            : `No usage in the last ${days} days`,
        data
      };
    }
    const steps = [];
    if (rows.length > 0) {
      steps.push({
        label: `Upsert ${rows.length} usage rows`,
        detail: `${endpoint}/rest/v1/usage`
      });
    }
    if (hourList.length > 0) {
      steps.push({
        label: `Upsert ${hourList.length} usage_hours rows`,
        detail: `${endpoint}/rest/v1/usage_hours`
      });
    }
    if (kind !== 'day') {
      steps.push({
        label: `Delete this host's usage_hours rows older than ${KEEP_HOURS_DAYS} days`,
        detail: `${endpoint}/rest/v1/usage_hours`
      });
    }
    return { steps, data };
  },

  async apply(_ctx, { rows, hours, host, prune, url, key }) {
    // One deadline for the whole upload: the abort ends a slow request, the timer a hung process
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const guard = setTimeout(() => process.exit(1), DEADLINE_MS + 2000);
    guard.unref();
    const base = url.replace(/\/$/, '');
    const signal = () =>
      AbortSignal.any([deadline, AbortSignal.timeout(10_000)]);
    const upsert = async (
      table: string,
      conflict: string,
      list: unknown[]
    ): Promise<void> => {
      for (let i = 0; i < list.length; i += BATCH) {
        const response = await fetch(
          `${base}/rest/v1/${table}?on_conflict=${conflict}`,
          {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(list.slice(i, i + BATCH)),
            signal: signal()
          }
        );
        if (!response.ok) {
          throw new Error(
            `Supabase answered ${response.status} for the ${table} rows: ${(await response.text()).slice(0, 200)}`
          );
        }
      }
    };
    try {
      await upsert('usage', CONFLICT, rows);
      await upsert('usage_hours', HOUR_CONFLICT, hours);
      if (prune) {
        const cutoff = new Date(
          Date.now() - KEEP_HOURS_DAYS * 24 * 3_600_000
        ).toISOString();
        const response = await fetch(
          `${base}/rest/v1/usage_hours?host=eq.${encodeURIComponent(host)}&hour=lt.${encodeURIComponent(cutoff)}`,
          {
            method: 'DELETE',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              Prefer: 'return=minimal'
            },
            signal: signal()
          }
        );
        if (!response.ok) {
          throw new Error(
            `Supabase answered ${response.status} for the usage_hours cleanup: ${(await response.text()).slice(0, 200)}`
          );
        }
      }
    } finally {
      clearTimeout(guard);
    }
    return {
      summary: `Sent ${rows.length} usage rows and ${hours.length} usage_hours rows`,
      json: { rows: rows.length, hours: hours.length }
    };
  }
});
