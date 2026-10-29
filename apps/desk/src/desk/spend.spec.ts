import { describe, expect, it } from 'vitest';

import type { Issue } from '../linear';
import type { UsagePayload } from '../supabase';

import {
  perTicketAverage,
  spendDays,
  spendStats,
  ticketCosts,
  tokenTotals,
  unattributedTotal
} from './spend';

const usage = (over: Partial<UsagePayload> = {}): UsagePayload => ({
  updated: '2026-10-29 12:00',
  windowDays: 30,
  total: 0,
  pricesDate: '2026-10-01',
  unpriced: [],
  models: [],
  days: [],
  tickets: [],
  ...over
});

const day = (
  key: string,
  planning: number,
  orchestrating: number,
  implementing: number
): UsagePayload['days'][number] => ({
  day: key,
  planning,
  orchestrating,
  implementing,
  total: planning + orchestrating + implementing
});

const ticket = (
  id: string,
  total: number,
  over: Partial<UsagePayload['tickets'][number]> = {}
): UsagePayload['tickets'][number] => ({
  ticket: id,
  planning: 0,
  orchestrating: total,
  implementing: 0,
  total,
  output: 0,
  cacheRead: 0,
  ...over
});

const issue = (id: string): Issue => ({
  id,
  title: id,
  priority: { value: 3 },
  status: 'Done',
  statusType: 'completed',
  labels: ['agent:review'],
  createdAt: '2026-10-01T08:00:00',
  updatedAt: '2026-10-01T08:00:00',
  url: `https://linear.app/codeware/issue/${id}`,
  completedAt: '2026-10-20T08:00:00',
  canceledAt: null
});

const keys = (n: number) =>
  Array.from({ length: n }, (_, k) => ({
    key: `2026-10-${String(k + 1).padStart(2, '0')}`
  }));

describe('spendDays', () => {
  it('gives every asked day, zero where the usage lacks it', () => {
    const days = spendDays(
      usage({ days: [day('2026-10-02', 1, 2, 3)] }),
      keys(3)
    );
    expect(days).toEqual([
      {
        key: '2026-10-01',
        planning: 0,
        orchestrating: 0,
        implementing: 0,
        total: 0
      },
      {
        key: '2026-10-02',
        planning: 1,
        orchestrating: 2,
        implementing: 3,
        total: 6
      },
      {
        key: '2026-10-03',
        planning: 0,
        orchestrating: 0,
        implementing: 0,
        total: 0
      }
    ]);
  });

  it('is all zero without usage data', () => {
    expect(spendDays(null, keys(2)).map((d) => d.total)).toEqual([0, 0]);
  });
});

describe('spendStats', () => {
  it('totals the days and the last seven of them', () => {
    const rows = Array.from({ length: 10 }, (_, k) =>
      day(`2026-10-${String(k + 1).padStart(2, '0')}`, 0, k + 1, 0)
    );
    const s = spendStats(usage({ days: rows }), keys(10));
    expect(s.days).toHaveLength(10);
    expect(s.total).toBe(55);
    // days 4..10
    expect(s.week).toBe(49);
  });

  it('counts only the asked days', () => {
    const s = spendStats(
      usage({
        days: [day('2026-09-01', 0, 100, 0), day('2026-10-01', 0, 5, 0)]
      }),
      keys(1)
    );
    expect(s.total).toBe(5);
  });

  it('is zero without usage', () => {
    expect(spendStats(null, keys(3))).toMatchObject({ total: 0, week: 0 });
  });
});

describe('ticketCosts', () => {
  const days = [
    { items: [issue('COD-1'), issue('COD-2')] },
    { items: [issue('COD-3'), issue('COD-4')] }
  ];

  it('keeps closed tickets that have usage, most expensive first', () => {
    const costs = ticketCosts(
      usage({
        tickets: [
          ticket('COD-1', 2),
          ticket('COD-3', 9),
          ticket('COD-9', 50),
          ticket('unattributed', 70)
        ]
      }),
      days
    );
    expect(costs.map((c) => [c.i.id, c.total])).toEqual([
      ['COD-3', 9],
      ['COD-1', 2]
    ]);
  });

  it('carries the role costs and token counts of the row', () => {
    const [first] = ticketCosts(
      usage({
        tickets: [
          ticket('COD-2', 6, {
            planning: 1,
            orchestrating: 2,
            implementing: 3,
            output: 40,
            cacheRead: 500
          })
        ]
      }),
      days
    );
    expect(first).toMatchObject({
      planning: 1,
      orchestrating: 2,
      implementing: 3,
      output: 40,
      cacheRead: 500
    });
    expect(first.i.id).toBe('COD-2');
  });

  it('is empty without usage or closed tickets', () => {
    expect(ticketCosts(null, days)).toEqual([]);
    expect(ticketCosts(usage({ tickets: [ticket('COD-1', 1)] }), [])).toEqual(
      []
    );
  });
});

describe('perTicketAverage', () => {
  it('is the mean of the totals', () => {
    const costs = ticketCosts(
      usage({ tickets: [ticket('COD-1', 2), ticket('COD-2', 4)] }),
      [{ items: [issue('COD-1'), issue('COD-2')] }]
    );
    expect(perTicketAverage(costs)).toBe(3);
  });

  it('is null without tickets', () => {
    expect(perTicketAverage([])).toBeNull();
  });
});

describe('tokenTotals', () => {
  it('sums the models and all four kinds', () => {
    const model = (n: number) => ({
      model: `m${n}`,
      input: 1 * n,
      output: 10 * n,
      cacheRead: 100 * n,
      cacheWrite: 1000 * n,
      cost: 0
    });
    expect(tokenTotals([model(1), model(2)])).toEqual({
      input: 3,
      output: 30,
      cacheRead: 300,
      cacheWrite: 3000,
      all: 3333
    });
  });

  it('is zero without models', () => {
    expect(tokenTotals([]).all).toBe(0);
  });
});

describe('unattributedTotal', () => {
  it('reads the unattributed row', () => {
    expect(
      unattributedTotal(
        usage({ tickets: [ticket('COD-1', 1), ticket('unattributed', 7)] })
      )
    ).toBe(7);
  });

  it('is zero without one', () => {
    expect(unattributedTotal(usage({ tickets: [ticket('COD-1', 1)] }))).toBe(0);
  });
});
