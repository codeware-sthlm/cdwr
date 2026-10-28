import { describe, expect, it } from 'vitest';

import {
  type ActivityRow,
  type Parsers,
  type QueueStateRow,
  type RunRow,
  type UsageRow,
  localStamp,
  readAllPages,
  toActivity,
  toIssueEvent,
  toRuns,
  toUsage
} from './supabase';

process.env.TZ = 'UTC';

const parsers: Parsers = {
  parseAttended: (text) => ({ attended: text }),
  parseSuggested: (text) => ({ suggested: text }),
  parseJob: (text) => ({ job: text }),
  validateQueueView: (view) => (view ? { view } : null)
};

const state = (over: Partial<QueueStateRow> = {}): QueueStateRow => ({
  host: 'mac',
  at: '2026-10-28T10:00:00.000Z',
  last_run: '2026-10-28 09:50 · planned COD-1',
  attended: 'idle: waits',
  suggested: '2026-10-28 · nothing today',
  job: 'Job: every 10 min · install current',
  view: { limit: 1 },
  ...over
});

const run = (over: Partial<RunRow> = {}): RunRow => ({
  id: 1,
  started_at: '2026-10-28T08:05:00.000Z',
  finished_at: null,
  outcome: 'planned',
  ticket: 'COD-1',
  detail: 'plan written',
  host: 'mac',
  attended: null,
  job: null,
  ...over
});

const use = (over: Partial<UsageRow> = {}): UsageRow => ({
  id: 1,
  day: '2026-10-27',
  ticket: 'COD-1',
  model: 'opus',
  role: 'implementing',
  input_tokens: 1000,
  output_tokens: 50,
  cache_read_tokens: 600,
  cache_write_tokens: 100,
  cost_usd: 1.234,
  host: 'mac',
  ...over
});

const act = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 1,
  event_id: 'e1',
  at: '2026-10-28T07:30:00.000Z',
  ticket: 'COD-1',
  actor: 'agent',
  change: 'Moved to Done',
  host: null,
  ...over
});

describe('toRuns', () => {
  it('returns null without a queue_state row', () => {
    expect(toRuns([], [run()], parsers)).toBeNull();
  });

  it('picks the newest queue_state across hosts', () => {
    const result = toRuns(
      [
        state({
          host: 'mac',
          at: '2026-10-28T10:00:00.000Z',
          job: 'Job: mac job'
        }),
        state({
          host: 'nuc',
          at: '2026-10-28T11:00:00.000Z',
          job: 'Job: nuc job'
        })
      ],
      [],
      parsers
    );
    expect(result?.job).toEqual({ job: 'Job: nuc job' });
  });

  it('passes the job line as run.sh stores it, labelled once, and labels the bare lines', () => {
    const result = toRuns(
      [
        state({
          job: 'Job: every 10 min · install current',
          attended: 'idle: nothing to do',
          suggested: '2026-10-28 · nothing today'
        })
      ],
      [],
      {
        ...parsers,
        parseJob: (text) => text,
        parseAttended: (text) => text,
        parseSuggested: (text) => text
      }
    );
    expect(result?.job).toBe('Job: every 10 min · install current');
    expect(result?.attended).toBe('Attended: idle: nothing to do');
    expect(result?.suggested).toBe('Suggested: 2026-10-28 · nothing today');
  });

  it.each([
    [
      '2026-10-28 09:50 · planned COD-1',
      { when: '2026-10-28 10:00', outcome: 'planned COD-1' }
    ],
    [
      '2026-10-28 23:15 · planned COD-2',
      { when: '2026-10-28 10:00', outcome: 'planned COD-2' }
    ],
    ['not a run', null],
    [null, null]
  ])('parses last_run %j', (last_run, expected) => {
    expect(toRuns([state({ last_run })], [], parsers)?.last).toEqual(expected);
  });

  it('runs the lines through the page parsers', () => {
    const result = toRuns([state()], [], parsers);
    expect(result?.attended).toEqual({ attended: 'Attended: idle: waits' });
    expect(result?.suggested).toEqual({
      suggested: 'Suggested: 2026-10-28 · nothing today'
    });
    expect(result?.qv).toEqual({ view: { limit: 1 } });
  });

  it('leaves out idle runs and lists the rest newest first in local time', () => {
    const result = toRuns(
      [state()],
      [
        run({
          id: 1,
          started_at: '2026-10-28T08:05:00.000Z',
          outcome: 'planned'
        }),
        run({ id: 2, started_at: '2026-10-28T09:00:00.000Z', outcome: 'idle' }),
        run({
          id: 3,
          started_at: '2026-10-28T09:30:00.000Z',
          outcome: 'failed',
          ticket: null,
          detail: null
        })
      ],
      parsers
    );
    expect(result?.rows).toEqual([
      { when: '2026-10-28 09:30', outcome: 'failed', ticket: '', detail: '' },
      {
        when: '2026-10-28 08:05',
        outcome: 'planned',
        ticket: 'COD-1',
        detail: 'plan written'
      }
    ]);
  });
});

