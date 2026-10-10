import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { defineCommand, readOnly } from '../../cli/command';
import { input } from '../../cli/inputs';
import { theme } from '../../ui/theme';

import {
  ROLES,
  type Reply,
  aggregate,
  countsDir,
  dedupeReplies,
  familyBase,
  localDay,
  localMinute,
  normaliseModel,
  renderUsageDocument,
  roleOf,
  ticketOf,
  totalTokens
} from './usage.logic';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Transcript {
  file: string;
  dirName: string;
  subagent: boolean;
}

interface Entry extends Omit<Reply, 'id'> {
  id?: string;
  requestId?: string;
  output: number;
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** The files of one project directory touched since a moment: sessions and their subagents */
const transcriptsIn = (
  projects: string,
  dirName: string,
  after: number
): Transcript[] => {
  const dir = join(projects, dirName);
  const found: Transcript[] = [];
  const consider = (file: string, subagent: boolean) => {
    if (file.endsWith('.jsonl') && statSync(file).mtimeMs >= after) {
      found.push({ file, dirName, subagent });
    }
  };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) consider(join(dir, entry.name), false);
    if (!entry.isDirectory()) continue;
    const subagents = join(dir, entry.name, 'subagents');
    if (!existsSync(subagents)) continue;
    for (const name of readdirSync(subagents)) {
      consider(join(subagents, name), true);
    }
  }
  return found;
};

export default defineCommand({
  summary: 'What the agent workflow spent, by day, role, model and ticket',
  description:
    'Reads the local Claude Code transcripts of this repo and its worktrees and prices them at API rates. Nothing is billed on Max; the cost is what the same tokens would cost on the API. The output holds numbers, model names, ticket ids and project directory names, never transcript content.',
  danger: 'read',
  inputs: {
    days: input.number({
      prompt: 'How many days?',
      description: 'Days back from now to include',
      default: 30
    })
  },

  async plan(ctx, { days }) {
    const projects = join(homedir(), '.claude', 'projects');
    const base = familyBase(ctx.root);
    const dirs = existsSync(projects)
      ? readdirSync(projects, { withFileTypes: true })
          .filter((e) => e.isDirectory() && countsDir(e.name, base))
          .map((e) => e.name)
          .sort()
      : [];
    const after = Date.now() - (days + 1) * DAY_MS;
    const transcripts = dirs.flatMap((dir) =>
      transcriptsIn(projects, dir, after)
    );
    return readOnly({ base, days, dirs, transcripts });
  },

  async apply(ctx, { base, days, dirs, transcripts }) {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const records: Entry[] = [];
    let skippedLines = 0;

    for (const { file, dirName, subagent } of transcripts) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          skippedLines++;
          continue;
        }
        if (parsed?.type !== 'assistant') continue;
        const message = parsed.message;
        const usage = message?.usage;
        if (!usage || typeof parsed.timestamp !== 'string') continue;
        if (typeof message.model !== 'string') continue;
        if (message.model === '<synthetic>') continue;

        const created = num(usage.cache_creation_input_tokens);
        const split = usage.cache_creation;
        records.push({
          id: message.id,
          requestId: parsed.requestId,
          output: num(usage.output_tokens),
          timestamp: parsed.timestamp,
          role: roleOf({ dirName, base, subagent }),
          ticket: ticketOf(parsed.gitBranch),
          model: normaliseModel(message.model),
          speed: usage.speed,
          tokens: {
            input: num(usage.input_tokens),
            output: num(usage.output_tokens),
            cacheRead: num(usage.cache_read_input_tokens),
            cacheWrite5m: split
              ? num(split.ephemeral_5m_input_tokens)
              : created,
            cacheWrite1h: split ? num(split.ephemeral_1h_input_tokens) : 0
          }
        });
      }
    }

    const result = aggregate(dedupeReplies(records), {
      since,
      dayOf: localDay
    });

    const dayRows = [...new Set(result.days.map((d) => d.day))].map((day) => {
      const rows = result.days.filter((d) => d.day === day);
      const sum = (list: typeof rows) =>
        list.reduce((acc, r) => acc + (r.cost ?? 0), 0);
      return [
        day,
        dollars(sum(rows)),
        ...ROLES.map((role) =>
          dollars(sum(rows.filter((r) => r.role === role)))
        )
      ];
    });
    if (dayRows.length > 0) {
      ctx.ui.table(['day', 'total', ...ROLES], dayRows);
    }

    const ticketRows = [...new Set(result.tickets.map((t) => t.ticket))].map(
      (ticket) => {
        const rows = result.tickets.filter((t) => t.ticket === ticket);
        return [
          ticket,
          dollars(rows.reduce((acc, r) => acc + (r.cost ?? 0), 0)),
          count(rows.reduce((acc, r) => acc + totalTokens(r.tokens), 0))
        ];
      }
    );
    if (ticketRows.length > 0) {
      ctx.ui.table(['ticket', 'cost', 'tokens'], ticketRows);
    }

    const { totals } = result;
    ctx.ui.write(
      `${dollars(totals.cost)} over ${days} days, ${count(totalTokens(totals.tokens))} tokens`
    );
    if (totals.unpricedModels.length > 0) {
      ctx.ui.write(
        theme.muted(
          `Not priced, left out of the cost: ${totals.unpricedModels.join(', ')}`
        )
      );
    }

    return {
      summary: `${dollars(totals.cost)} API-equivalent over ${days} days`,
      json: {
        generatedAt: now.toISOString(),
        windowDays: days,
        since: since.toISOString(),
        dirs,
        ...result,
        skippedLines,
        // Ready for the Linear document the scheduler publishes
        document: renderUsageDocument(result, {
          updated: localMinute(now),
          windowDays: days
        })
      }
    };
  }
});

const dollars = (n: number): string => `$${n.toFixed(2)}`;

const count = (n: number): string =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)}M`
    : n >= 1e3
      ? `${Math.round(n / 1e3)}k`
      : String(n);
