import { describe, expect, it } from 'vitest';

import type { Issue } from '../../linear';
import type {
  ActivityPayload,
  HostMetricRow,
  PlanUsageRow,
  RunsPayload,
  UsageHourRow,
  UsagePayload
} from '../../supabase';
import { model } from '../model';
import {
  type DeskState,
  SHEET_IDS,
  createState,
  isSheetId,
  sheetIdOf
} from '../state';
import type { QueueView, SessionState } from '../types';

import {
  chartHeight,
  chartKind,
  gauge,
  shippedChart,
  sparkline,
  spendChart
} from './charts';
import { platform, renderStatus } from './header';
import { headline, renderSession } from './session';
import { SHEETS } from './sheets';
import { renderTiles } from './tiles';
import { renderWaiting, waitRows } from './waiting';

// Local-time dates, so the specs read the same in every time zone
const NOW = new Date('2026-10-29T12:00:00');

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
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

const view = (over: Partial<QueueView> = {}): QueueView => ({
  at: '2026-10-29T11:55:00',
  limit: { used: 2, max: 5 },
  session: { state: 'none' },
  next: [{ ticket: 'COD-1', reason: 'ready' }],
  held: { tickets: ['COD-9'], free: [{ action: 'review', ticket: 'COD-3' }] },
  parked: [{ ticket: 'COD-2', wait: 'ci', pr: 5 }],
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

const runs = (qv: QueueView | null): RunsPayload => ({
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
    items: ''
  },
  qv,
  viewInvalid: false,
  at: new Date('2026-10-29T11:55:00').toISOString(),
  main: { image: null, desk: null },
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

const usage: UsagePayload = {
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

const activity: ActivityPayload = {
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

const hostSample = (
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
const planSample = (
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
const hourRow = (
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

const filled = (session: SessionState = { state: 'none' }): DeskState => {
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

describe('sheets', () => {
  it('have an entry for every id, and a guard that knows the ids', () => {
    expect(Object.keys(SHEETS).sort()).toEqual([...SHEET_IDS].sort());
    for (const id of SHEET_IDS) expect(isSheetId(id)).toBe(true);
    expect(isSheetId('nope')).toBe(false);
    expect(isSheetId(null)).toBe(false);
    expect(isSheetId(undefined)).toBe(false);
  });

  it('map an old sheet id to the sheet that took its place', () => {
    expect(sheetIdOf('review')).toBe('review');
    expect(sheetIdOf('after')).toBe('review');
    expect(sheetIdOf('spend')).toBe('effort');
    expect(sheetIdOf('ticketcost')).toBe('effort');
    expect(sheetIdOf('nope')).toBeNull();
    expect(sheetIdOf('')).toBeNull();
    expect(sheetIdOf(null)).toBeNull();
    expect(sheetIdOf(7)).toBeNull();
  });

  it.each(SHEET_IDS)('render %s from filled and from empty state', (id) => {
    for (const state of [
      filled({
        state: 'alive',
        detail: 'working',
        lastSeen: '2026-10-29T11:50:00'
      }),
      createState()
    ]) {
      const html = SHEETS[id].body(model(state, NOW), state, NOW);
      expect(html.length).toBeGreaterThan(0);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('[object');
    }
    expect(SHEETS[id].title).not.toBe('');
  });

  it('escape the text of an activity row', () => {
    const state = filled();
    const html = SHEETS.activity.body(model(state, NOW), state, NOW);
    expect(html).toContain('moved &lt;b&gt;');
    expect(html).not.toContain('moved <b>');
  });

  it('show everything when the activity filter names a ticket that has left', () => {
    const state = filled();
    state.ui.actFilter = 'COD-1234';
    const html = SHEETS.activity.body(model(state, NOW), state, NOW);
    expect(html).toContain('1 event');
    expect(state.ui.actFilter).toBe('COD-1234');
  });

  it('mark the pressed filter on the All sheet', () => {
    const state = filled();
    state.ui.filter = 'agent';
    const html = SHEETS.all.body(model(state, NOW), state, NOW);
    expect(html).toContain('data-f="agent" aria-pressed="true"');
    expect(html).toContain('data-f="all" aria-pressed="false"');
  });
});

describe('session card', () => {
  it.each([
    [{ state: 'alive', detail: 'polling' }, 'Session live', 'live'],
    [{ state: 'waiting' }, 'Waiting on a prompt', 'wait'],
    [{ state: 'stopped' }, 'Session stopped', 'idle'],
    [{ state: 'none' }, 'No session', 'idle']
  ] satisfies [SessionState, string, string][])(
    'shows the session %j',
    (session, label, tone) => {
      const html = renderSession(model(filled(session), NOW), NOW);
      expect(html).toContain(label);
      expect(html).toContain(`session ${tone}" data-w="session"`);
    }
  );

  it('says it is loading before the runs arrive', () => {
    expect(renderSession(model(createState(), NOW), NOW)).toContain(
      'Loading the runs…'
    );
  });

  it('names the ticket, its reason and where the session runs', () => {
    const state = filled({
      state: 'alive',
      detail: 'working',
      id: 's1',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:30'
    });
    state.data.sessions = [
      {
        id: 's1',
        host: 'mac',
        kind: 'attended',
        last_seen: new Date('2026-10-29T11:59:30').toISOString()
      } as never
    ];
    const html = renderSession(model(state, NOW), NOW);
    expect(html).toContain('Working on');
    expect(html).toContain('COD-1</a>');
    expect(html).toContain('ready · Title of COD-1');
    expect(html).toContain('<b class="attended">attended on mac</b>');
    expect(html).toContain('seen 30 s ago');
  });

  it('says the session is stuck', () => {
    const state = filled({
      state: 'alive',
      detail: 'polling',
      lastSeen: '2026-10-29T10:00:00'
    });
    const html = renderSession(model(state, NOW), NOW);
    expect(html).toContain('Session stuck');
    expect(html).toContain('session block"');
  });

  it('lists the newest event of each live table, and says when there is none', () => {
    const state = filled();
    expect(renderSession(model(state, NOW), NOW)).toContain(
      'No live event yet'
    );
    state.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'check_suite:failure',
        updated_at: new Date('2026-10-29T11:59:00').toISOString()
      } as never
    ];
    state.data.connection.lastIssue = {
      issue_id: 'u',
      identifier: 'COD-<5>',
      action: 'update',
      updated_at: new Date('2026-10-29T11:50:00').toISOString()
    };
    const html = renderSession(model(state, NOW), NOW);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('dot block');
    expect(html).toContain('#7 · checks failed');
    expect(html).toContain('COD-&lt;5&gt; · update');
    expect(html.indexOf('#7')).toBeLessThan(html.indexOf('COD-&lt;5'));
  });
});

describe('header', () => {
  const connection = (live: boolean) => ({
    live,
    retries: 0,
    upSince: NOW.getTime() - 6e4,
    lastIssue: null
  });

  it('opens the scheduler sheet from the Platform pill', () => {
    const html = renderStatus(model(filled(), NOW), connection(true));
    expect(html).toContain('class="platform" data-w="scheduler"');
    expect(html).toContain('LIVE');
    expect(html).toContain('realtime ·');
  });

  it('shows the unknown state while polling', () => {
    const html = renderStatus(model(filled(), NOW), connection(false));
    expect(html).toContain('live off');
    expect(html).toContain('every 5 min');
  });

  it('counts failing checks and run problems, and a dash while loading', () => {
    expect(renderStatus(model(createState(), NOW), connection(true))).toContain(
      'checks –'
    );
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    const m = model(state, NOW);
    expect(platform(m).failing).toContain('scheduler silent 35 h');
    expect(renderStatus(m, connection(true))).toMatch(/\d+ failing/);
  });

  const OLD = 'abc1234' + '0'.repeat(33);
  const NEW = 'def5678' + '0'.repeat(33);
  const behind = (main: RunsPayload['main'], container: boolean) => {
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

  it('says when the image is behind main', () => {
    const state = behind({ image: NEW, desk: null }, true);
    const m = model(state, NOW, null);
    expect(platform(m).updates).toBe(1);
    expect(renderStatus(m, state.data.connection)).toContain('· 1 update');
    const html = SHEETS.scheduler.body(m, state, NOW);
    expect(html).toContain('cdwr agent deploy --host agent-host');
    expect(html).toContain('sha-def5678');
    expect(html).not.toContain('docker compose pull');
  });

  it('says when the desk is behind main', () => {
    const state = behind({ image: null, desk: NEW }, false);
    const m = model(state, NOW, OLD);
    // An update, but no failing check
    expect(platform(m).updates).toBe(1);
    expect(platform(m).failing).not.toContain('desk');
    expect(SHEETS.scheduler.body(m, state, NOW)).toContain(
      'cdwr agent desk install'
    );
  });

  it('shows neither when both are current', () => {
    const state = behind({ image: OLD, desk: OLD }, true);
    const m = model(state, NOW, OLD);
    expect(platform(m).updates).toBe(0);
    expect(renderStatus(m, state.data.connection)).not.toContain(
      'class="updates"'
    );
    const html = SHEETS.scheduler.body(m, state, NOW);
    expect(html).not.toContain('cdwr agent desk install');
    expect(html).not.toContain('docker compose pull');
  });
});

describe('waiting card, queue sheets and tiles', () => {
  it('show a placeholder while loading', () => {
    const html = renderWaiting(model(createState(), NOW), NOW);
    expect(html).toContain('Loading…');
    expect(html).toContain('<b class="count">–</b>');
    expect(html).not.toContain('waiting has');
  });

  it('list what waits on the viewer, with its kind and age', () => {
    const state = filled();
    state.data.activity = {
      ...activity,
      rows: [
        {
          when: '2026-10-29 10:00',
          ticket: 'COD-4',
          actor: 'agent',
          change: 'comment: **Agent: plan ready**'
        }
      ]
    };
    const m = model(state, NOW);
    expect(waitRows(m, NOW).map((r) => [r.id, r.kind])).toEqual([
      ['COD-4', 'plan'],
      ['COD-6', 'ready to label'],
      ['COD-50', 'idea']
    ]);
    const html = renderWaiting(m, NOW);
    expect(html).toContain('waiting has" data-w="before"');
    expect(html).toContain('<b class="count">3</b>');
    expect(html).toContain('<span class="kind">plan</span><time>2 h</time>');
    expect(html).toContain('href="https://linear.app/codeware/issue/COD-6"');
    expect(html).toContain('wait age from activity gate events');
  });

  it('render every row and hide all but two behind open all on a phone', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        table: {
          before: [
            { ticket: 'COD-4', kind: 'plan' },
            { ticket: 'COD-<7>', kind: 'question' }
          ],
          label: [],
          after: []
        }
      })
    );
    const m = model(state, NOW);
    const html = renderWaiting(m, NOW);
    expect(html.match(/class="wrow"/g)).toHaveLength(3);
    expect(html).toContain('+ 1 more — open all');
    expect(html).toContain('COD-&lt;7&gt;');
    expect(html).not.toContain('COD-<7>');
  });

  it('stay in place, neutral, when nothing waits', () => {
    const state = filled();
    state.data.ideas = [];
    state.data.runs = runs(
      view({ table: { before: [], label: [], after: [] } })
    );
    const html = renderWaiting(model(state, NOW), NOW);
    expect(html).toContain('Nothing waits on you.');
    expect(html).toContain('<b class="count">0</b>');
    expect(html).not.toContain('waiting has');
    expect(html).not.toContain('open all');
  });

  it('show a parked ticket on the next sheet, open PRs on the review sheet and hand-offs on their own', () => {
    const state = filled();
    const m = model(state, NOW);
    expect(SHEETS.next.body(m, state, NOW)).toContain('Parked on a wait · 1');
    expect(SHEETS.review.body(m, state, NOW)).toContain('data-pr="7"');
    const handoffs = SHEETS.handoffs.body(m, state, NOW);
    expect(handoffs).toContain('Merged, hand-offs left · 1');
    expect(handoffs).toContain('check it');
    expect(handoffs).toContain('Hand-off checklist:');
  });

  it('list the review sheet in merge order, queued without an event', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        table: {
          before: [],
          label: [],
          after: [
            { ticket: 'COD-3', kind: 'pr', pr: 7 },
            { ticket: 'COD-2', kind: 'pr', pr: 5 }
          ]
        }
      })
    );
    const m = model(state, NOW);
    const order = m.prs.map((x) => String(x.pr));
    const html = SHEETS.review.body(m, state, NOW);
    expect([...html.matchAll(/data-pr="(\d+)"/g)].map((x) => x[1])).toEqual(
      order
    );
    expect(html).toContain('<span class="pill neutral">queued</span>');
    expect(html).not.toContain('<time>');
    expect(html).toContain('Rows update in place as github_events lands');
    expect(html.match(/<span class="rank">\d+<\/span>/g)).toEqual([
      '<span class="rank">1</span>',
      '<span class="rank">2</span>'
    ]);
  });

  it('mark a review row that has to merge later', () => {
    const state = filled();
    const base = model(state, NOW);
    const m = {
      ...base,
      prBlockers: new Map([
        [base.prs[0].ticket, [{ ticket: 'COD-9', pr: 4 as never }]]
      ])
    } as typeof base;
    const html = SHEETS.review.body(m, state, NOW);
    expect(html).toContain('class="pr-row blocked"');
    expect(html).toContain('<span class="chip blocked">merge later</span>');
    expect(html).toContain('Merge order: merge');
    expect(SHEETS.review.body(base, state, NOW)).not.toContain('merge later');
  });

  it('change a review row in place when a newer github event lands', () => {
    const event = (action: string, minutesAgo: number) =>
      ({
        pr: 7,
        subject: 'x',
        action,
        updated_at: new Date(NOW.getTime() - minutesAgo * 6e4).toISOString()
      }) as never;
    const state = filled();
    state.data.githubEvents = [event('check_suite:success', 12)];
    const before = SHEETS.review.body(model(state, NOW), state, NOW);
    expect(before).toContain('<span class="pill ok">checks passed</span>');
    expect(before).toContain('<time>12 m ago</time>');
    state.data.githubEvents = [
      event('pull_request_review:copilot', 2),
      event('check_suite:success', 12)
    ];
    const after = SHEETS.review.body(model(state, NOW), state, NOW);
    expect(after).toContain(
      '<span class="pill wait">Copilot reviewed — your turn</span>'
    );
    expect(after).toContain('<time>2 m ago</time>');
    expect(after).not.toContain('checks passed');
    state.data.githubEvents = [event('check_suite:failure', 1)];
    expect(SHEETS.review.body(model(state, NOW), state, NOW)).toContain(
      '<span class="pill bad">checks failed</span>'
    );
  });

  it('give each thing that waits on you a card with its action', () => {
    const state = filled();
    state.data.activity = {
      ...activity,
      rows: [
        {
          when: '2026-10-29 10:00',
          ticket: 'COD-4',
          actor: 'agent',
          change: 'comment: **Agent: plan ready**'
        }
      ]
    };
    const html = SHEETS.before.body(model(state, NOW), state, NOW);
    expect(html.match(/class="wcard"/g)).toHaveLength(2);
    expect(html).toContain('class="kind k-plan">plan</span>');
    expect(html).toContain('<time>waiting 2 h</time>');
    expect(html).toMatch(/class="act primary"[^>]*>Answer in Linear<\/a>/);
    expect(html).toContain(
      'class="kind k-ready-to-label">ready to label</span>'
    );
    expect(html).toMatch(/class="act secondary"[^>]*>Label agent:ready<\/a>/);
    expect(html).toContain('Ideas to decide · 1');
  });

  it('list the hosts with live sessions on the session sheet', () => {
    const state = filled();
    expect(SHEETS.session.body(model(state, NOW), state, NOW)).toContain(
      'No live session on any host.'
    );
    state.data.sessions = [
      {
        id: 's1',
        host: 'nuc',
        kind: 'implement',
        last_seen: new Date(NOW.getTime() - 3 * 6e4).toISOString()
      } as never
    ];
    const html = SHEETS.session.body(model(state, NOW), state, NOW);
    expect(html).toContain('<b>nuc</b>');
    expect(html).toContain('1 session · implement · newest heartbeat 3 m ago');
  });

  it('count the runs of today on the runs sheet, and keep them off the scheduler sheet', () => {
    const state = filled();
    const m = model(state, NOW);
    const html = SHEETS.runs.body(m, state, NOW);
    expect(html).toContain('<b>1</b><span>runs today</span>');
    expect(html).toContain('<b>–</b><span>median duration</span>');
    expect(html).toContain('<b>1</b><span>failed</span>');
    expect(html).toContain('Recent runs that did something, last 30 days');
    expect(html).toContain('idle runs are left out');
    expect(SHEETS.scheduler.body(m, state, NOW)).not.toContain(
      'Recent runs that did something'
    );
  });

  it('put the cost per ticket and the spend per day on the effort sheet', () => {
    const state = filled();
    const html = SHEETS.effort.body(model(state, NOW), state, NOW);
    expect(html).toContain('Every ticket with usage');
    expect(html).toContain('By model');
    expect(html).toContain('data-chart="spend"');
  });

  it('show a parked review only as its open PR', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        parked: [
          { ticket: 'COD-3', wait: 'ci', pr: 7, since: '2026-10-29T11:50:00' }
        ]
      })
    );
    const m = model(state, NOW);
    expect(m.parked).toEqual([]);
    expect(SHEETS.next.body(m, state, NOW)).not.toContain('Parked on a wait');
    const review = SHEETS.review.body(m, state, NOW);
    expect(review).toContain('COD-3');
    expect(review).toContain('Review fixes: waits on CI since');
    expect(headline(m, NOW).note).toContain('COD-3');
  });

  it('drop a parked ticket a live change moved on from', () => {
    const state = filled();
    state.data.buckets.set('started', [
      issue('COD-2', {
        statusType: 'started',
        labels: ['agent:review'],
        updatedAt: '2026-10-29T11:57:00'
      })
    ]);
    state.data.buckets.set(
      'unstarted',
      (state.data.buckets.get('unstarted') ?? []).filter(
        (i) => i.id !== 'COD-2'
      )
    );
    state.details.set('COD-2', {
      steps: 4,
      done: 4,
      next: "waiting for Håkan's review of PR 5",
      idea: null,
      blockedBy: [],
      pr: 5
    });
    const m = model(state, NOW);
    expect(m.parked).toEqual([]);
    expect(SHEETS.next.body(m, state, NOW)).not.toContain('Parked on a wait');
  });

  it('draw the NUC sheet with a gauge and a sparkline per figure', () => {
    const state = filled();
    const html = SHEETS.nuc.body(model(state, NOW), state, NOW);
    expect(html.match(/class="gauge"/g)).toHaveLength(4);
    expect(html.match(/class="spark"/g)).toHaveLength(4);
    expect(html).toContain('Within limits');
    expect(html).not.toContain('Container memory');
  });

  it('add the container figure when it has a memory limit', () => {
    const state = filled();
    state.data.hostMetrics = [
      hostSample(0, {
        cgroup_mem_current: 2 * 2 ** 30,
        cgroup_mem_max: 4 * 2 ** 30
      })
    ];
    const html = SHEETS.nuc.body(model(state, NOW), state, NOW);
    expect(html).toContain('Container memory');
    expect(html).toContain('2.0 GiB of its 4.0 GiB limit');
    expect(html.match(/class="gauge"/g)).toHaveLength(5);
  });

  it('name the problem on the NUC sheet and mark the tile bad', () => {
    const state = filled();
    state.data.hostMetrics = [hostSample(0, { mem_available: 0.2 * 2 ** 30 })];
    const m = model(state, NOW);
    expect(SHEETS.nuc.body(m, state, NOW)).toContain('memory used above 90%');
    expect(renderTiles(m, state, NOW)).toMatch(/tile bad" data-w="nuc"/);
  });

  it('show the NUC tile as the worse of load and memory with the verdict', () => {
    const state = filled();
    const html = renderTiles(model(state, NOW), state, NOW);
    expect(html).toMatch(/data-w="nuc"[^>]*>.*<b class="v">25% · ok<\/b>/);
  });

  it('name the first problem on the NUC tile, not the worse of load and memory', () => {
    const disk = filled();
    disk.data.hostMetrics = [
      hostSample(0, { disk_free: 5 * 2 ** 30, mem_available: 7 * 2 ** 30 })
    ];
    expect(renderTiles(model(disk, NOW), disk, NOW)).toMatch(
      /data-w="nuc"[^>]*>.*<b class="v">disk 95% · bad<\/b>/
    );
    const swap = filled();
    swap.data.hostMetrics = [
      hostSample(10, { swap_free: 2 * 2 ** 30 }),
      hostSample(0, { swap_free: 1 * 2 ** 30 })
    ];
    expect(renderTiles(model(swap, NOW), swap, NOW)).toMatch(
      /data-w="nuc"[^>]*>.*<b class="v">swap growing · bad<\/b>/
    );
  });

  it('show a stale NUC as stale and no samples as a dash', () => {
    const stale = filled();
    stale.data.hostMetrics = [hostSample(90)];
    expect(renderTiles(model(stale, NOW), stale, NOW)).toMatch(
      /data-w="nuc"[^>]*>.*<b class="v">stale<\/b>/
    );
    expect(SHEETS.nuc.body(model(stale, NOW), stale, NOW)).toContain(
      'No sample for 1 h 30 min'
    );
    const none = filled();
    none.data.hostMetrics = [];
    expect(renderTiles(model(none, NOW), none, NOW)).toMatch(
      /data-w="nuc"[^>]*>.*<b class="v">–<\/b>/
    );
    expect(SHEETS.nuc.body(model(none, NOW), none, NOW)).toContain(
      'No host samples yet'
    );
  });

  const tileOf = (html: string, id: string): string =>
    html.match(
      new RegExp(`<button[^>]*data-w="${id}"[^>]*>.*?</button>`)
    )?.[0] ?? '';

  it('give every tile a sheet, the interim four in their own row', () => {
    const state = filled();
    const html = renderTiles(model(state, NOW), state, NOW);
    const [main, interim] = html.split('Until the Platform view');
    expect(html).toContain('<h2>Everything else</h2>');
    for (const id of [
      'next',
      'review',
      'handoffs',
      'session',
      'runs',
      'activity',
      'shipped',
      'effort',
      'all',
      'ideas'
    ])
      expect(main).toContain(`data-w="${id}"`);
    for (const id of ['limit', 'nuc', 'plan', 'timers']) {
      expect(interim).toContain(`data-w="${id}"`);
      expect(main).not.toContain(`data-w="${id}"`);
    }
    expect(interim).toContain('class="tiles small"');
  });

  it('show the value and sub-line of each of the ten tiles', () => {
    const state = filled();
    state.data.sessions = [
      {
        id: 's1',
        host: 'nuc',
        kind: 'implement',
        last_seen: new Date(NOW.getTime() - 3 * 6e4).toISOString()
      } as never,
      {
        id: 's2',
        host: 'mac',
        kind: 'attended',
        last_seen: new Date(NOW.getTime() - 1 * 6e4).toISOString()
      } as never
    ];
    const html = renderTiles(model(state, NOW), state, NOW);
    const tile = (id: string, value: string, sub: string) => {
      const t = tileOf(html, id);
      expect(t).toContain(`<b class="v">${value}</b>`);
      expect(t).toContain(`<span class="s">${sub}</span>`);
    };
    tile('next', '1', 'COD-1 · ready');
    tile('review', '1', '0 await you · live');
    tile('handoffs', '1', 'merged, steps remain');
    tile('session', '2', 'mac attended · nuc implement');
    tile('runs', '1', 'median – · 1 failed');
    tile('activity', '1', 'agent 1 · you 0');
    tile('shipped', '1', '≈ 0.0 per day');
    tile('effort', '$6', 'simulated · $6 per ticket');
    tile('all', '4', 'via Linear poll, 5 min');
    tile('ideas', '1', 'COD-50 · accept?');
    expect(tileOf(html, 'next')).toContain('class="tile"');
  });

  it('omit the sub-line of a tile that has none, and show dashes before the runs', () => {
    const state = createState();
    const html = renderTiles(model(state, NOW), state, NOW);
    expect(tileOf(html, 'next')).toContain('<b class="v">–</b>');
    expect(tileOf(html, 'next')).not.toContain('class="s"');
  });

  it('mark the review tile bad when checks failed, and the runs tile bad on a failure', () => {
    const state = filled();
    state.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'check_suite:failure',
        updated_at: new Date('2026-10-29T11:59:00').toISOString()
      } as never
    ];
    let html = renderTiles(model(state, NOW), state, NOW);
    expect(tileOf(html, 'review')).toContain('class="tile bad"');
    expect(tileOf(html, 'runs')).toContain('class="tile bad"');

    state.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'pull_request_review:copilot',
        updated_at: new Date('2026-10-29T11:59:00').toISOString()
      } as never
    ];
    state.data.runs = runs(view());
    state.data.runs.rows = [];
    html = renderTiles(model(state, NOW), state, NOW);
    expect(tileOf(html, 'review')).not.toContain('tile bad');
    expect(tileOf(html, 'review')).toContain('1 await you · live');
    expect(tileOf(html, 'runs')).not.toContain('tile bad');
    expect(tileOf(html, 'runs')).toContain('median – · 0 failed');
  });

  it('show the plan tile as both used shares', () => {
    const state = filled();
    const html = renderTiles(model(state, NOW), state, NOW);
    expect(html).toMatch(
      /tile" data-w="plan"[^>]*>.*<b class="v">5h 30% · 7d 18%<\/b>/
    );
  });

  it('show a reset or missing plan window as a dash, and no data at all as one', () => {
    const reset = filled();
    reset.data.planUsage = [
      planSample('five_hour', -1, 90, 200),
      planSample('seven_day', 100, 18)
    ];
    expect(renderTiles(model(reset, NOW), reset, NOW)).toMatch(
      /data-w="plan"[^>]*>.*<b class="v">5h – · 7d 18%<\/b>/
    );
    const none = filled();
    none.data.planUsage = [];
    expect(renderTiles(model(none, NOW), none, NOW)).toMatch(
      /data-w="plan"[^>]*>.*<b class="v">5h – · 7d –<\/b>/
    );
  });

  it('append the age to a stale plan tile', () => {
    const state = filled();
    state.data.planUsage = [
      planSample('five_hour', 2, 30, 180),
      planSample('seven_day', 100, 18, 90)
    ];
    expect(renderTiles(model(state, NOW), state, NOW)).toMatch(
      /data-w="plan"[^>]*>.*<b class="v">5h 30% · 7d 18% · 3 h ago<\/b>/
    );
  });

  it('mark the plan tile bad when a window will run out before its reset', () => {
    const state = filled();
    state.data.planUsage = [
      planSample('five_hour', 2, 70),
      planSample('seven_day', 100, 18)
    ];
    expect(renderTiles(model(state, NOW), state, NOW)).toMatch(
      /tile bad" data-w="plan"/
    );
  });

  it('draw the plan sheet with a bar and a projection per window', () => {
    const state = filled();
    const html = SHEETS.plan.body(model(state, NOW), state, NOW);
    expect(html).toContain('5-hour window');
    expect(html).toContain('7-day window');
    expect(html).toContain('At this rate 50% at reset');
    expect(html.match(/class="gauge"/g)).toHaveLength(2);
    expect(html.match(/class="spark"/g)).toHaveLength(1);
    expect(html).toContain('Last 24 hours');
    expect(html).toContain('API-equivalent dollars');
  });

  it('say when a plan window runs out and when it is used up', () => {
    const warn = filled();
    warn.data.planUsage = [planSample('five_hour', 2, 70)];
    expect(SHEETS.plan.body(model(warn, NOW), warn, NOW)).toMatch(
      /Runs out ~.*, before the .* reset/
    );
    const bad = filled();
    bad.data.planUsage = [planSample('five_hour', 2, 100)];
    expect(SHEETS.plan.body(model(bad, NOW), bad, NOW)).toContain(
      'Used up until'
    );
  });

  it('say a plan window has reset', () => {
    const state = filled();
    state.data.planUsage = [planSample('five_hour', -1, 90, 200)];
    expect(SHEETS.plan.body(model(state, NOW), state, NOW)).toContain(
      'The window has reset'
    );
  });

  it('total the roles on the plan sheet', () => {
    const state = filled();
    const html = SHEETS.plan.body(model(state, NOW), state, NOW);
    expect(html).toContain('<td>total</td><td>$4.50</td><td>$4.50</td>');
    expect(html).toContain('<td>other</td><td>$3.00</td><td>$3.00</td>');
  });

  it('explain a missing plan_usage or usage_hours table, or no samples yet', () => {
    const failed = filled();
    failed.data.planUsage = null;
    failed.data.usageHours = null;
    failed.errors.set('planUsage', { code: 'bad_response', message: 'x' });
    failed.errors.set('usageHours', { code: 'bad_response', message: 'x' });
    const html = SHEETS.plan.body(model(failed, NOW), failed, NOW);
    expect(html).toContain("The plan_usage table couldn't load from Supabase.");
    expect(html).toContain(
      "The usage_hours table couldn't load from Supabase."
    );

    const loading = filled();
    loading.data.planUsage = null;
    loading.data.usageHours = null;
    const wait = SHEETS.plan.body(model(loading, NOW), loading, NOW);
    expect(wait).toContain('Loading the plan samples');
    expect(wait).toContain('Loading the hourly usage');

    const none = filled();
    none.data.planUsage = [];
    none.data.usageHours = [];
    const empty = SHEETS.plan.body(model(none, NOW), none, NOW);
    expect(empty).toContain('cdwr agent statusline install');
    expect(empty).toContain('No hourly usage yet');
    expect(empty).toContain('a proxy for what the plan counts');
  });
});

