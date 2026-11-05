import { describe, expect, it } from 'vitest';

import type { Issue } from '../../linear';
import type {
  ActivityPayload,
  DeskCommandRow,
  HostMetricRow,
  PlanUsageRow,
  RunsPayload,
  SnoozeRow,
  UsageHourRow,
  UsagePayload
} from '../../supabase';
import { dayTime, hhmm } from '../format';
import { model } from '../model';
import {
  type DeskState,
  SHEET_IDS,
  createState,
  isSheetId,
  sheetIdOf,
  viewOf
} from '../state';
import type { QueueView, SessionState } from '../types';

import { renderCapacity } from './capacity';
import {
  chartHeight,
  chartKind,
  cpuChart,
  gauge,
  shippedChart,
  sparkline,
  spendChart
} from './charts';
import { platform, renderStatus } from './header';
import { renderPlatform } from './platform';
import {
  renderAlert,
  renderFrozenLabel,
  renderProblems,
  renderUnknownSession,
  tickText
} from './problems';
import { headline, renderSession } from './session';
import { SHEETS } from './sheets';
import { renderTiles } from './tiles';
import {
  countedRows,
  forgetLabelled,
  isSnoozed,
  labelState,
  renderWaiting,
  snoozeUi,
  waitRows
} from './waiting';

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
  blocked: [],
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
    expect(sheetIdOf('nuc')).toBeNull();
    expect(sheetIdOf('nope')).toBeNull();
    expect(sheetIdOf('')).toBeNull();
    expect(sheetIdOf(null)).toBeNull();
    expect(sheetIdOf(7)).toBeNull();
  });

  it('name the Platform view from its hash, and from the old nuc link', () => {
    expect(viewOf('platform')).toBe('platform');
    expect(viewOf('nuc')).toBe('platform');
    expect(viewOf('scheduler')).toBeNull();
    expect(viewOf('')).toBeNull();
    expect(viewOf(null)).toBeNull();
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
      const state = filled(session);
      const html = renderSession(model(state, NOW), state.details, NOW);
      expect(html).toContain(label);
      expect(html).toContain(`session ${tone}" data-w="session"`);
    }
  );

  it('says it is loading before the runs arrive', () => {
    expect(renderSession(model(createState(), NOW), new Map(), NOW)).toContain(
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
    const html = renderSession(model(state, NOW), state.details, NOW);
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
    const html = renderSession(model(state, NOW), state.details, NOW);
    expect(html).toContain('Session stuck');
    expect(html).toContain('session block"');
  });

  it('lists the newest event of each live table, and says when there is none', () => {
    const state = filled();
    expect(renderSession(model(state, NOW), state.details, NOW)).toContain(
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
    const html = renderSession(model(state, NOW), state.details, NOW);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('dot block');
    expect(html).toContain('#7 · checks failed');
    expect(html).toContain('COD-&lt;5&gt; · update');
    expect(html.indexOf('#7')).toBeLessThan(html.indexOf('COD-&lt;5'));
  });

  describe('more lines', () => {
    const working = (ticket: string): SessionState => ({
      state: 'alive',
      detail: 'working',
      id: 's1',
      ticket,
      lastSeen: '2026-10-29T11:59:30'
    });
    const html = (s: DeskState): string =>
      renderSession(model(s, NOW), s.details, NOW);
    const detail = (done: number, steps = 5, next: string | null = null) => ({
      steps,
      done,
      next,
      idea: null,
      blockedBy: [],
      pr: null,
      prAt: null
    });
    const host = (id: string, host: string, kind: string, ago = 1) =>
      ({
        id,
        host,
        kind,
        last_seen: new Date(NOW.getTime() - ago * 6e4).toISOString()
      }) as never;

    it('shows the step the working ticket is on, with its next step', () => {
      const s = filled(working('COD-1'));
      s.details.set('COD-1', detail(2, 5, 'wire the bar <now>'));
      const out = html(s);
      expect(out).toContain('<i style="width:40%"></i>');
      expect(out).toContain('<span>Step 3 of 5</span>');
      expect(out).toContain(
        '<span class="ct-next">wire the bar &lt;now&gt;</span>'
      );
    });

    it('caps the step at the last one, and leaves the next out when there is none', () => {
      const s = filled(working('COD-1'));
      s.details.set('COD-1', detail(5));
      const out = html(s);
      expect(out).toContain('Step 5 of 5');
      expect(out).not.toContain('ct-next');
    });

    it('leaves the step out without a plan, and when no ticket is being worked', () => {
      const s = filled(working('COD-1'));
      expect(html(s)).not.toContain('ct-step');
      s.details.set('COD-1', detail(0, 0));
      expect(html(s)).not.toContain('ct-step');
      const idle = filled({ state: 'alive', detail: 'polling' });
      idle.details.set('COD-1', detail(2));
      expect(html(idle)).not.toContain('ct-step');
    });

    it('says what the working ticket waits on, and for how long', () => {
      const s = filled(working('COD-2'));
      s.data.runs = runs(
        view({
          session: working('COD-2'),
          parked: [
            { ticket: 'COD-2', wait: 'ci', pr: 5, since: '2026-10-29T11:48:00' }
          ]
        })
      );
      const out = html(s);
      expect(out).toMatch(
        /<div class="ct-wait">waits on CI on .*#5.* for 12 m<\/div>/
      );
      expect(html(filled(working('COD-1')))).not.toContain('ct-wait');
      expect(html(filled())).not.toContain('ct-wait');
    });

    it('drops the age of a resolved wait', () => {
      const s = filled(working('COD-2'));
      s.data.runs = runs(
        view({
          session: working('COD-2'),
          parked: [
            {
              ticket: 'COD-2',
              wait: 'ci',
              pr: 5,
              since: '2026-10-29T11:48:00',
              resolved: true
            }
          ]
        })
      );
      const out = html(s);
      expect(out).toContain('ct-wait');
      expect(out).not.toContain(' for 12 m');
    });

    it('opens the feed with the own PR and its state, under a heading', () => {
      const s = filled(working('COD-2'));
      s.data.githubEvents = [
        {
          pr: 5,
          subject: 'x',
          action: 'check_suite:success',
          updated_at: new Date('2026-10-29T11:56:00').toISOString()
        } as never
      ];
      const out = html(s);
      expect(out).toContain('<h4 class="feed-h">Latest events</h4>');
      expect(out).toMatch(
        /<ul class="feed"><li class="own"><a class="prn[^>]*>#5<\/a> <span class="pill ok">checks passed<\/span><time>4 m ago<\/time><\/li><li>/
      );
    });

    it('says queued for an own PR with no event, and keeps the fallback otherwise', () => {
      const s = filled(working('COD-2'));
      expect(html(s)).toContain('<li class="own">');
      expect(html(s)).toContain('<span class="pill neutral">queued</span>');
      expect(html(s)).not.toContain('No live event yet');
      const idle = html(filled());
      expect(idle).toContain('No live event yet');
      expect(idle).not.toContain('class="own"');
      expect(html(filled(working('COD-1')))).not.toContain('class="own"');
    });

    it("names what comes next, skipping the session's own ticket", () => {
      const s = filled(working('COD-1'));
      expect(html(s)).not.toContain('ct-then');
      s.data.runs = runs(
        view({
          session: working('COD-1'),
          next: [
            { ticket: 'COD-1', reason: 'ready' },
            { ticket: 'COD-4', reason: 'answered' }
          ]
        })
      );
      expect(html(s)).toMatch(
        /<div class="ct-then">Then: <a[^>]*>COD-4<\/a> \(answered\)<\/div>/
      );
      expect(html(filled())).not.toContain('ct-then');
    });

    it('shows the plan headroom, the 7-day share only when it has one', () => {
      const s = filled();
      const both = html(s);
      expect(both).toContain('Plan: 5h <span class="">30%</span> · resets ');
      expect(both).toContain(' · 7d <span class="">18%</span></div>');
      s.data.planUsage = [planSample('five_hour', 2, 30)];
      expect(html(s)).toContain('Plan: 5h');
      expect(html(s)).not.toContain('7d');
    });

    it('marks a window bad when it runs out, and shows nothing without a 5-hour window', () => {
      const s = filled();
      s.data.planUsage = [
        planSample('five_hour', 2, 70),
        planSample('seven_day', 100, 18)
      ];
      const out = html(s);
      expect(out).toContain('5h <span class="bad">70%</span>');
      expect(out).toContain('7d <span class="">18%</span>');
      s.data.planUsage = [planSample('seven_day', 100, 18)];
      expect(html(s)).not.toContain('ct-plan');
      s.data.planUsage = [planSample('five_hour', -1, 90, 200)];
      expect(html(s)).not.toContain('ct-plan');
    });

    it('lists the other live sessions, two at most', () => {
      const s = filled(working('COD-1'));
      s.data.sessions = [host('s1', 'mac', 'attended')];
      expect(html(s)).not.toContain('ct-also');
      s.data.sessions = [
        host('s1', 'mac', 'attended'),
        host('s2', 'nuc', 'implement', 2)
      ];
      expect(html(s)).toContain(
        '<div class="ct-also">also: implement on nuc</div>'
      );
      s.data.sessions = [
        host('s1', 'mac', 'attended'),
        host('s2', 'nuc', 'implement', 2),
        host('s3', 'nuc', 'plan', 3),
        host('s4', 'mac', 'attended', 4),
        host('s5', 'mac', 'attended', 5)
      ];
      const out = html(s);
      // Five live sessions, one of them the card's own: four others, two shown
      expect(out.match(/also: ([^<]*)</)?.[1]).toMatch(
        /^[^·]+ · [^·]+ \+2 more$/
      );
    });
  });
});

