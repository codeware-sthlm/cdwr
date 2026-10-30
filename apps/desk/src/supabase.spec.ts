import { describe, expect, it, vi } from 'vitest';

import {
  type ActivityRow,
  type BuildRow,
  type HostMetricRow,
  type QueueStateRow,
  type RunRow,
  type UsageRow,
  createSupabase,
  localStamp,
  readAllPages,
  toActivity,
  toGithubEvent,
  toIssueEvent,
  toMain,
  toRuns,
  toUsage
} from './supabase';

process.env.TZ = 'UTC';

const state = (over: Partial<QueueStateRow> = {}): QueueStateRow => ({
  host: 'mac',
  at: '2026-10-28T10:00:00.000Z',
  last_run: '2026-10-28 09:50 · planned COD-1',
  attended: 'idle: waits',
  suggested: '2026-10-28 · nothing today',
  job: 'Job: every 10 min · install current',
  view: {
    at: '2026-10-28T10:00:00.000Z',
    limit: { used: 1, max: 3 },
    table: { before: [], after: [] }
  },
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

const build = (over: Partial<BuildRow> = {}): BuildRow => ({
  workflow: 'desk.yml',
  sha: 'a'.repeat(40),
  run_created_at: '2026-10-28T08:00:00.000Z',
  updated_at: '2026-10-28T08:10:00.000Z',
  ...over
});

describe('toMain', () => {
  it('maps both workflows to their commits and ignores others', () => {
    expect(
      toMain([
        build({ workflow: 'agent-host-image.yml', sha: 'b'.repeat(40) }),
        build({ workflow: 'desk.yml', sha: 'c'.repeat(40) }),
        build({ workflow: 'other.yml', sha: 'd'.repeat(40) })
      ])
    ).toEqual({ image: 'b'.repeat(40), desk: 'c'.repeat(40) });
  });

  it('is null for a workflow without a row', () => {
    expect(toMain([])).toEqual({ image: null, desk: null });
    expect(toMain([build({ workflow: 'desk.yml' })])).toEqual({
      image: null,
      desk: 'a'.repeat(40)
    });
  });
});

describe('createSupabase read of builds', () => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    });

  const readWith = (builds: Response) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/rest/v1/builds')) return builds.clone();
        if (url.includes('/rest/v1/queue_state')) return reply([state()]);
        return reply([]);
      })
    );
    return createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon' })
      .read()
      .finally(() => vi.unstubAllGlobals());
  };

  it('reads a missing table as no builds', async () => {
    const payload = await readWith(
      reply({ code: 'PGRST205', message: 'Could not find the table' }, 404)
    );
    expect(payload.runs?.main).toEqual({ image: null, desk: null });
  });

  it('fails on any other error', async () => {
    await expect(
      readWith(reply({ code: '42501', message: 'permission denied' }, 401))
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

describe('toRuns', () => {
  it('carries main, all null without build rows', () => {
    expect(toRuns([state()], [])?.main).toEqual({ image: null, desk: null });
    expect(
      toRuns([state()], [], [build({ workflow: 'agent-host-image.yml' })])?.main
    ).toEqual({ image: 'a'.repeat(40), desk: null });
  });

  it('returns null without a queue_state row', () => {
    expect(toRuns([], [run()])).toBeNull();
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
      []
    );
    expect(result?.job).toMatchObject({
      line: 'nuc job',
      minutes: null,
      live: false,
      install: 'unknown'
    });
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
      []
    );
    expect(result?.job).toEqual({
      line: 'every 10 min · install current',
      minutes: 10,
      live: false,
      host: 'launchd',
      rev: null,
      install: 'current',
      items: ''
    });
    expect(result?.attended).toEqual({
      verdict: 'idle',
      text: 'nothing to do'
    });
    expect(result?.suggested).toEqual({
      date: '2026-10-28',
      kind: 'nothing',
      text: 'nothing today'
    });
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
    expect(toRuns([state({ last_run })], [])?.last).toEqual(expected);
  });

  it('runs the lines through the page parsers', () => {
    const result = toRuns([state()], []);
    expect(result?.attended).toEqual({ verdict: 'idle', text: 'waits' });
    expect(result?.suggested).toEqual({
      date: '2026-10-28',
      kind: 'nothing',
      text: 'nothing today'
    });
    expect(result?.qv).toEqual({
      at: '2026-10-28T10:00:00.000Z',
      limit: { used: 1, max: 3 },
      session: { state: 'none' },
      next: [],
      held: { tickets: [], free: [] },
      parked: [],
      table: { before: [], label: [], after: [] }
    });
  });

  it('leaves a view without limit or table out', () => {
    expect(
      toRuns([state({ view: { limit: { used: 1, max: 3 } } })], [])?.qv
    ).toBeNull();
    expect(toRuns([state({ view: null })], [])?.qv).toBeNull();
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
      ]
    );
    expect(result?.rows).toEqual([
      {
        when: '2026-10-28 09:30',
        outcome: 'failed',
        ticket: '',
        detail: '',
        started: '2026-10-28T09:30:00.000Z',
        finished: null
      },
      {
        when: '2026-10-28 08:05',
        outcome: 'planned',
        ticket: 'COD-1',
        detail: 'plan written',
        started: '2026-10-28T08:05:00.000Z',
        finished: null
      }
    ]);
  });

  it('carries when each run finished, null while it is open', () => {
    const result = toRuns(
      [state()],
      [
        run({
          id: 1,
          started_at: '2026-10-28T08:05:00.000Z',
          finished_at: '2026-10-28T08:12:00.000Z'
        })
      ]
    );
    expect(result?.rows[0]).toMatchObject({
      started: '2026-10-28T08:05:00.000Z',
      finished: '2026-10-28T08:12:00.000Z'
    });
  });

  it('carries the row time as `at`', () => {
    expect(toRuns([state()], [])?.at).toBe('2026-10-28T10:00:00.000Z');
  });

  it('flags a view that is present but does not parse', () => {
    const bad = toRuns([state({ view: { limit: { used: 1, max: 3 } } })], []);
    expect(bad?.qv).toBeNull();
    expect(bad?.viewInvalid).toBe(true);
    const absent = toRuns([state({ view: null })], []);
    expect(absent?.qv).toBeNull();
    expect(absent?.viewInvalid).toBe(false);
    expect(toRuns([state()], [])?.viewInvalid).toBe(false);
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

describe('toGithubEvent', () => {
  it('keeps a row with a subject', () => {
    expect(
      toGithubEvent({
        subject: 'pr-7',
        pr: 7,
        action: 'opened',
        updated_at: '2026-10-28T10:00:00.000Z'
      })
    ).toEqual({
      subject: 'pr-7',
      pr: 7,
      action: 'opened',
      updated_at: '2026-10-28T10:00:00.000Z'
    });
  });

  it('turns a missing pr into null and a missing action or time into empty', () => {
    expect(toGithubEvent({ subject: 'main', pr: 'x' })).toEqual({
      subject: 'main',
      pr: null,
      action: '',
      updated_at: ''
    });
    expect(toGithubEvent({ subject: 'main', pr: null })).toMatchObject({
      pr: null
    });
  });

  it.each([null, undefined, 'x', {}, { subject: 1 }])('rejects %j', (row) => {
    expect(toGithubEvent(row)).toBeUndefined();
  });
});

describe('createSupabase readHostMetrics', () => {
  const sample = (id: number): HostMetricRow => ({
    id,
    host: 'nuc',
    at: new Date(Date.now() - (1500 - id) * 60000).toISOString(),
    cores: 4,
    load1: 0,
    load5: 0,
    load15: 0,
    mem_total: 1,
    mem_available: 1,
    swap_total: 0,
    swap_free: 0,
    disk_total: 1,
    disk_free: 1,
    cgroup_mem_current: null,
    cgroup_mem_max: null
  });

  it('reads a window past one page across pages', async () => {
    const all = Array.from({ length: 1440 }, (_, i) => sample(i + 1));
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        urls.push(url.search);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit'));
        // The newest-sample query is the only one ordered descending
        const body = url.searchParams.get('order')?.includes('desc')
          ? [all[all.length - 1]]
          : all.slice(offset, offset + limit);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      })
    );
    const rows = await createSupabase({
      url: 'https://x.supabase.co',
      anonKey: 'anon'
    })
      .readHostMetrics()
      .finally(() => vi.unstubAllGlobals());
    expect(rows).toHaveLength(1440);
    expect(rows.map((r) => r.id)).toEqual(all.map((r) => r.id));
    expect(
      urls.filter(
        (u) => new URLSearchParams(u).get('order') === 'at.asc,id.asc'
      )
    ).toHaveLength(2);
  });
});

describe('localStamp', () => {
  it('pads the parts', () => {
    expect(localStamp('2026-01-02T03:04:00.000Z')).toBe('2026-01-02 03:04');
  });
});
