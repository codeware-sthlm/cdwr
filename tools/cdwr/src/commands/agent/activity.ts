import { existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

import { defineCommand, readOnly } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';

import {
  type LinearActivityResponse,
  type RunRow,
  collectEvents,
  renderActivityDocument
} from './activity.logic';
import { localMinute } from './usage.logic';

const SHOWN = 20;

const runSchema = z.object({
  when: z.string(),
  outcome: z.string().catch(''),
  ticket: z.string().catch(''),
  detail: z.string().catch('')
}) satisfies z.ZodType<RunRow, z.ZodTypeDef, unknown>;

/** A runs.jsonl row, or undefined for a line that is not one */
const parseRun = (line: string): RunRow | undefined => {
  try {
    const parsed = runSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

export default defineCommand({
  summary:
    "The activity document from Linear's issue history and the runs file",
  description:
    "Reads a Linear GraphQL response (issues with their history and comments) on stdin, as the queue script pipes it in, and the scheduler's runs.jsonl, and renders one Markdown table of who did what to which ticket. It never talks to Linear itself.",
  danger: 'read',
  inputs: {
    runs: input.optional(
      input.string({
        prompt: 'Path to runs.jsonl?',
        description:
          "The scheduler's runs file; left out, only Linear's events",
        flagOnly: true
      }),
      () => true
    ),
    days: input.number({
      prompt: 'How many days?',
      description: 'Days back from now to include',
      default: 7,
      schema: z.number().int().positive()
    }),
    limit: input.number({
      prompt: 'How many events?',
      description: 'Newest events to keep, at most 200',
      default: 200,
      schema: z.number().int().min(1).max(200)
    })
  },

  async plan(_ctx, { runs }) {
    if (process.stdin.isTTY) {
      throw new CliError(
        'Expected a Linear GraphQL response on stdin',
        undefined,
        'Pipe it in: curl … | cdwr agent activity --json'
      );
    }
    let response: LinearActivityResponse;
    try {
      response = JSON.parse(await readStdin());
    } catch {
      throw new CliError('Stdin is not valid JSON');
    }

    const rows: RunRow[] = [];
    let skippedLines = 0;
    if (runs && existsSync(runs)) {
      for (const line of readFileSync(runs, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const row = parseRun(line);
        if (row) rows.push(row);
        else skippedLines++;
      }
    }
    return readOnly({ response, rows, skippedLines });
  },

  async apply(ctx, { response, rows, skippedLines }, { days, limit }) {
    const now = new Date();
    const { events, dropped } = collectEvents(response, rows, {
      now,
      windowDays: days,
      limit
    });

    if (events.length > 0) {
      ctx.ui.table(
        ['when', 'ticket', 'actor', 'change'],
        events
          .slice(0, SHOWN)
          .map((e) => [localMinute(e.at), e.ticket, e.actor, e.change])
      );
    }

    return {
      summary: `${events.length} events over ${days} days`,
      json: {
        generatedAt: now.toISOString(),
        windowDays: days,
        events: events.map((e) => ({ ...e, at: e.at.toISOString() })),
        dropped,
        skippedLines,
        // Ready for the Linear document the scheduler publishes
        document: renderActivityDocument(events, {
          updated: localMinute(now),
          windowDays: days,
          dropped
        })
      }
    };
  }
});