describe('header', () => {
  const connection = (live: boolean) => ({
    live,
    retries: 0,
    upSince: NOW.getTime() - 6e4,
    downSince: null,
    status: null,
    nextAt: null,
    lastIssue: null
  });

  it('opens the Platform view from the Platform pill', () => {
    const html = renderStatus(model(filled(), NOW), connection(true));
    expect(html).toContain('class="platform" data-view="platform"');
    expect(html).not.toContain('aria-haspopup');
    expect(html).toContain('LIVE');
    expect(html).toContain('realtime ·');
  });

  it('shows the unknown state while polling', () => {
    const html = renderStatus(model(filled(), NOW), connection(false));
    expect(html).toContain('conn off');
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
    const html = renderWaiting(model(createState(), NOW), new Map(), NOW);
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
    expect(waitRows(m, state.details, NOW).map((r) => [r.id, r.kind])).toEqual([
      ['COD-3', 'review'],
      ['COD-5', 'hand-offs'],
      ['COD-4', 'plan'],
      ['COD-6', 'ready to label'],
      ['COD-50', 'idea']
    ]);
    const html = renderWaiting(m, state.details, NOW);
    expect(html).toContain('waiting has" data-w="before"');
    expect(html).toContain('<b class="count">5</b>');
    expect(html).toContain('<span class="kind">hand-offs · 1</span>');
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
    const html = renderWaiting(m, state.details, NOW);
    expect(html.match(/class="wrow"/g)).toHaveLength(3);
    expect(html).toContain(
      '<button type="button" class="more-all" aria-haspopup="dialog">+ <span class="more-n phone">1</span> more — open all</button>'
    );
    expect(html).toContain('COD-&lt;7&gt;');
    expect(html).not.toContain('COD-<7>');
  });

  it.each([
    [0, null],
    [2, null],
    [3, 'more-all'],
    [4, 'more-all'],
    [5, 'more-all more-desk'],
    [8, 'more-all more-desk']
  ])('with %i rows, show the more button as %s', (n, cls) => {
    const state = filled();
    state.data.ideas = [];
    state.data.runs = runs(
      view({
        table: {
          before: Array.from({ length: n }, (_, i) => ({
            ticket: `COD-${10 + i}`,
            kind: 'plan' as const
          })),
          label: [],
          after: []
        }
      })
    );
    const html = renderWaiting(model(state, NOW), state.details, NOW);
    expect(html.match(/class="wrow"/g) ?? []).toHaveLength(n);
    if (cls === null) {
      expect(html).not.toContain('more-all');
      return;
    }
    expect(html).toContain(
      `<button type="button" class="${cls}" aria-haspopup="dialog">+ <span class="more-n phone">${n - 2}</span>${n > 4 ? `<span class="more-n desk">${n - 4}</span>` : ''} more — open all</button>`
    );
    // Inside the card, so a click opens the full Waiting on you sheet
    expect(html.indexOf('more-all')).toBeGreaterThan(
      html.indexOf('data-w="before"')
    );
    expect(html.indexOf('more-all')).toBeLessThan(html.indexOf('</article>'));
  });

  it('stay in place, neutral, when nothing waits', () => {
    const state = filled();
    state.data.ideas = [];
    state.data.runs = runs(
      view({ table: { before: [], label: [], after: [] } })
    );
    const html = renderWaiting(model(state, NOW), state.details, NOW);
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
    expect(html.match(/class="wcard"/g)).toHaveLength(4);
    expect(html).toMatch(/class="act primary"[^>]*>Review on GitHub<\/a>/);
    expect(html).toContain('pull/7');
    expect(html).toMatch(/class="act primary"[^>]*>Open checklist<\/a>/);
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
    expect(headline(m, state.details, NOW).note).toContain('COD-3');
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
      pr: 5,
      prAt: null
    });
    const m = model(state, NOW);
    expect(m.parked).toEqual([]);
    expect(SHEETS.next.body(m, state, NOW)).not.toContain('Parked on a wait');
  });

  const tileOf = (html: string, id: string): string =>
    html.match(
      new RegExp(`<button[^>]*data-w="${id}"[^>]*>.*?</button>`)
    )?.[0] ?? '';

  it('give every tile a sheet, with the plan and timers among them and no interim row', () => {
    const state = filled();
    const html = renderTiles(model(state, NOW), state, NOW);
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
      'plan',
      'timers',
      'all',
      'ideas'
    ])
      expect(html).toContain(`data-w="${id}"`);
    // The limit and the NUC moved to the Capacity row
    expect(html).not.toContain('data-w="limit"');
    expect(html).not.toContain('data-w="nuc"');
    expect(html).not.toContain('Until the Platform view');
    expect(html).not.toContain('tiles small');
    expect(html.indexOf('data-w="effort"')).toBeLessThan(
      html.indexOf('data-w="plan"')
    );
    expect(html.indexOf('data-w="timers"')).toBeLessThan(
      html.indexOf('data-w="all"')
    );
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