describe('toUsage', () => {
  const now = new Date('2026-10-28T12:00:00.000Z');

  it('formats the update stamp and the fixed fields', () => {
    expect(toUsage([], now)).toEqual({
      updated: '2026-10-28 12:00',
      windowDays: 30,
      total: 0,
      pricesDate: '',
      unpriced: [],
      models: [],
      days: [],
      tickets: []
    });
  });

  it('takes the cache out of the fresh input, so the page does not count it twice', () => {
    const [model] = toUsage([use()], now).models;
    expect(model).toEqual({
      model: 'opus',
      input: 300,
      output: 50,
      cacheRead: 600,
      cacheWrite: 100,
      cost: 1.23
    });
    expect(model.input + model.cacheRead + model.cacheWrite).toBe(1000);
  });

  it('sums across hosts and rolls up by model, day and ticket', () => {
    const result = toUsage(
      [
        use({ host: 'mac', cost_usd: 1 }),
        use({ id: 2, host: 'nuc', cost_usd: 2 }),
        use({
          id: 3,
          day: '2026-10-28',
          ticket: null,
          model: 'sonnet',
          role: 'planning',
          input_tokens: 200,
          output_tokens: 10,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          cost_usd: 0.5
        })
      ],
      now
    );
    expect(result.total).toBe(3.5);
    expect(result.models).toEqual([
      {
        model: 'opus',
        input: 600,
        output: 100,
        cacheRead: 1200,
        cacheWrite: 200,
        cost: 3
      },
      {
        model: 'sonnet',
        input: 200,
        output: 10,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.5
      }
    ]);
    expect(result.days).toEqual([
      {
        day: '2026-10-27',
        planning: 0,
        orchestrating: 0,
        implementing: 3,
        total: 3
      },
      {
        day: '2026-10-28',
        planning: 0.5,
        orchestrating: 0,
        implementing: 0,
        total: 0.5
      }
    ]);
    expect(result.tickets).toEqual([
      {
        ticket: 'COD-1',
        planning: 0,
        orchestrating: 0,
        implementing: 3,
        total: 3,
        output: 100,
        cacheRead: 1200
      },
      {
        ticket: 'unattributed',
        planning: 0.5,
        orchestrating: 0,
        implementing: 0,
        total: 0.5,
        output: 10,
        cacheRead: 0
      }
    ]);
  });

  it('leaves out days before the 30 day window', () => {
    const result = toUsage([use({ day: '2026-09-01' }), use({ id: 2 })], now);
    expect(result.days.map((d) => d.day)).toEqual(['2026-10-27']);
  });
});

describe('toActivity', () => {
  it('returns null without a queue_state time', () => {
    expect(toActivity([act()], null)).toBeNull();
  });

  it('orders newest first and formats local times', () => {
    const result = toActivity(
      [
        act({ id: 1, at: '2026-10-28T07:30:00.000Z' }),
        act({
          id: 2,
          at: '2026-10-28T09:15:00.000Z',
          ticket: null,
          actor: 'scheduler',
          change: 'Launched'
        })
      ],
      '2026-10-28T10:00:00.000Z'
    );
    expect(result).toEqual({
      updated: '2026-10-28 10:00',
      header: '2026-10-28 10:00',
      dropped: '',
      rows: [
        {
          when: '2026-10-28 09:15',
          ticket: '',
          actor: 'scheduler',
          change: 'Launched'
        },
        {
          when: '2026-10-28 07:30',
          ticket: 'COD-1',
          actor: 'agent',
          change: 'Moved to Done'
        }
      ]
    });
  });
});

describe('readAllPages', () => {
  const rows = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

  it('pages until a short page', async () => {
    const sizes = [1000, 1000, 3];
    const ranges: [number, number][] = [];
    const all = await readAllPages(async (from, to) => {
      ranges.push([from, to]);
      return rows(sizes[ranges.length - 1]);
    });
    expect(all).toHaveLength(2003);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999]
    ]);
  });

  it('fails instead of returning partial data at the page limit', async () => {
    await expect(readAllPages(async () => rows(1000))).rejects.toMatchObject({
      code: 'bad_response'
    });
  });
});

describe('toIssueEvent', () => {
  it('keeps a row with an issue id', () => {
    expect(
      toIssueEvent({
        issue_id: 'u-1',
        identifier: 'COD-1',
        action: 'issue:update',
        updated_at: '2026-10-28T10:00:00.000Z'
      })
    ).toEqual({
      issue_id: 'u-1',
      identifier: 'COD-1',
      action: 'issue:update',
      updated_at: '2026-10-28T10:00:00.000Z'
    });
  });

  it('turns a missing identifier into null', () => {
    expect(toIssueEvent({ issue_id: 'u-1', identifier: null })).toMatchObject({
      issue_id: 'u-1',
      identifier: null
    });
  });

  it.each([null, undefined, 'x', {}, { issue_id: 1 }])('rejects %j', (row) => {
    expect(toIssueEvent(row)).toBeUndefined();
  });
});

describe('localStamp', () => {
  it('pads the parts', () => {
    expect(localStamp('2026-01-02T03:04:00.000Z')).toBe('2026-01-02 03:04');
  });
});
