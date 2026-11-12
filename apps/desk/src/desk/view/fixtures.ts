import type { Issue } from '../../linear';
import type {
  ActivityPayload,
  HostMetricRow,
  PlanUsageRow,
  RunsPayload,
  UsageHourRow,
  UsagePayload
} from '../../supabase';
import { type DeskState, createState } from '../state';
import type { QueueView, SessionState } from '../types';

// Local-time dates, so the specs read the same in every time zone
export const NOW = new Date('2026-10-29T12:00:00');

export const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: `Title of ${id}`,
  priority: { value: 3 },
  status: 'Todo',
  statusType: 'unstarted',
  labels: [],
  createdAt: '2026-10-01T08:00:00',
  updatedAt: '2026-10-01T08:00:00',
  url: `https://linear.app/codeware/issue/${id}`,
  completedAt: null,
  canceledAt: null,
  ...over
});

export const view = (over: Partial<QueueView> = {}): QueueView => ({
  at: '2026-10-29T11:55:00',
  limit: { used: 2, max: 5 },
  session: { state: 'none' },
  next: [{ ticket: 'COD-1', reason: 'ready' }],
  held: { tickets: ['COD-9'], free: [{ action: 'review', ticket: 'COD-3' }] },
  parked: [{ ticket: 'COD-2', wait: 'ci', pr: 5 }],
  blocked: [],
  renovate: [],
  table: {
    before: [{ ticket: 'COD-4', kind: 'plan' }],
    label: [{ ticket: 'COD-6', parent: 'COD-<1>', blockers: ['COD-2'] }],
    after: [
      { ticket: 'COD-3', kind: 'pr', pr: 7 },
      { ticket: 'COD-5', kind: 'handoffs', items: ['check it'] }
    ]
  },
  ...over
});

export const runs = (qv: QueueView | null): RunsPayload => ({
  last: { when: '2026-10-29 11:50', outcome: 'planned COD-1' },
  attended: null,
  suggested: { date: '2026-10-29', kind: 'nothing', text: 'nothing today' },
  job: {
    line: 'every 10 min',
    minutes: 10,
    live: false,
    host: 'launchd',
    rev: null,
    install: 'current',
    items: '',
    effort: null,
    paused: false
  },
  qv,
  viewInvalid: false,
  view: null,
  viewIssues: [],
  at: new Date('2026-10-29T11:55:00').toISOString(),
  host: 'nuc',
  others: [],
  watches: [],
  main: { image: null, desk: null, deskWeb: null },
  rows: [
    {
      when: '2026-10-29 11:50',
      outcome: 'failed',
      ticket: 'COD-1',
      detail: 'x',
      started: new Date('2026-10-29T11:50:00').toISOString(),
      finished: null
    }
  ]
});

export const usage: UsagePayload = {
  updated: '2026-10-29 11:00',
  windowDays: 30,
  total: 10,
  pricesDate: '2026-10-01',
  unpriced: [],
  models: [
    {
      model: 'opus',
      input: 1,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 5
    }
  ],
  days: [
    {
      day: '2026-10-28',
      planning: 1,
      orchestrating: 2,
      implementing: 3,
      total: 6
    }
  ],
  tickets: [
    {
      ticket: 'COD-30',
      planning: 1,
      orchestrating: 2,
      implementing: 3,
      total: 6,
      output: 1,
      cacheRead: 1
    }
  ]
};

export const activity: ActivityPayload = {
  updated: '2026-10-29 11:50',
  header: 'Updated 2026-10-29 11:50',
  dropped: '',
  rows: [
    {
      when: '2026-10-29 11:50',
      ticket: 'COD-30',
      actor: 'agent',
      change: 'moved <b>'
    }
  ]
};

export const hostSample = (
  ago: number,
  over: Partial<HostMetricRow> = {}
): HostMetricRow => ({
  id: 1,
  host: 'nuc',
  at: new Date(NOW.getTime() - ago * 6e4).toISOString(),
  cores: 4,
  load1: 1,
  load5: 1,
  load15: 1,
  mem_total: 8 * 2 ** 30,
  mem_available: 6 * 2 ** 30,
  swap_total: 2 * 2 ** 30,
  swap_free: 2 * 2 ** 30,
  disk_total: 100 * 2 ** 30,
  disk_free: 60 * 2 ** 30,
  cgroup_mem_current: null,
  cgroup_mem_max: null,
  ...over
});