describe('capacity row', () => {
  const GIB = 2 ** 30;
  const jobWith = (
    over: Partial<NonNullable<RunsPayload['job']>>,
    limit?: QueueView['limit']
  ): DeskState => {
    const s = filled();
    const base = runs(limit ? view({ limit }) : view());
    s.data.runs = { ...base, job: base.job && { ...base.job, ...over } };
    return s;
  };
  const html = (s: DeskState): string => renderCapacity(model(s, NOW));
  const session = (host: string, kind: string, ago: number) =>
    ({
      id: `${host}-${kind}`,
      host,
      kind,
      last_seen: new Date(NOW.getTime() - ago * 6e4).toISOString()
    }) as never;

  it('show the PRs in flight against the limit, with the free slots', () => {
    const out = html(filled());
    expect(out).toContain('LIMITS');
    expect(out).toContain('data-w="limit"');
    expect(out).toContain('Agent PRs in flight');
    expect(out).toContain('<b class="cap-v">2 / 5</b>');
    expect(out).toContain('3 slots free · merges free a slot live');
    expect(out).toContain('cap-meter cap-btn neutral');
    expect(out).toContain('<i class="neutral" style="width:40.0%"');
  });

  it('turn the PRs meter amber one below the limit and say when no slot is free', () => {
    const one = html(jobWith({}, { used: 4, max: 5 }));
    expect(one).toContain('1 slot free · merges free a slot live');
    expect(one).toContain('cap-meter cap-btn wait');
    const full = html(jobWith({}, { used: 5, max: 5 }));
    expect(full).toContain('no slot free');
    expect(full).not.toContain('slots free');
    expect(full).toContain('cap-meter cap-btn wait');
  });

  it.each([
    [23, '57%', 'ok'],
    [32, '80%', 'wait'],
    [40, '100%', 'bad']
  ])('show an effort of %d dollars as %s, tone %s', (spent, value, tone) => {
    const out = html(jobWith({ effort: { spent, cap: 40 } }));
    expect(out).toContain(`<b class="cap-v">${value}</b>`);
    expect(out).toContain(`class="cap-meter ${tone}"`);
    expect(out).toContain(
      `$${spent} of the $40 cap · simulated, nothing billed · resets 00:00`
    );
  });

  it('say the effort is not published yet when the job line has none', () => {
    const out = html(filled());
    expect(out).toContain(
      'not published yet: the scheduler sends it after its next deploy'
    );
    expect(out).toMatch(/Agent effort today<\/span><b class="cap-v">–<\/b>/);
  });

  it('say whether the queue runs or is paused', () => {
    expect(html(filled())).toContain('<p class="cap-queue">Queue running</p>');
    const paused = html(jobWith({ paused: true }));
    expect(paused).toContain(
      '<p class="cap-queue wait">Queue paused · cdwr agent resume</p>'
    );
    expect(paused).not.toContain('Queue running');
  });

  it('show dashes while the runs load', () => {
    const out = html(createState());
    expect(out).toMatch(/Agent PRs in flight<\/span><b class="cap-v">–<\/b>/);
    expect(out).toMatch(/Agent effort today<\/span><b class="cap-v">–<\/b>/);
    expect(out).not.toContain('slot');
    expect(out).not.toContain('Queue running');
    expect(out).toContain('no samples yet');
  });

  it('show the NUC bars as percents, and a hint when memory is the container', () => {
    const out = html(filled());
    expect(out).toContain('HOSTS');
    expect(out).toContain('host_metrics · live');
    expect(out).toContain('data-view="platform"');
    expect(out).toContain('busy · heartbeat 0 s ago');
    expect(out).toMatch(/>CPU<\/span>.*?<b class="cap-pct">25%<\/b>/s);
    expect(out).toMatch(/>Memory<\/span>.*?<b class="cap-pct">25%<\/b>/s);
    expect(out).toMatch(/>Disk<\/span>.*?<b class="cap-pct">40%<\/b>/s);
    expect(out).toContain('cap-dot ok');
    expect(out).not.toContain('cap-hint');
    const s = filled();
    s.data.hostMetrics = [
      hostSample(0, {
        cgroup_mem_current: 3 * GIB,
        cgroup_mem_max: 4 * GIB
      })
    ];
    const container = html(s);
    expect(container).toContain('<small class="cap-hint">container</small>');
    expect(container).toMatch(/>Memory.*?<b class="cap-pct">75%<\/b>/s);
  });

  it('turn a bar amber over its threshold and cap it at the track', () => {
    const s = filled();
    s.data.hostMetrics = [
      hostSample(0, { mem_available: 0.2 * GIB, load1: 6 })
    ];
    const out = html(s);
    expect(out).toContain('<i class="wait" style="width:97.5%"');
    // Load 6 on 4 cores is 150%: shown as it is, drawn full
    expect(out).toContain('<i class="wait" style="width:100.0%"');
    expect(out).toContain('<b class="cap-pct">150%</b>');
    expect(out).toContain('cap-dot bad');
    const disk = filled();
    disk.data.hostMetrics = [hostSample(0, { disk_free: 5 * GIB })];
    expect(html(disk)).toContain('<i class="wait" style="width:95.0%"');
  });

  it('say a silent NUC is silent, and no samples at all', () => {
    const stale = filled();
    stale.data.hostMetrics = [hostSample(30)];
    const out = html(stale);
    expect(out).toContain('silent · last sample 30 m ago');
    expect(out).toContain('cap-dot stale');
    const none = filled();
    none.data.hostMetrics = [];
    const empty = html(none);
    expect(empty).toContain('no samples yet');
    expect(empty).not.toContain('cap-rows');
  });

  it('show the Mac block only with a Mac host, and mark the current step', () => {
    expect(html(filled())).not.toContain('cap-strip');
    expect(html(filled())).not.toContain('ATTENDED');
    const s = filled({
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:00'
    });
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const out = html(s);
    expect(out).toContain('<b class="cap-name">mac</b>');
    expect(out).toContain('<span class="cap-chip">ATTENDED</span>');
    expect(out).toContain('seen 1 m ago · COD-1');
    expect(out).toContain('no host_metrics on this host');
    expect(out).toContain(
      'role="img" aria-label="Hand-back to the NUC: attended'
    );
    expect(out).toContain('<span class="on"><i></i>attended</span>');
    expect(out).toContain('<span class=""><i></i>handing back</span>');
    const back = filled();
    back.data.sessions = [session('mac', 'attended', 10)];
    const handing = html(back);
    expect(handing).not.toContain('ATTENDED');
    expect(handing).toContain('<span class="on"><i></i>handing back</span>');
    expect(handing).toContain('<span class=""><i></i>attended</span>');
    expect(handing).not.toContain('· COD-1');
  });

  it('draw the CPU day with its stats and peak, but only from two samples', () => {
    const out = html(filled());
    expect(out).toContain('nuc CPU, 24 h · shaded = agent runs');
    expect(out).toContain('in runs avg 25% · peak 25%');
    expect(out).not.toContain('idle 25%');
    expect(out).toContain('Peak during COD-1 at ');
    expect(out).toContain('<polyline');
    const one = filled();
    one.data.hostMetrics = [hostSample(0)];
    const few = html(one);
    expect(few).not.toContain('cap-cpu');
    expect(few).not.toContain('<polyline');
  });

  it('show the phone card with four meters and a foot line', () => {
    const s = filled();
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const out = html(s);
    expect(out).toContain(
      'data-view="platform" aria-label="Capacity: tap for hosts"'
    );
    expect(out.match(/class="cap-mini /g)).toHaveLength(4);
    expect(out).toContain('PRs in flight</span><b class="cap-v">2/5</b>');
    expect(out).toContain('Effort today</span><b class="cap-v">–</b>');
    expect(out).toContain('nuc CPU</span><b class="cap-v">25%</b>');
    expect(out).toContain('nuc memory</span><b class="cap-v">25%</b>');
    expect(out).toContain(
      'mac attended · nuc busy, heartbeat 0 s — tap for hosts'
    );
    expect(html(filled())).toContain('nuc busy, heartbeat 0 s — tap for hosts');
    expect(html(filled())).not.toContain('mac attended');
  });
});

describe('cpu chart', () => {
  const day = {
    from: 0,
    to: 1000,
    points: [
      { at: 0, cpu: 0.1 },
      { at: 500, cpu: 0.9 },
      { at: 1000, cpu: 0.2 }
    ],
    bands: [
      { start: 400, end: 600, ticket: 'COD-1' },
      { start: 800, end: 900, ticket: null }
    ],
    idle: 0.15,
    inRuns: 0.9,
    peak: { at: 500, cpu: 0.9, ticket: 'COD-1' }
  };

  it('draw a band per run, the line and a circle at the peak', () => {
    const out = cpuChart(day);
    expect(out).toContain('viewBox="0 0 600 56"');
    expect(out).toContain('preserveAspectRatio="none"');
    expect(out.match(/<rect /g)).toHaveLength(2);
    expect(out).toContain('x="240.0" y="0" width="120.0" height="56"');
    expect(out).toContain('vector-effect="non-scaling-stroke"');
    expect(out).toContain('points="0.0,48.8 300.0,7.2 600.0,43.6"');
    expect(out).toContain(
      '<circle class="cpu-peak" cx="300.0" cy="7.2" r="3"/>'
    );
    expect(out).toContain('peak 90%');
  });

  it('keep a load above one on the top of the chart', () => {
    const out = cpuChart({
      ...day,
      points: [
        { at: 0, cpu: 3 },
        { at: 1000, cpu: 0 }
      ],
      peak: { at: 0, cpu: 3, ticket: null }
    });
    expect(out).toContain('points="0.0,2.0 600.0,54.0"');
  });

  it('draw nothing under two samples', () => {
    expect(cpuChart({ ...day, points: [] })).toBe('');
    expect(cpuChart({ ...day, points: [day.points[0]] })).toBe('');
  });
});

describe('platform view', () => {
  const OLD = 'abc1234' + '0'.repeat(33);
  const NEW = 'def5678' + '0'.repeat(33);
  const jobWith = (
    over: Partial<NonNullable<RunsPayload['job']>>,
    main: RunsPayload['main'] = { image: null, desk: null }
  ): DeskState => {
    const s = filled();
    const base = runs(view());
    s.data.runs = { ...base, main, job: base.job && { ...base.job, ...over } };
    return s;
  };
  const html = (s: DeskState, desk: string | null = null): string =>
    renderPlatform(model(s, NOW, desk), NOW);
  const session = (host: string, kind: string, ago: number) =>
    ({
      id: `${host}-${kind}`,
      host,
      kind,
      last_seen: new Date(NOW.getTime() - ago * 6e4).toISOString()
    }) as never;

  it('draw the four sections with a back link and the head counts', () => {
    const out = html(filled());
    for (const label of [
      'CONTROLS',
      'HOSTS &amp; HEARTBEAT',
      'VERSIONS &amp; UPDATES',
      'HEALTH CHECKS'
    ])
      expect(out).toContain(`>${label}</h2>`);
    expect(out).toContain('data-view="desk"');
    expect(out).toContain('<h1 id="platform-title"');
    expect(out).toContain('controls need a control token in Settings');
    expect(out).toContain('Read-only here: add a control token');
    expect(out).not.toContain('data-cmd');
    // Realtime is not connected in the fixture
    expect(out).toMatch(/pf-stat bad">\d+ failing/);
  });

  it('say whether the queue runs or is paused, and the limits it sets', () => {
    const out = html(filled());
    expect(out).toContain('<b class="pf-val ">Running</b>');
    expect(out).toContain(
      '2 open now · set per session with /work-queue limit=N'
    );
    expect(out).toContain('last run ');
    expect(html(jobWith({ paused: true }))).toContain(
      '<b class="pf-val wait">Paused</b>'
    );
    expect(html(jobWith({ live: true }))).toContain('on events');
  });

  it('show the effort cap, and a dash when it is not published', () => {
    expect(html(filled())).toContain('<b class="pf-val ">–</b>');
    const out = html(jobWith({ effort: { spent: 32, cap: 40 } }));
    expect(out).toContain('<b class="pf-val ">$40</b>');
    expect(out).toContain('80% used today');
  });

  it('chip the image, the desk and the scripts against main', () => {
    const behind = html(
      jobWith(
        { host: 'container', rev: 'sha-abc1234' },
        { image: NEW, desk: NEW }
      ),
      OLD
    );
    expect(behind).toContain('update available');
    expect(behind).toContain('sha-abc1234 → sha-def5678');
    expect(behind).toContain('out of date');
    expect(behind).toContain('reload the desk to update');
    const current = html(
      jobWith(
        { host: 'container', rev: 'sha-abc1234' },
        { image: OLD, desk: OLD }
      ),
      OLD
    );
    expect(current).toContain('up to date');
    expect(current).not.toContain('update available');
    expect(current).not.toContain('reload the desk');
    expect(current).toContain('matches main');
    const unknown = html(filled());
    expect(unknown).toContain('pf-chip muted">unknown');
  });

  it('say the scripts are out of date with their items, or unknown', () => {
    const stale = html(
      jobWith({ install: 'stale', items: 'watch.jq, waits.sh' })
    );
    expect(stale).toContain('out of date (watch.jq, waits.sh)');
    expect(html(jobWith({ install: 'unknown' }))).toContain(
      'Scheduler scripts'
    );
    expect(html(jobWith({ install: 'unknown' }))).not.toContain('matches main');
  });

  it('list a check per row, with the problem text of a failing one', () => {
    const s = filled();
    s.data.hostMetrics = [hostSample(0)];
    s.data.connection.downSince = NOW.getTime() - 60e3;
    const out = html(s);
    expect(out).toContain('Realtime');
    expect(out).toContain('queue_state parses');
    expect(out).toContain('nuc heartbeat');
    expect(out).toContain('github_events last event');
    expect(out).toContain('Linear poll');
    expect(out).toContain('Realtime is not connected; polling every 5 min');
    expect(out).toContain('cap-dot bad');
    expect(out).toContain('never');
    // A check no other problem explains links to its own card
    expect(out).toContain(
      'data-problem="problem-check-github-events-last-event">not loaded</button>'
    );
  });

  it('say which PR change the webhook missed, on the row and the CHECK card', () => {
    const at = (min: number) => NOW.getTime() - min * 6e4;
    const s = filled();
    s.data.hostMetrics = [hostSample(0)];
    s.data.githubEvents = [
      {
        pr: 7,
        subject: 'pr/7',
        action: 'pull_request:opened',
        updated_at: new Date(at(120)).toISOString()
      } as never
    ];
    s.details.set('COD-2', {
      steps: 0,
      done: 0,
      next: null,
      idea: null,
      blockedBy: [],
      pr: 42,
      prAt: at(60)
    });
    const text = `PR #42 (COD-2) changed ${dayTime(at(60), NOW.getTime())}, newest webhook event ${dayTime(at(120), NOW.getTime())}`;
    const out = html(s);
    expect(out).toContain(
      `data-problem="problem-check-github-events-last-event">${text}</button>`
    );
    const card = renderProblems(model(s, NOW));
    expect(card).toContain('id="problem-check-github-events-last-event"');
    expect(card).toContain(text);
  });

  it('say quiet on the webhook row when no PR changed', () => {
    const s = filled();
    s.data.githubEvents = [];
    expect(html(s)).toMatch(
      /github_events last event<\/span><small class="pf-note">quiet<\/small>/
    );
  });

  it('show the Mac panel only with a Mac host', () => {
    const none = html(filled());
    expect(none).not.toContain('pf-box mac');
    expect(none).not.toContain('pf-strip');
    expect(none).not.toContain('mac today');
    const s = filled({
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:00'
    });
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const out = html(s);
    expect(out).toContain('pf-box mac');
    expect(out).toContain('<b class="cap-name">mac</b>');
    expect(out).toContain('pf-chip work on">ATTENDED');
    expect(out).toContain(
      'you are on COD-1 · the queue schedules nothing here'
    );
    expect(out).toContain('heartbeat within 5 min');
    expect(out).toContain('no heartbeat for 5–30 min');
    expect(out).toContain('<span class="on"><i></i><b>attended</b>');
    const back = filled();
    back.data.sessions = [session('mac', 'attended', 10)];
    const handing = html(back);
    expect(handing).not.toContain('ATTENDED');
    expect(handing).toContain('pf-chip muted">HANDING BACK');
    expect(handing).toContain('seen 10 m ago');
  });

  it('give the NUC a verdict chip and its heartbeat line', () => {
    expect(html(filled())).toContain('pf-chip ok">BUSY');
    expect(html(filled())).toContain(
      'heartbeat 0 s ago · every 10 min · CPU 25%'
    );
    const idle = jobWith({});
    idle.data.runs = runs(view());
    idle.data.runs.rows = [];
    expect(html(idle)).toContain('pf-chip ok">IDLE');
    const stale = filled();
    stale.data.hostMetrics = [hostSample(30)];
    expect(html(stale)).toContain('pf-chip muted">STALE');
    const bad = filled();
    bad.data.hostMetrics = [hostSample(0, { mem_available: 0.2 * 2 ** 30 })];
    expect(html(bad)).toContain('pf-chip bad">BAD');
    const empty = filled();
    empty.data.hostMetrics = [];
    expect(html(empty)).toContain('no samples yet');
  });

  it("list the Mac's sessions of today, and say when there are none", () => {
    const s = filled();
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const out = html(s);
    expect(out).toContain('mac today');
    expect(out).toContain('attended session · last seen');
    expect(out).toContain('<span class="pf-t">now</span>');
    const old = filled();
    old.data.sessions = [session('mac', 'attended', 20 * 60)];
    expect(html(old)).toContain('no sessions today');
  });
});

describe('problems', () => {
  const at = (ago: number): number => NOW.getTime() - ago * 6e4;
  // Every health check passes, so only the problem under test shows
  const base = (): DeskState => {
    const s = filled();
    s.data.githubEvents = [
      {
        pr: null,
        subject: 'push',
        action: 'push',
        updated_at: new Date(at(5)).toISOString()
      }
    ];
    s.data.storedAt = at(1);
    return s;
  };
  const down = (
    s: DeskState,
    over: Partial<DeskState['data']['connection']> = {}
  ) => {
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
  const parse = (s: DeskState) => {
    s.data.runs = {
      ...runs(view()),
      qv: view(),
      viewInvalid: true,
      view: { limit: 1 },
      viewIssues: [
        { path: 'session', missing: true },
        { path: 'limit', missing: false }
      ]
    };
    return s;
  };
  const stale = (s: DeskState) => {
    const base = runs(view());
    s.data.runs = { ...base, at: new Date(at(60)).toISOString() };
    return s;
  };
  const writers = (s: DeskState) => {
    s.data.runs = {
      ...runs(view()),
      others: [
        { host: 'mbp', at: new Date(at(30)).toISOString(), paused: true }
      ]
    };
    return s;
  };
  const silent = (s: DeskState) => {
    s.data.runs = runs(view({ session: { state: 'alive', ticket: 'COD-1' } }));
    s.data.hostMetrics = [hostSample(60), hostSample(50)];
    return s;
  };
  const live = (s: DeskState) => {
    s.data.connection = { ...s.data.connection, live: true, upSince: at(1) };
    return s;
  };
  const fresh = (s: DeskState) => {
    s.data.runs = runs(view());
    return s;
  };

  const crashed = (s: DeskState) => {
    s.data.sessions = [
      {
        id: 'm1',
        host: 'mac',
        kind: 'attended',
        last_seen: new Date(at(42)).toISOString(),
        state: 'working',
        detail: null
      }
    ];
    return s;
  };

  it('draws a card for a failing check no other problem explains, without freezing numbers', () => {
    const m = model(live(crashed(base())), NOW);
    expect(m.problems.map((p) => p.kind)).toEqual(['check']);
    const out = renderProblems(m);
    expect(out).toContain('id="problem-check-mac-heartbeat" data-kind="check"');
    expect(out).toContain('mac heartbeat');
    expect(out).toContain('no heartbeat for 42 m while a turn was running');
    expect(out).toContain('data-view="platform"');
    const alert = renderAlert(m);
    expect(alert).toContain('a health check is failing');
    expect(alert).toContain('1 check failing · see Platform');
    expect(renderFrozenLabel(m)).toBe('');
    const pf = renderPlatform(m, NOW);
    expect(pf).toMatch(
      /mac heartbeat[\s\S]*?data-problem="problem-check-mac-heartbeat"/
    );
  });

  it('passes a host whose session ended, and the Platform row says so', () => {
    const m = model(live(crashed(base())), NOW);
    void m;
    const s = live(base());
    s.data.sessions = [
      {
        id: 'm1',
        host: 'mac',
        kind: 'attended',
        last_seen: new Date(at(42)).toISOString(),
        state: 'ended',
        detail: null
      }
    ];
    const ended = model(s, NOW);
    expect(ended.problems).toEqual([]);
    expect(renderPlatform(ended, NOW)).toMatch(
      /mac heartbeat<\/span><small class="pf-note">no session<\/small>/
    );
  });

  it('draws the connection problem with its timer, status and retry', () => {
    const m = model(down(base()), NOW);
    const out = renderProblems(m);
    expect(out).toContain('PROBLEMS · 1');
    expect(out).toContain('id="problem-connection" data-kind="connection"');
    expect(out).toContain('Realtime channel closed');
    const since = NOW.getTime() - 2.7 * 6e4;
    expect(out).toContain(`data-fmt="for" data-from="${since}"`);
    expect(out).toContain(
      `data-fmt="next" data-from="${NOW.getTime() + 16000}"`
    );
    expect(out).toContain('CHANNEL_ERROR · dropped 2×<span class="tick"');
    expect(out).toContain('The desk polls instead');
    expect(out).toContain('Dropped 2×. Polling; numbers may lag.');
    expect(out).toContain('data-action="reconnect"');
    expect(out).toContain('data-action="reload"');
    const idle = renderProblems(
      model(down(base(), { status: null, retries: 0, nextAt: null }), NOW)
    );
    expect(idle).toContain('>not connected</span>');
    expect(idle).not.toContain('dropped');
    expect(idle).not.toContain('data-fmt="next"');
    expect(idle).toContain('Realtime channel not connected');
    expect(idle).toContain('Live updates have not connected since ');
    expect(idle).toContain('Not connected. Polling; numbers may lag.');
  });

  it('holds the cards still from second to second and ticks the timers by text', () => {
    const m = model(down(base()), NOW);
    expect(renderProblems(m)).not.toMatch(/class="tick"[^>]*>[^<]/);
    const since = NOW.getTime() - 2.7 * 6e4;
    const later = new Date(NOW.getTime() + 1000);
    expect(tickText('for', since, NOW)).toBe('for 2 m 42 s');
    expect(tickText('for', since, later)).toBe('for 2 m 43 s');
    expect(tickText('age', since, NOW)).toBe('2 m 42 s');
    const next = NOW.getTime() + 16000;
    expect(tickText('next', next, NOW)).toBe('next refresh in 16 s');
    expect(tickText('next', next, later)).toBe('next refresh in 15 s');
    expect(tickText('next', next, new Date(next + 1))).toBe('');
    const quiet = NOW.getTime() - 50 * 6e4;
    expect(tickText('silent', quiet, NOW)).toBe('50 m silent');
    expect(tickText('quiet', quiet, NOW)).toBe('no heartbeat for 50 m');
  });

  it('draws the parse problem with the raw row and a marker per issue', () => {
    const out = renderProblems(model(parse(base()), NOW));
    expect(out).toContain("queue_state doesn't parse");
    expect(out).toContain('data-kind="data"');
    expect(out).toContain('The row fails at session, limit.');
    expect(out).toContain(`from ${hhmm(at(5))}`);
    expect(out).toContain('<pre class="raw');
    const raw = /<pre class="raw wide">([\s\S]*?)<\/pre>/.exec(out)?.[1];
    expect(raw).not.toContain('⟨');
    expect(out).toContain('<pre class="raw-marks wide">session: <mark>');
    expect(out).toContain('session: <mark>⟨missing⟩</mark>');
    expect(out).toContain('limit: <mark>⟨invalid⟩</mark>');
    expect(out).toContain('data-action="copy-row"');
  });

  it('draws the writers problem with the fix and no button', () => {
    const out = renderProblems(model(writers(filled()), NOW));
    expect(out).toContain('More than one host publishes the queue');
    expect(out).toContain('mbp (paused, last ');
    expect(out).toContain('cdwr agent uninstall');
    expect(out).toContain('stop the agent container');
    expect(out).not.toContain('<host>');
    expect(out).toContain('in the last 2 h');
    expect(out).toContain(`last ${hhmm(at(30))}`);
    expect(out).not.toContain('data-action');
  });

  it('words the alert for a second writer alone, and keeps the usual one when mixed', () => {
    const only = renderAlert(model(live(writers(base())), NOW));
    expect(only).toContain('1 problem — another host publishes the queue');
    expect(only).toContain('the desk reads nuc');
    expect(only).not.toContain("can't vouch");
    const mixed = renderAlert(model(down(writers(base())), NOW));
    expect(mixed).toContain("the desk can't vouch for what it shows");
  });

  it('draws the stale problem without a raw row or a button', () => {
    const out = renderProblems(model(stale(base()), NOW));
    expect(out).toContain('queue_state is older than the newest run');
    expect(out).not.toContain('class="raw');
    expect(out).not.toContain('data-action');
  });

  it('draws the unknown problem and swaps the session card', () => {
    const m = model(silent(base()), NOW);
    const out = renderProblems(m);
    expect(out).toContain('nuc silent with a run open');
    expect(out).toContain('data-fmt="quiet"');
    expect(out).toContain(' · limit ');
    expect(out).toContain('data-fmt="silent"');
    expect(out).toContain(
      `COD-1 started ${hhmm(at(10))} and has no finished_at.`
    );
    expect(out).toContain('from the CLI or with a control token in Settings');
    expect(out).not.toContain('data-cmd');
    const card = renderUnknownSession(m);
    expect(card).toContain('STATE UNKNOWN');
    expect(card).toContain('Last known: nuc');
    expect(card).toContain('running <span class="mono">COD-1</span>');
    expect(card).toContain('Nothing here is assumed to be running.');
    expect(renderUnknownSession(model(fresh(base()), NOW))).toBe('');
  });

  it('counts the problems in the alert and says when the numbers froze', () => {
    const s = down(parse(base()));
    const m = model(s, NOW);
    const out = renderAlert(m);
    expect(out).toContain('role="alert"');
    expect(out).toContain(
      "2 problems — the desk can't vouch for what it shows"
    );
    // The parse problem began at the row's time, earlier than the drop
    expect(out).toContain(
      `numbers frozen at ${hhmm(at(5))} · channel dropped 2×`
    );
    expect(out).toContain('href="#problems" data-see-problems');
    expect(renderFrozenLabel(m)).toBe(
      `EVERYTHING ELSE · FROZEN AT ${hhmm(at(5))}`
    );
    expect(renderProblems(m)).toContain('PROBLEMS · 2');
    const closed = renderAlert(model(down(base(), { retries: 0 }), NOW));
    expect(closed).toContain('1 problem —');
    expect(closed).toContain('live updates down since ');
    expect(closed).toContain('numbers may lag');
    expect(closed).not.toContain('frozen');
    expect(closed).not.toContain('channel dropped');
    expect(renderAlert(model(down(base()), NOW))).toContain(
      'numbers may lag · channel dropped 2×'
    );
    expect(renderFrozenLabel(model(down(base()), NOW))).toBe('');
  });

  it('renders nothing once the state is healthy again', () => {
    const s = live(fresh(base()));
    const m = model(s, NOW);
    expect(m.problems).toEqual([]);
    expect(renderAlert(m)).toBe('');
    expect(renderProblems(m)).toBe('');
    expect(renderFrozenLabel(m)).toBe('');
    expect(renderUnknownSession(m)).toBe('');
  });

  it('shows OFFLINE once the channel is down, and POLLING while it connects', () => {
    const s = down(filled());
    const out = renderStatus(model(s, NOW), s.data.connection);
    expect(out).toContain('conn offline');
    expect(out).toContain('OFFLINE');
    expect(out).toContain('down since ');
    expect(out).toContain('class="short">since ');
    expect(out).not.toContain('class="long">last event');
    s.data.connection.lastIssue = {
      issue_id: 'u',
      identifier: 'COD-1',
      action: 'update',
      updated_at: new Date(at(1)).toISOString()
    };
    const seen = renderStatus(model(s, NOW), s.data.connection);
    expect(seen).toContain('class="long">last event ');
    expect(seen).not.toContain('down since');
    // Within the grace, with nothing dropped yet
    const grace = down(filled(), {
      retries: 0,
      downSince: NOW.getTime() - 2000
    });
    const g = renderStatus(model(grace, NOW), grace.data.connection);
    expect(g).toContain('POLLING');
    expect(g).not.toContain('OFFLINE');
    const on = live(filled());
    expect(renderStatus(model(on, NOW), on.data.connection)).toContain('LIVE');
  });

  it('links a failing health check to its problem card', () => {
    const failing = renderPlatform(model(down(base()), NOW), NOW);
    expect(failing).toContain('data-problem="problem-connection"');
    const ok = renderPlatform(model(live(fresh(base())), NOW), NOW);
    expect(ok).not.toContain('data-problem="problem-connection"');
    const frozen = parse(base());
    if (frozen.data.runs)
      frozen.data.runs = {
        ...frozen.data.runs,
        at: new Date(at(60 * 24 * 5)).toISOString()
      };
    const both = renderPlatform(model(frozen, NOW), NOW);
    expect(both).toMatch(
      /queue_state parses[\s\S]*?data-problem="problem-data-parse"/
    );
    expect(both).toMatch(
      /Snapshot age[\s\S]*?data-problem="problem-data-stale"/
    );
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

describe('pull requests on the waiting rows and the session card', () => {
  const withPr = (pr: number | null) => ({
    steps: 0,
    done: 0,
    next: null,
    idea: null,
    blockedBy: [],
    pr,
    prAt: null
  });

  it('link the PR beside a plan and a question row, outside the row link', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        table: {
          before: [
            { ticket: 'COD-4', kind: 'plan' },
            { ticket: 'COD-8', kind: 'question' },
            { ticket: 'COD-9', kind: 'plan' }
          ],
          label: [],
          after: []
        }
      })
    );
    state.details.set('COD-4', withPr(21));
    state.details.set('COD-8', withPr(22));
    const m = model(state, NOW);
    const rows = Object.fromEntries(
      waitRows(m, state.details, NOW).map((r) => [r.id, r.pr])
    );
    expect(rows).toMatchObject({
      'COD-4': 21,
      'COD-8': 22,
      'COD-9': null,
      'COD-50': null
    });
    const html = renderWaiting(m, state.details, NOW);
    expect(html).toContain('</a><a class="prn" href="https://github.com/');
    expect(html).toContain('>#21</a></li>');
    expect(html).toContain('>#22</a></li>');
    expect(html.match(/class="prn/g)).toHaveLength(2);
  });

  it('order every kind furthest along first, approved plans last and uncounted', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        blocked: [{ ticket: 'COD-9', blockers: ['COD-2'] }],
        table: {
          before: [
            { ticket: 'COD-4', kind: 'plan' },
            { ticket: 'COD-8', kind: 'question' }
          ],
          label: [{ ticket: 'COD-6', parent: 'COD-<1>', blockers: [] }],
          after: [
            { ticket: 'COD-3', kind: 'pr', pr: 7 },
            { ticket: 'COD-5', kind: 'handoffs', items: ['a', 'b'] }
          ]
        }
      })
    );
    const m = model(state, NOW);
    const rows = waitRows(m, state.details, NOW);
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ['COD-3', 'review'],
      ['COD-5', 'hand-offs'],
      ['COD-8', 'question'],
      ['COD-4', 'plan'],
      ['COD-6', 'ready to label'],
      ['COD-50', 'idea'],
      ['COD-9', 'approved']
    ]);
    const html = renderWaiting(m, state.details, NOW);
    expect(html).toContain('<b class="count">6</b>');
    expect(html).toContain('<span class="kind">hand-offs · 2</span>');
    expect(html).toContain(
      '<span class="kind">approved · waits on COD-2</span>'
    );
    expect(html).toContain('wrow-li approved');
    expect(html).toContain(
      'class="more-all more-desk" aria-haspopup="dialog">+ <span class="more-n phone">5</span><span class="more-n desk">3</span> more'
    );
    expect(html.match(/class="wrow"/g)).toHaveLength(7);
  });

  it('keep a parked PR listed, with its PR number, blockers and wait', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        parked: [{ ticket: 'COD-3', wait: 'ci', pr: 7 }],
        table: {
          before: [{ ticket: 'COD-4', kind: 'plan' }],
          label: [],
          after: [
            { ticket: 'COD-3', kind: 'pr', pr: 7 },
            { ticket: 'COD-2', kind: 'pr', pr: 5 }
          ]
        }
      })
    );
    state.details.set('COD-3', { ...withPr(7), blockedBy: ['COD-2', 'COD-1'] });
    state.details.set('COD-2', withPr(5));
    state.details.set('COD-4', { ...withPr(null), blockedBy: ['COD-1'] });
    const m = model(state, NOW);
    const rows = waitRows(m, state.details, NOW);
    expect(rows.find((r) => r.id === 'COD-3')).toMatchObject({
      kind: 'review',
      pr: 7,
      blockers: 'COD-2 · PR 5, COD-1'
    });
    const html = renderWaiting(m, state.details, NOW);
    expect(html).toContain('>#7</a>');
    expect(html).toContain('after COD-2 · PR 5, COD-1');
    expect(html).toContain('after COD-1</span>');
    expect(html).toContain('Review fixes: waits on');
  });

  it('count the wait rows and name the first in the idle headline, hand-offs included', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        next: [],
        table: {
          before: [],
          label: [],
          after: [{ ticket: 'COD-5', kind: 'handoffs', items: ['a'] }]
        }
      })
    );
    state.data.ideas = [];
    const h = headline(model(state, NOW), state.details, NOW);
    expect(h.text).toContain('1 thing waits');
    expect(h.text).toContain('starting with');
    expect(h.text).toContain('COD-5');
    expect(h.tone).toBe('wait');
  });

  it('show an approved plan on the sheet with its blockers and only an open link', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        blocked: [{ ticket: 'COD-9', blockers: ['COD-2'] }],
        table: { before: [], label: [], after: [] }
      })
    );
    state.data.ideas = [];
    const html = SHEETS.before.body(model(state, NOW), state, NOW);
    expect(html).toContain('wcard approved');
    expect(html).toContain('approved · waits on COD-2');
    expect(html).not.toContain('Waits on');
    expect(html).toMatch(/class="act secondary"[^>]*>Open ticket<\/a>/);
  });

  it('put the PR beside Working on and the takes-next headline', () => {
    const session: SessionState = {
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:30'
    };
    const state = filled(session);
    state.data.runs = runs(
      view({
        session,
        next: [
          { ticket: 'COD-1', reason: 'ready' },
          { ticket: 'COD-2', reason: 'answered' }
        ]
      })
    );
    state.details.set('COD-1', withPr(31));
    state.details.set('COD-2', withPr(32));
    const m = model(state, NOW);
    const html = renderSession(m, state.details, NOW);
    expect(html).toContain('COD-1</a> <a class="prn"');
    expect(html).toContain('>#31</a></span>');
    const text = headline(
      model(filled({ state: 'alive', detail: 'working' }), NOW),
      state.details,
      NOW
    ).text;
    expect(text).toContain('>#31</a>');
  });

  it('take the PR the queue view names when the ticket has no details yet', () => {
    const session: SessionState = {
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:30'
    };
    const state = filled(session);
    state.data.runs = runs(
      view({ session, parked: [{ ticket: 'COD-1', wait: 'CI', pr: 77 }] })
    );
    expect(renderSession(model(state, NOW), state.details, NOW)).toContain(
      '>#77</a>'
    );
  });

  it('add no PR link to the session card without one', () => {
    const state = filled({
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:30'
    });
    expect(renderSession(model(state, NOW), state.details, NOW)).not.toContain(
      'class="prn'
    );
  });
});

