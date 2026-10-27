import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';

import { hostId } from './host-id';
import { findTranscripts, readReplies } from './usage.collect';
import {
  type UsageTelemetryRow,
  dedupeReplies,
  localDay,
  usageRows,
  wholeDaysSince
} from './usage.logic';

const URL_ENV = 'AGENT_SUPABASE_URL';
const KEY_ENV = 'AGENT_SUPABASE_SERVICE_KEY';
const CONFLICT = 'day,ticket,model,role,host';
const BATCH = 500;
const DEADLINE_MS = 60_000;

export default defineCommand({
  summary: 'Send the agent workflow spend to the telemetry database',
  description: `Upserts the local usage (API-equivalent cost, tokens, by day, ticket, model and role) into the usage table of the agent-queue Supabase project, through PostgREST with the service key. Needs ${URL_ENV} and ${KEY_ENV}; without them it does nothing. Rows already sent are overwritten with the recomputed numbers, so running it again is safe. Only numbers, model names and ticket ids leave the machine.`,
  danger: 'mutate',
  // The scheduler runs it every hour
  history: false,
  inputs: {
    days: input.number({
      prompt: 'How many days?',
      short: 'D',
      description: 'Days back from now to send',
      default: 3,
      schema: z.number().int().positive()
    })
  },

  async plan(ctx, { days }) {
    const url = ctx.env[URL_ENV];
    const key = ctx.env[KEY_ENV];
    if (!url || !key) {
      return {
        steps: [],
        nothing: `${URL_ENV} and ${KEY_ENV} are not both set; nothing sent`,
        data: { rows: [] as UsageTelemetryRow[], url: '', key: '' }
      };
    }
    const { base, transcripts } = findTranscripts(ctx.root, days);
    const { records } = readReplies(base, transcripts);
    const rows = usageRows(dedupeReplies(records), {
      since: wholeDaysSince(new Date(), days),
      host: hostId(),
      dayOf: localDay
    });
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
    if (rows.length === 0) {
      return {
        steps: [],
        nothing: `No usage in the last ${days} days`,
        data: { rows, url, key }
      };
    }
    return {
      steps: [
        {
          label: `Upsert ${rows.length} usage rows`,
          detail: `${url.replace(/\/$/, '')}/rest/v1/usage`
        }
      ],
      data: { rows, url, key }
    };
  },

  async apply(_ctx, { rows, url, key }) {
    // One deadline for the whole upload: the abort ends a slow request, the timer a hung process
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const guard = setTimeout(() => process.exit(1), DEADLINE_MS + 2000);
    guard.unref();
    const endpoint = `${url.replace(/\/$/, '')}/rest/v1/usage?on_conflict=${CONFLICT}`;
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(rows.slice(i, i + BATCH)),
          signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)])
        });
        if (!response.ok) {
          throw new Error(
            `Supabase answered ${response.status} for the usage rows: ${(await response.text()).slice(0, 200)}`
          );
        }
      }
    } finally {
      clearTimeout(guard);
    }
    return {
      summary: `Sent ${rows.length} usage rows`,
      json: { rows: rows.length }
    };
  }
});