// A sample `ago` minutes before NOW of a window that resets `resetsIn` hours after NOW
export const planSample = (
  kind: PlanUsageRow['kind'],
  resetsIn: number,
  used: number,
  ago = 0
): PlanUsageRow => ({
  kind,
  resets_at: new Date(NOW.getTime() + resetsIn * 36e5).toISOString(),
  used_percentage: used,
  sampled_at: new Date(NOW.getTime() - ago * 6e4).toISOString(),
  host: 'mac'
});

// An hour row `ago` whole hours before the current hour
export const hourRow = (
  ago: number,
  cost: number,
  over: Partial<UsageHourRow> = {}
): UsageHourRow => ({
  hour: new Date(
    Math.floor(NOW.getTime() / 36e5) * 36e5 - ago * 36e5
  ).toISOString(),
  host: 'mac',
  model: 'opus',
  role: 'planning',
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  cost_usd: cost,
  updated_at: NOW.toISOString(),
  ...over
});

export const filled = (
  session: SessionState = { state: 'none' }
): DeskState => {
  const s = createState();
  s.data.buckets.set('unstarted', [
    issue('COD-1', { labels: ['agent:ready'] }),
    issue('COD-2', { labels: ['agent:review'] }),
    issue('COD-3', { labels: ['agent:review'] }),
    issue('COD-4', { labels: ['agent:needs-input'] })
  ]);
  s.data.closed = [
    issue('COD-30', {
      statusType: 'completed',
      status: 'Done',
      labels: ['agent:review'],
      completedAt: '2026-10-28T10:00:00'
    })
  ];
  s.data.ideas = [
    issue('COD-50'),
    issue('COD-51', {
      statusType: 'canceled',
      canceledAt: '2026-10-20T00:00:00'
    })
  ];
  s.data.runs = runs(view({ session }));
  s.data.usage = usage;
  s.data.activity = activity;
  s.data.hostMetrics = [hostSample(10), hostSample(0)];
  s.data.planUsage = [
    planSample('five_hour', 2, 30),
    planSample('seven_day', 100, 18)
  ];
  s.data.usageHours = [hourRow(0, 1.5), hourRow(2, 3, { role: 'other' })];
  s.ideaReasons.set('COD-51', 'not worth it');
  return s;
};

/** A connection state, live or not */
export const connection = (live: boolean): DeskState['data']['connection'] => ({
  live,
  retries: 0,
  upSince: NOW.getTime() - 6e4,
  downSince: null,
  status: null,
  nextAt: null,
  lastIssue: null
});

/** The time `ago` minutes before NOW, in ms */
export const at = (ago: number): number => NOW.getTime() - ago * 6e4;

/** A state whose channel is down; `over` adjusts the connection */
export const down = (
  s: DeskState,
  over: Partial<DeskState['data']['connection']> = {}
): DeskState => {
  s.data.connection = {
    ...s.data.connection,
    live: false,
    retries: 2,
    downSince: at(2.7),
    status: 'CHANNEL_ERROR',
    nextAt: NOW.getTime() + 16000,
    ...over
  };
  return s;
};

/** A state whose channel came up a minute ago */
export const live = (s: DeskState): DeskState => {
  s.data.connection = { ...s.data.connection, live: true, upSince: at(1) };
  return s;
};

export const OLD = 'abc1234' + '0'.repeat(33);
export const NEW = 'def5678' + '0'.repeat(33);

/** A filled state whose runs report `main`, with the job on the container or not */
export const behind = (
  main: RunsPayload['main'],
  container: boolean
): DeskState => {
  const state = filled();
  const base = runs(view());
  state.data.runs = {
    ...base,
    main,
    job: base.job && {
      ...base.job,
      ...(container ? { host: 'container', rev: 'sha-abc1234' } : {})
    }
  };
  return state;
};

/** Every utility of a shared class string, such as `CARD`, is on the element */
export const carries = (el: Element | null, classes: string): boolean =>
  classes
    .trim()
    .split(/\s+/)
    .every((c) => el?.classList.contains(c) ?? false);
