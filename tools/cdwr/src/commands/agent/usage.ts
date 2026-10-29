import { defineCommand, readOnly } from '../../cli/command';
import { input } from '../../cli/inputs';
import { theme } from '../../ui/theme';

import { DAY_MS, findTranscripts, readReplies } from './usage.collect';
import {
  ROLES,
  aggregate,
  dedupeReplies,
  localDay,
  totalTokens
} from './usage.logic';

export default defineCommand({
  summary: 'What the agent workflow spent, by day, role, model and ticket',
  description:
    'Reads the local Claude Code transcripts of this repo and its worktrees and prices them at API rates. Nothing is billed on Max; the cost is what the same tokens would cost on the API. The output holds numbers, model names, ticket ids and project directory names, never transcript content.',
  danger: 'read',
  inputs: {
    days: input.number({
      prompt: 'How many days?',
      short: 'D',
      description: 'Days back from now to include',
      default: 30
    })
  },

  async plan(ctx, { days }) {
    return readOnly({ days, ...findTranscripts(ctx.root, days) });
  },

  async apply(ctx, { base, days, dirs, transcripts }) {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const { records, skippedLines } = readReplies(base, transcripts);

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
        skippedLines
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
