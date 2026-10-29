import type { Issue } from '../linear';
import type { UsagePayload } from '../supabase';

import type { Role } from './constants';

// The spend aggregation behind the Spend and Cost per ticket sheets

export type SpendDay = { key: string; total: number } & Record<Role, number>;

export type SpendStats = { days: SpendDay[]; total: number; week: number };

export type TicketCost = { i: Issue } & UsagePayload['tickets'][number];

/** The days of `shipped().days`, each with its cost per role; days the usage lacks are zero */
export const spendDays = (
  usage: UsagePayload | null,
  days: readonly { key: string }[]
): SpendDay[] => {
  const byDay = new Map((usage?.days ?? []).map((d) => [d.day, d]));
  return days.map(({ key }) => {
    const d = byDay.get(key);
    return {
      key,
      planning: d?.planning || 0,
      orchestrating: d?.orchestrating || 0,
      implementing: d?.implementing || 0,
      total: d?.total ?? 0
    };
  });
};

export const spendStats = (
  usage: UsagePayload | null,
  days: readonly { key: string }[]
): SpendStats => {
  const all = spendDays(usage, days);
  const sum = (xs: readonly SpendDay[]): number =>
    xs.reduce((n, d) => n + d.total, 0);
  return { days: all, total: sum(all), week: sum(all.slice(-7)) };
};

/** Agent tickets closed in the window that have a usage row, most expensive first */
export const ticketCosts = (
  usage: UsagePayload | null,
  days: readonly { items: readonly Issue[] }[]
): TicketCost[] => {
  const cost = new Map((usage?.tickets ?? []).map((t) => [t.ticket, t]));
  return days
    .flatMap((d) => d.items)
    .flatMap((i) => {
      const c = cost.get(i.id);
      return c ? [{ i, ...c }] : [];
    })
    .sort((a, b) => b.total - a.total);
};

/** The mean cost of the closed tickets that have usage; null without any */
export const perTicketAverage = (
  costs: readonly TicketCost[]
): number | null =>
  costs.length ? costs.reduce((n, r) => n + r.total, 0) / costs.length : null;

export type TokenTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  all: number;
};

export const tokenTotals = (models: UsagePayload['models']): TokenTotals => {
  const tok = models.reduce(
    (a, m) => ({
      input: a.input + m.input,
      output: a.output + m.output,
      cacheRead: a.cacheRead + m.cacheRead,
      cacheWrite: a.cacheWrite + m.cacheWrite
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );
  return {
    ...tok,
    all: tok.input + tok.output + tok.cacheRead + tok.cacheWrite
  };
};

/** What the usage attributes to no ticket */
export const unattributedTotal = (usage: UsagePayload): number =>
  usage.tickets.find((t) => t.ticket === 'unattributed')?.total || 0;
