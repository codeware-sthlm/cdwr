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
/** PostgREST's default max-rows: a shorter page is the last */
const PAGE = 1000;
const STALE_BATCH = 50;

type DayKey = Pick<UsageTelemetryRow, 'day' | 'ticket' | 'model' | 'role'>;

const dayKey = (r: DayKey): string =>
  [r.day, r.ticket ?? '', r.model, r.role].join('\t');

/** One row's key as a PostgREST `and(…)`, values quoted */
const keyFilter = (r: DayKey): string =>
  `and(day.eq.${r.day},ticket.${r.ticket === null ? 'is.null' : `eq."${r.ticket}"`},model.eq."${r.model}",role.eq.${r.role})`;

const KINDS = ['day', 'hour', 'both'] as const;

interface Data {
  rows: UsageTelemetryRow[];
  hours: UsageHourRow[];
  host: string;
  /** The window's first local day: day rows from it on are replaced */
  fromDay: string;
  prune: boolean;
  url: string;
  key: string;
}

export default defineCommand({
  summary: 'Send the agent workflow spend to the telemetry database',
  description: `Upserts the local usage into the usage table (API-equivalent cost, tokens, by day, ticket, model and role) and the usage_hours table (by whole UTC hour, model and role, covering every Claude project on this host) of the agent-queue Supabase project, through PostgREST with the service key. After the upsert, this host's day rows from the window's first day on that the send doesn't have are deleted, so a role or ticket read differently since leaves no stale row; a failed send deletes nothing, and with no rows to send nothing is deleted. Hour rows older than ${KEEP_HOURS_DAYS} days are deleted for this host. Needs ${URL_ENV} and ${KEY_ENV}; without them it does nothing. Rows already sent are overwritten with the recomputed numbers, so running it again is safe. Only numbers, model names and ticket ids leave the machine.`,
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
          fromDay: '',
          prune: false,
          url: '',
          key: ''
        } as Data
      };
    }
    const endpoint = url.replace(/\/$/, '');
    let rows: UsageTelemetryRow[] = [];
    const since = wholeDaysSince(new Date(), days);
    const fromDay = localDay(since.toISOString());
    if (kind !== 'hour') {
      const { base, transcripts } = findTranscripts(ctx.root, days);
      const { records } = readReplies(base, transcripts);
      rows = usageRows(dedupeReplies(records), {
        since,
        host,
        dayOf: localDay
      });
    }
    let hourList: UsageHourRow[] = [];
    if (kind !== 'day') {
      const sinceHour = wholeHoursSince(new Date(), hours);
      const { base, transcripts } = findTranscripts(ctx.root, days, {
        allProjects: true,
        after: sinceHour.getTime()
      });
      const { records } = readReplies(base, transcripts);
      hourList = hourRows(dedupeReplies(records), { since: sinceHour, host });
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
      fromDay,
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
      // A key that gets no replies any more (a role or ticket read differently) keeps no stale sum
      steps.push({
        label: `Delete this host's usage rows from ${fromDay} on that this send doesn't have`,
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

  async apply(_ctx, { rows, hours, host, fromDay, prune, url, key }) {
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
    const remove = async (table: string, filter: string): Promise<void> => {
      const response = await fetch(
        `${base}/rest/v1/${table}?host=eq.${encodeURIComponent(host)}&${filter}`,
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
          `Supabase answered ${response.status} for the ${table} cleanup: ${(await response.text()).slice(0, 200)}`
        );
      }
    };
    /** This host's day rows from `fromDay` on that this send no longer has */
    const staleRows = async (): Promise<DayKey[]> => {
      const found: DayKey[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const response = await fetch(
          `${base}/rest/v1/usage?select=day,ticket,model,role&host=eq.${encodeURIComponent(host)}&day=gte.${fromDay}&order=day,ticket,model,role&limit=${PAGE}&offset=${offset}`,
          {
            method: 'GET',
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: signal()
          }
        );
        if (!response.ok) {
          throw new Error(
            `Supabase answered ${response.status} for the usage read: ${(await response.text()).slice(0, 200)}`
          );
        }
        const page = (await response.json()) as DayKey[];
        found.push(...page);
        if (page.length < PAGE) break;
      }
      const sent = new Set(rows.map(dayKey));
      return found.filter((r) => !sent.has(dayKey(r)));
    };
    try {
      await upsert('usage', CONFLICT, rows);
      // Only after the upsert, so a failed send leaves the old rows rather than none; and only
      // with rows to send, so an empty read never wipes what was sent before
      if (rows.length > 0) {
        const stale = await staleRows();
        for (let i = 0; i < stale.length; i += STALE_BATCH) {
          const keys = stale.slice(i, i + STALE_BATCH).map(keyFilter);
          await remove(
            'usage',
            `or=${encodeURIComponent(`(${keys.join(',')})`)}`
          );
        }
      }
      await upsert('usage_hours', HOUR_CONFLICT, hours);
      if (prune) {
        const cutoff = new Date(
          Date.now() - KEEP_HOURS_DAYS * 24 * 3_600_000
        ).toISOString();
        await remove('usage_hours', `hour=lt.${encodeURIComponent(cutoff)}`);
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