describe('charts', () => {
  const days = Array.from({ length: 30 }, (_, n) => ({
    key: `2026-10-${String(n + 1).padStart(2, '0')}`,
    items: n === 5 ? [issue('COD-1'), issue('COD-2')] : []
  }));

  it('draw a hit area per day and a tooltip that names the tickets', () => {
    const chart = shippedChart(days, 600, 200);
    expect(chart.html.match(/class="hit"/g)).toHaveLength(30);
    expect(chart.tip(5)?.html).toContain('COD-1, COD-2');
    expect(chart.tip(99)).toBeNull();
  });

  it('keep a minimum width', () => {
    expect(shippedChart(days, 0, 200).html).toContain('viewBox="0 0 240 200"');
    const spend = spendChart(
      days.map((d) => ({
        key: d.key,
        planning: 1,
        orchestrating: 0,
        implementing: 0,
        total: 1
      })),
      0,
      200
    );
    expect(spend.html).toContain('viewBox="0 0 240 200"');
    expect(spend.tip(0)?.html).toContain('planning $1.00');
  });

  it('read the placeholder attributes', () => {
    expect(chartKind('spend')).toBe('spend');
    expect(chartKind('')).toBe('shipped');
    expect(chartKind(undefined)).toBe('shipped');
    expect(chartHeight('200')).toBe(200);
    expect(chartHeight(undefined)).toBe(150);
  });

  it('fill a gauge to its share, clamped, and mark a bad one', () => {
    expect(gauge(0.5, false)).toContain('class="fill" width="50"');
    expect(gauge(3, true)).toContain('class="fill bad" width="100"');
    expect(gauge(-1, false)).toContain('width="0"');
  });

  it('draw a sparkline over the window with the limit marked', () => {
    const html = sparkline(
      [
        { at: 0, value: 0 },
        { at: 100, value: 1 }
      ],
      0,
      100,
      1,
      0.5,
      'Load'
    );
    expect(html).toContain('points="0.0,40.0 240.0,0.0"');
    expect(html).toContain('class="limit"');
    expect(html).toContain('aria-label="Load"');
  });

  it('leave a sparkline without a line for fewer than two points', () => {
    const html = sparkline([{ at: 5, value: 1 }], 0, 10, 1, null, 'x');
    expect(html).not.toContain('polyline');
    expect(html).not.toContain('class="limit"');
  });
});
