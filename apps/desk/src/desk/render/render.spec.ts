import { describe, expect, it } from 'vitest';

import type { Issue } from '../../linear';
import type {
  ActivityPayload,
  RunsPayload,
  UsagePayload
} from '../../supabase';
import { model } from '../model';
import { type DeskState, SHEET_IDS, createState, isSheetId } from '../state';
import type { QueueView, SessionState } from '../types';

import { headline, renderBand } from './band';
import { chartHeight, chartKind, shippedChart, spendChart } from './charts';
import { renderColumns } from './columns';
import { SHEETS } from './sheets';
import { renderTiles } from './tiles';

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
    host: 'launchd',
    rev: null,
    install: 'current',
    items: ''
  },
  qv,
  rows: [
    {
      when: '2026-10-29 11:50',
      outcome: 'failed',
      ticket: 'COD-1',
      detail: 'x'
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

describe('band', () => {
  it.each([
    [{ state: 'alive', detail: 'polling' }, 'Session live'],
    [{ state: 'waiting' }, 'Session waits on you'],
    [{ state: 'stopped' }, 'Session stopped'],
    [{ state: 'none' }, 'No session']
  ] satisfies [SessionState, string][])(
    'shows the session %j',
    (session, label) => {
      const state = filled(session);
      const band = renderBand(model(state, NOW), NOW);
      expect(band.html).toContain(label);
      expect(band.html).toContain('data-w="limit"');
      expect(band.html).toContain('data-w="scheduler"');
    }
  );

  it('says it is loading before the runs arrive', () => {
    const band = renderBand(model(createState(), NOW), NOW);
    expect(band.html).toContain('Loading the runs document…');
  });

  it('turns red for a scheduler that went silent', () => {
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    expect(renderBand(model(state, NOW), NOW).className).toBe('now block');
  });
});

describe('columns and tiles', () => {
  it('show a placeholder while loading', () => {
    const cols = renderColumns(model(createState(), NOW), createState());
    expect(cols.waiting).toBe(false);
    expect(cols.before).toContain('Loading…');
    expect(cols.next).toContain('<span class="count">–</span>');
  });

  it('list what waits on the viewer', () => {
    const state = filled();
    const cols = renderColumns(model(state, NOW), state);
    expect(cols.waiting).toBe(true);
    expect(cols.before).toContain('COD-4');
    expect(cols.before).toContain('idea');
    expect(cols.before).toContain('COD-6');
    expect(cols.before).toContain('ready to label');
    expect(cols.before).toContain('COD-&lt;1&gt;');
    expect(cols.before).not.toContain('COD-<1>');
    expect(cols.next).toContain('parked');
    expect(cols.after).toContain('Open PRs · 1');
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
    const cols = renderColumns(m, state);
    expect(cols.next).not.toContain('COD-3');
    expect(cols.after).toContain('COD-3');
    expect(cols.after).toContain('Review fixes: waits on CI since');
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
    const cols = renderColumns(model(state, NOW), state);
    expect(cols.next).not.toContain('COD-2');
    expect(cols.next).not.toContain('parked');
  });

  it('give every tile a sheet', () => {
    const state = filled();
    const html = renderTiles(model(state, NOW), state, NOW);
    for (const id of [
      'activity',
      'shipped',
      'spend',
      'ticketcost',
      'ideas',
      'all',
      'timers'
    ])
      expect(html).toContain(`data-w="${id}"`);
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
});