describe('snoozed waiting rows', () => {
  const snooze = (
    ticket: string,
    kind: string,
    event_at: string | null = null
  ): SnoozeRow => ({
    ticket,
    kind,
    event_at,
    at: NOW.toISOString(),
    actor: 'desk'
  });
  const T1 = '2026-10-29T10:00:00.000Z';
  const T2 = '2026-10-29T11:00:00.000Z';

  it.each([
    ['no snooze', 'review', null, [], false],
    [
      'the same kind, no events either side',
      'review',
      null,
      [snooze('COD-1', 'review')],
      true
    ],
    ['the kind changed', 'plan', null, [snooze('COD-1', 'review')], false],
    [
      'a newer gate event',
      'review',
      T2,
      [snooze('COD-1', 'review', T1)],
      false
    ],
    [
      'a gate event no newer',
      'review',
      T1,
      [snooze('COD-1', 'review', T1)],
      true
    ],
    [
      'an older gate event',
      'review',
      T1,
      [snooze('COD-1', 'review', T2)],
      true
    ],
    [
      'a gate event the snooze never saw',
      'review',
      T1,
      [snooze('COD-1', 'review')],
      false
    ],
    [
      'another ticket snoozed',
      'review',
      null,
      [snooze('COD-2', 'review')],
      false
    ]
  ] as const)('isSnoozed: %s', (_name, kind, gateAt, snoozes, expected) => {
    expect(isSnoozed({ id: 'COD-1', kind }, gateAt, snoozes)).toBe(expected);
  });

  /** The filled state with no activity, so every gate is null; COD-3 and COD-50 are snoozed, COD-4 under a kind it no longer has */
  const snoozed = (): DeskState => {
    const s = filled();
    s.data.activity = { ...activity, rows: [] };
    s.data.snoozes = [
      snooze('COD-3', 'review'),
      snooze('COD-50', 'idea'),
      snooze('COD-4', 'question')
    ];
    return s;
  };
  const on = (s: DeskState): DeskState => {
    s.controls.target = {
      supabaseUrl: 'https://x.supabase.co',
      controlToken: 't'
    };
    return s;
  };
  const ui = (s: DeskState, m: ReturnType<typeof model>) =>
    snoozeUi(m, s.controls);

  it('marks the snoozed rows, those whose kind still matches', () => {
    const s = snoozed();
    const m = model(s, NOW);
    expect(waitRows(m, s.details, NOW).map((r) => [r.id, r.snoozed])).toEqual([
      ['COD-3', true],
      ['COD-5', false],
      ['COD-4', false],
      ['COD-6', false],
      ['COD-50', true]
    ]);
  });

  it('leaves snoozed rows out of the badge and the session headline', () => {
    const s = snoozed();
    const m = model(s, NOW);
    expect(countedRows(waitRows(m, s.details, NOW)).map((r) => r.id)).toEqual([
      'COD-5',
      'COD-4',
      'COD-6'
    ]);
    const html = renderWaiting(m, s.details, NOW);
    expect(html).toContain('<b class="count">3</b>');
    s.data.runs = runs(
      view({
        next: [],
        table: {
          before: [],
          label: [],
          after: [{ ticket: 'COD-5', kind: 'handoffs', items: ['a'] }]
        }
      })
    );
    s.data.snoozes = [snooze('COD-5', 'hand-offs')];
    s.data.ideas = [];
    expect(headline(model(s, NOW), s.details, NOW).text).toContain(
      'nothing waits on you'
    );
  });

  it('folds the snoozed rows after the awake ones, only when there are some', () => {
    const s = snoozed();
    const html = renderWaiting(model(s, NOW), s.details, NOW);
    expect(html).toContain(
      '<details class="snoozed"><summary>Snoozed · 2</summary>'
    );
    expect(html.indexOf('COD-5')).toBeLessThan(html.indexOf('class="snoozed"'));
    expect(html.indexOf('COD-3')).toBeGreaterThan(
      html.indexOf('class="snoozed"')
    );
    const plain = filled();
    expect(renderWaiting(model(plain, NOW), plain.details, NOW)).not.toContain(
      'snoozed'
    );
  });

  it('keeps the fold open once the viewer opened it', () => {
    const s = snoozed();
    s.ui.snoozedOpen = true;
    const m = model(s, NOW);
    const open = '<details class="snoozed" open><summary>Snoozed · 2</summary>';
    expect(
      renderWaiting(m, s.details, NOW, snoozeUi(m, s.controls, true))
    ).toContain(open);
    expect(SHEETS.before.body(m, s, NOW)).toContain(open);
  });

  it('says nothing waits when every row is snoozed, and keeps the fold', () => {
    const s = filled();
    s.data.activity = { ...activity, rows: [] };
    s.data.ideas = [];
    s.data.runs = runs(
      view({
        table: {
          before: [{ ticket: 'COD-4', kind: 'plan' }],
          label: [],
          after: []
        }
      })
    );
    s.data.snoozes = [snooze('COD-4', 'plan')];
    const html = renderWaiting(model(s, NOW), s.details, NOW);
    expect(html).toContain('Nothing waits on you.');
    expect(html).toContain('Snoozed · 1');
    expect(html).toContain('<b class="count">0</b>');
    expect(html).not.toContain('class="foot"');
  });

  it('draws Snooze and Wake buttons beside, not inside, the row link when controls are on', () => {
    const s = on(snoozed());
    const m = model(s, NOW);
    const html = renderWaiting(m, s.details, NOW, ui(s, m));
    expect(html).toContain(
      '<button type="button" class="wsnooze" data-snooze="COD-5" data-kind="hand-offs" data-event-at="" aria-label="Snooze COD-5 until it changes">Snooze</button>'
    );
    expect(html).toContain(
      '<button type="button" class="wsnooze" data-wake="COD-3" aria-label="Wake COD-3">Wake</button>'
    );
    // No button sits between an <a class="wrow"> and its </a>
    for (const link of html.match(/<a class="wrow"[\s\S]*?<\/a>/g) ?? [])
      expect(link).not.toContain('<button');
  });

  it('draws no buttons without controls, but still folds', () => {
    const s = snoozed();
    const m = model(s, NOW);
    for (const html of [
      renderWaiting(m, s.details, NOW),
      renderWaiting(m, s.details, NOW, ui(s, m)),
      SHEETS.before.body(m, s, NOW)
    ]) {
      expect(html).not.toContain('wsnooze');
      expect(html).toContain('Snoozed · 2');
    }
  });

  it('disables a button in flight and shows the note a refusal left', () => {
    const s = on(snoozed());
    s.controls.snoozing.add('COD-5');
    s.controls.snoozeNotes.set('COD-3', 'not <snoozed>');
    const m = model(s, NOW);
    const html = renderWaiting(m, s.details, NOW, ui(s, m));
    expect(html).toMatch(/data-snooze="COD-5"[^>]*disabled>/);
    expect(html).not.toMatch(/data-wake="COD-3"[^>]*disabled>/);
    expect(html).toContain('<span class="wnote">not &lt;snoozed&gt;</span>');
  });

  it('carries the gate time on the button so the snooze wakes on a newer event', () => {
    const s = on(snoozed());
    s.data.activity = {
      ...activity,
      rows: [
        {
          when: '2026-10-29 10:00',
          ticket: 'COD-5',
          actor: 'agent',
          change: 'comment: **Agent: plan ready**'
        }
      ]
    };
    const m = model(s, NOW);
    const html = renderWaiting(m, s.details, NOW, ui(s, m));
    expect(html).toMatch(
      /data-snooze="COD-5"[^>]*data-event-at="[^"]+T[^"]+Z"/
    );
  });

  describe('Label button', () => {
    const t = NOW.getTime();
    const label = (s: DeskState) => {
      const m = model(s, NOW);
      return renderWaiting(m, s.details, NOW, ui(s, m));
    };

    it('forgets a label once the queue no longer lists the ticket', () => {
      const labelled = new Map([
        ['COD-6', 1],
        ['COD-7', 2]
      ]);
      forgetLabelled(labelled, null);
      expect([...labelled.keys()]).toEqual(['COD-6', 'COD-7']);
      forgetLabelled(labelled, [{ ticket: 'COD-7' }]);
      expect([...labelled.keys()]).toEqual(['COD-7']);
    });

    it('reads the state from the controls', () => {
      const s = on(snoozed());
      const c = s.controls;
      expect(labelState('COD-6', c, t)).toBe('idle');
      c.labelConfirm.set('COD-6', t - 1000);
      expect(labelState('COD-6', c, t)).toBe('confirming');
      expect(labelState('COD-6', c, t + 5000)).toBe('idle');
      c.labelling.add('COD-6');
      expect(labelState('COD-6', c, t)).toBe('labelling');
      c.labelling.clear();
      c.labelled.set('COD-6', t - 1000);
      expect(labelState('COD-6', c, t)).toBe('labelled');
      expect(labelState('COD-6', c, t + 3 * 3600_000)).toBe('idle');
      // A row whose gate moved on after the label came back as ready to label: live again
      c.labelConfirm.delete('COD-6');
      expect(labelState('COD-6', c, t, new Date(t - 2000).toISOString())).toBe(
        'labelled'
      );
      expect(labelState('COD-6', c, t, new Date(t).toISOString())).toBe('idle');
      c.labelNotes.set('COD-6', 'no');
      expect(labelState('COD-6', c, t + 3 * 3600_000)).toEqual({ note: 'no' });
    });

    it('offers the button on a ready-to-label row only, outside the link', () => {
      const html = label(on(snoozed()));
      expect(html).toContain('data-label="COD-6"');
      expect(html).toContain('>Label agent:ready</button>');
      expect(html.match(/data-label=/g)).toHaveLength(1);
      expect(html).not.toMatch(/<a class="wrow"[^>]*>(?:(?!<\/a>).)*<button/s);
    });

    it('asks to confirm, then disables the button in flight', () => {
      const s = on(snoozed());
      s.controls.labelConfirm.set('COD-6', t - 1000);
      expect(label(s)).toContain('>Confirm label</button>');
      s.controls.labelling.add('COD-6');
      expect(label(s)).toMatch(/data-label="COD-6"[^>]*disabled>labelling…</);
    });

    it('replaces the button with a note once labelled', () => {
      const s = on(snoozed());
      s.controls.labelled.set('COD-6', t - 1000);
      const html = label(s);
      expect(html).not.toContain('data-label');
      expect(html).toContain('labelled · waiting for the queue');
    });

    it('shows the note a failure left beside the button', () => {
      const s = on(snoozed());
      s.controls.labelNotes.set('COD-6', 'no <label>');
      const html = label(s);
      expect(html).toContain('data-label="COD-6"');
      expect(html).toContain('<span class="wnote">no &lt;label&gt;</span>');
    });

    it('puts the button beside the sheet link, and keeps only the link without controls', () => {
      const s = on(snoozed());
      const html = SHEETS.before.body(model(s, NOW), s, NOW);
      expect(html).toContain(
        '<button type="button" class="act secondary" data-label="COD-6"'
      );
      // The link stays: it is how the ticket is checked before confirming
      expect(html).toContain('>Label agent:ready</a>');
      const off = snoozed();
      const plain = SHEETS.before.body(model(off, NOW), off, NOW);
      expect(plain).toContain('>Label agent:ready</a>');
      expect(plain).not.toContain('data-label');
      expect(renderWaiting(model(off, NOW), off.details, NOW)).not.toContain(
        'data-label'
      );
    });
  });

  describe('waiting card', () => {
    const cardOf = (html: string, id: string): string =>
      html
        .split('<article class="wcard')
        .find((c) => c.includes(`<span class="id">${id}</span>`)) ?? '';
    const actions = (card: string): string =>
      card.match(/<div class="wc-actions">(.*?)<\/div>/s)?.[1] ?? '';
    const event = (action: string, minutesAgo: number) =>
      ({
        pr: 7,
        subject: 'x',
        action,
        updated_at: new Date(NOW.getTime() - minutesAgo * 6e4).toISOString()
      }) as never;

    it('keeps the action, the label controls and the snooze in one actions row', () => {
      const s = on(snoozed());
      const html = SHEETS.before.body(model(s, NOW), s, NOW);
      const acts = actions(cardOf(html, 'COD-6'));
      expect(acts).toContain('>Label agent:ready</a>');
      expect(acts).toContain('data-label="COD-6"');
      expect(acts).toContain('data-snooze="COD-6"');
      expect(acts.indexOf('<a ')).toBeLessThan(acts.indexOf('data-label'));
      expect(acts.indexOf('data-label')).toBeLessThan(
        acts.indexOf('data-snooze')
      );
    });

    it('puts a snooze note inside the actions row, after the buttons', () => {
      const s = on(snoozed());
      s.controls.snoozeNotes.set('COD-6', 'not <snoozed>');
      const html = SHEETS.before.body(model(s, NOW), s, NOW);
      const acts = actions(cardOf(html, 'COD-6'));
      expect(acts).toContain('<span class="wnote">not &lt;snoozed&gt;</span>');
      expect(acts.indexOf('data-snooze')).toBeLessThan(acts.indexOf('wnote'));
    });

    it('shows a review card its PR state and age from a live github event', () => {
      const s = filled();
      s.data.githubEvents = [event('pull_request_review:copilot', 2)];
      const html = SHEETS.before.body(model(s, NOW), s, NOW);
      const card = cardOf(html, 'COD-3');
      expect(card).toContain('<div class="wc-pr">');
      expect(card).toContain(
        '<span class="pill wait">Copilot reviewed — your turn</span>'
      );
      expect(card).toContain('<time>2 m ago</time>');
    });

    it('says queued, with no age, when a review card has no live event', () => {
      const s = filled();
      const html = SHEETS.before.body(model(s, NOW), s, NOW);
      const pr = cardOf(html, 'COD-3').match(
        /<div class="wc-pr">(.*?)<\/div>/s
      )?.[1];
      expect(pr).toBe('<span class="pill neutral">queued</span>');
    });

    it('gives a card that is not a review no PR row', () => {
      const s = filled();
      const html = SHEETS.before.body(model(s, NOW), s, NOW);
      expect(cardOf(html, 'COD-5')).not.toBe('');
      expect(cardOf(html, 'COD-5')).not.toContain('wc-pr');
      expect(cardOf(html, 'COD-6')).not.toContain('wc-pr');
    });
  });

  it('shows the same fold and buttons on the all-rows sheet', () => {
    const s = on(snoozed());
    const html = SHEETS.before.body(model(s, NOW), s, NOW);
    expect(html).toContain(
      '<details class="snoozed"><summary>Snoozed · 2</summary>'
    );
    expect(html).toContain('data-snooze="COD-5"');
    expect(html).toContain('data-wake="COD-3"');
    expect(html).toContain('data-wake="COD-50"');
    // The snoozed idea moved to the fold, so no idea card is left to decide
    expect(html).not.toContain('Ideas to decide');
    s.data.snoozes = [];
    expect(SHEETS.before.body(model(s, NOW), s, NOW)).toMatch(
      /<article class="idea">[\s\S]*data-snooze="COD-50" data-kind="idea"/
    );
    for (const a of html.match(/<a class="act[\s\S]*?<\/a>/g) ?? [])
      expect(a).not.toContain('<button');
  });
});

describe('controls on', () => {
  const target = { supabaseUrl: 'https://x.supabase.co', controlToken: 't' };
  const row = (
    id: number,
    kind: string,
    status = 'pending',
    note: string | null = null
  ): DeskCommandRow => ({
    id,
    at: NOW.toISOString(),
    host: 'nuc',
    kind,
    args: {},
    actor: 'mac',
    status,
    applied_at: status === 'pending' ? null : NOW.toISOString(),
    note
  });
  const on = (build: (s: DeskState) => void = () => undefined): DeskState => {
    const s = filled();
    s.controls.target = target;
    build(s);
    return s;
  };
  const platformHtml = (s: DeskState): string =>
    renderPlatform(model(s, NOW, null), NOW);

  it('draw the buttons and steppers with their data attributes', () => {
    const out = platformHtml(on());
    expect(out).toContain('data-cmd="pause"');
    expect(out).toContain('data-cmd="run"');
    expect(out).toContain('data-step="limit:-1"');
    expect(out).toContain('data-step="limit:1"');
    expect(out).toContain('data-step="cap:-5"');
    expect(out).toContain('data-step="cap:5"');
    expect(out).toContain('data-apply="limit"');
    expect(out).not.toContain('read-only');
    expect(out).not.toContain('COD-680');
  });

  it('offer resume while paused, on the limits card too', () => {
    const s = on((x) => {
      const r = x.data.runs;
      if (r?.job) r.job = { ...r.job, paused: true };
    });
    expect(platformHtml(s)).toContain('data-cmd="resume"');
    const cap = renderCapacity(model(s, NOW));
    expect(cap).toContain('Queue paused');
    expect(cap).toContain('data-cmd="resume"');
    expect(cap).toContain('data-cmd="run"');
  });

  it('show the draft and enable Apply only when it differs', () => {
    expect(platformHtml(on())).toMatch(/data-apply="limit" disabled/);
    const out = platformHtml(on((s) => (s.controls.drafts = { limit: 7 })));
    expect(out).toContain('<b class="ctl-draft">7</b>');
    expect(out).not.toMatch(/data-apply="limit" disabled/);
  });

  it('disable a pending control and say so', () => {
    const out = platformHtml(
      on((s) => (s.data.deskCommands = [row(1, 'run')]))
    );
    expect(out).toMatch(/data-cmd="run" disabled/);
    expect(out).toContain('pending…');
  });

  it('show a refused note', () => {
    const out = platformHtml(
      on((s) => (s.data.deskCommands = [row(1, 'run', 'refused', 'paused')]))
    );
    expect(out).toContain('role="status">paused</small>');
    expect(out).not.toMatch(/data-cmd="run" disabled/);
  });

  it('ask for a confirmation before abandoning', () => {
    const silentState = (confirming: boolean): DeskState => {
      const s = on((x) => {
        x.data.runs = runs(
          view({ session: { state: 'alive', ticket: 'COD-1' } })
        );
        x.data.hostMetrics = [hostSample(60), hostSample(50)];
        if (confirming)
          x.controls.confirm = { until: NOW.getTime() + 1000, session: null };
      });
      return s;
    };
    const plain = renderProblems(model(silentState(false), NOW));
    expect(plain).toContain('data-cmd="abandon"');
    expect(plain).toContain('Mark run abandoned</button>');
    const sure = renderProblems(model(silentState(true), NOW));
    expect(sure).toContain('Confirm abandon</button>');
  });
});
