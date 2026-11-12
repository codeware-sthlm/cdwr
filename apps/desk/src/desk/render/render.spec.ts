import { describe, expect, it } from 'vitest';

import type { SnoozeRow } from '../../supabase';
import { model } from '../model';
import {
  type DeskState,
  SHEET_IDS,
  createState,
  isSheetId,
  sheetIdOf,
  viewOf
} from '../state';
import type { SessionState, WatchEntry } from '../types';

import { chartHeight, chartKind, gauge, sparkline } from './charts';
import {
  NEW,
  NOW,
  OLD,
  activity,
  behind,
  filled,
  issue,
  planSample,
  runs,
  view
} from './fixtures';
import { platform } from './header';
import { headline, headlineHtml } from './session';
import { SHEETS, whyLine } from './sheets';
import {
  copilotView,
  countedRows,
  forgetLabelled,
  isSnoozed,
  labelState,
  mergeBlocker,
  waitRows
} from './waiting';

/** A ticket id as the desk links it to Linear */
const LINK = (id: string): string =>
  `<a class="id" href="https://linear.app/codeware/issue/${id}" target="_blank" rel="noopener">${id}</a>`;

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
      // The Waiting on you sheet is React (components/before.tsx)
      if (id !== 'before') expect(html.length).toBeGreaterThan(0);
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

describe('header', () => {
  it('counts failing checks and run problems, and a dash while loading', () => {
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    const m = model(state, NOW);
    expect(platform(m).failing).toContain('scheduler silent 35 h');
  });

  it('says when the image is behind main', () => {
    const state = behind({ image: NEW, desk: null, deskWeb: null }, true);
    const m = model(state, NOW, null);
    expect(platform(m).updates).toBe(1);
    const html = SHEETS.scheduler.body(m, state, NOW);
    expect(html).toContain('cdwr agent deploy --host agent-host');
    expect(html).toContain('sha-def5678');
    expect(html).not.toContain('docker compose pull');
  });

  it('says when the desk is behind main', () => {
    const state = behind({ image: null, desk: NEW, deskWeb: null }, false);
    const m = model(state, NOW, OLD);
    // An update, but no failing check
    expect(platform(m).updates).toBe(1);
    expect(platform(m).failing).not.toContain('desk');
    expect(SHEETS.scheduler.body(m, state, NOW)).toContain(
      'cdwr agent desk install'
    );
  });

  it('shows neither when both are current', () => {
    const state = behind({ image: OLD, desk: OLD, deskWeb: null }, true);
    const m = model(state, NOW, OLD);
    expect(platform(m).updates).toBe(0);
    const html = SHEETS.scheduler.body(m, state, NOW);
    expect(html).not.toContain('cdwr agent desk install');
    expect(html).not.toContain('docker compose pull');
  });
});

describe('waiting card and queue sheets', () => {
  it('list what waits on the viewer, furthest along first', () => {
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

  it('list Renovate PRs on the next sheet with GitHub and ticket links, and nothing without any', () => {
    const state = filled();
    expect(SHEETS.next.body(model(state, NOW), state, NOW)).not.toContain(
      'Renovate PRs'
    );
    state.data.runs = runs(
      view({
        next: [{ ticket: 'PR 754', reason: 'renovate', detail: 'failing' }],
        held: { tickets: ['PR 754'], free: [] },
        renovate: [
          {
            pr: 662,
            title: 'Update zod',
            state: 'tended',
            ticket: 'COD-740'
          },
          { pr: 754, title: 'Update vite', state: 'failing', ticket: null }
        ]
      })
    );
    const html = SHEETS.next.body(model(state, NOW), state, NOW);
    expect(html).toContain('Renovate PRs · 2');
    expect(html).toContain(
      'href="https://github.com/codeware-sthlm/cdwr/pull/754"'
    );
    expect(html).toContain('Update vite');
    expect(html).toContain('Tended by');
    expect(html).toContain('/issue/COD-740"');
    expect(html).not.toContain('/issue/PR 754');
  });

  it('tell a conflicting Renovate PR waits for an attended session', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        next: [{ ticket: 'PR 800', reason: 'renovate', detail: 'conflicting' }]
      })
    );
    const m = model(state, NOW);
    expect(
      whyLine({ ...m, session: { state: 'none' }, stuck: null }, m.next[0])
    ).toContain('leaves a Renovate conflict to an attended session');
  });

  it('name a Copilot review on a review feedback row', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        next: [
          {
            ticket: 'COD-4',
            reason: 'review feedback',
            detail: 'Copilot review'
          }
        ]
      })
    );
    const m = model(state, NOW);
    expect(
      whyLine({ ...m, session: { state: 'none' }, stuck: null }, m.next[0])
    ).toMatch(/^Its PR has review comments to address\. .*Copilot review$/);
    expect(SHEETS.next.body(m, state, NOW)).toContain('Copilot review');
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
    expect(html).toContain(`<b>failed</b> ${LINK('COD-1')}`);
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
    expect(html).toContain(`<td>${LINK('COD-30')}</td>`);
  });

  it('link the ticket ids of the review sheet, the limit hints and a run detail', () => {
    const state = filled();
    const m = model(state, NOW);
    expect(SHEETS.review.body(m, state, NOW)).toContain(`<span class="prnum">`);
    expect(SHEETS.review.body(m, state, NOW)).toContain(LINK('COD-3'));
    expect(SHEETS.next.body(m, state, NOW)).toContain(
      `Merging or closing ${LINK('COD-3')} frees a slot`
    );
    const detailed = {
      ...m,
      runs: m.runs && {
        ...m.runs,
        rows: [{ ...m.runs.rows[0], detail: 'after COD-7 in `COD-8`' }]
      }
    } as typeof m;
    expect(SHEETS.runs.body(detailed, state, NOW)).toContain(
      `after ${LINK('COD-7')} in <code>${LINK('COD-8')}</code>`
    );
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
    expect(headlineHtml(headline(m, state.details, NOW).note)).toContain(
      'COD-3'
    );
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
    expect(countedRows(rows)).toHaveLength(6);
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
    expect(rows.find((r) => r.id === 'COD-3')?.wait).toBe(
      'Review fixes: waits on CI'
    );
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
    const text = headlineHtml(h.text);
    expect(text).toContain('1 thing waits');
    expect(text).toContain('starting with');
    expect(text).toContain('COD-5');
    expect(h.tone).toBe('wait');
  });

  it('put the PR in the takes-next headline', () => {
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
    const text = headlineHtml(
      headline(
        model(filled({ state: 'alive', detail: 'working' }), NOW),
        state.details,
        NOW
      ).text
    );
    expect(text).toContain('>#31</a>');
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
    expect(
      headlineHtml(headline(model(s, NOW), s.details, NOW).text)
    ).toContain('nothing waits on you');
  });

  describe('Label button', () => {
    const t = NOW.getTime();

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
      const c = snoozed().controls;
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
  });

  describe('mergeBlocker and copilotView', () => {
    const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
      pr: 7,
      state: 'open',
      unresolved: 0,
      threads: 0,
      conflicting: false,
      draft: false,
      mergeable: 'MERGEABLE',
      ci: 'SUCCESS',
      copilot: 'none',
      at: null,
      ...over
    });

    it.each([
      ['nothing in the way', {}, null],
      ['in the merge queue', { state: 'queued' }, 'already in the merge queue'],
      [
        'queued beats a conflict',
        { state: 'queued', conflicting: true },
        'already in the merge queue'
      ],
      ['a conflict state', { state: 'conflicting' }, 'conflicts with main'],
      ['a conflict flag', { conflicting: true }, 'conflicts with main'],
      [
        'conflicts not checked yet',
        { conflicting: null },
        'GitHub has not checked for conflicts yet'
      ],
      [
        'mergeability unknown',
        { mergeable: 'UNKNOWN' },
        'GitHub has not checked for conflicts yet'
      ],
      ['a draft', { draft: true }, 'PR is a draft'],
      [
        'a draft in the merge queue',
        { draft: true, state: 'queued' },
        'PR is a draft'
      ],
      ['no ci data', { ci: null }, 'no check data yet'],
      ['no thread data', { threads: null }, 'no check data yet'],
      ['checks pending', { ci: 'PENDING' }, 'checks pending'],
      ['checks failing', { ci: 'FAILURE' }, 'checks failure'],
      ['checks erroring', { ci: 'ERROR' }, 'checks error'],
      ['checks expected', { ci: 'EXPECTED' }, 'checks expected'],
      ['one thread', { threads: 1 }, '1 unresolved thread'],
      ['threads', { threads: 3 }, '3 unresolved threads'],
      [
        'checks before threads',
        { ci: 'PENDING', threads: 2 },
        'checks pending'
      ],
      ['merged', { state: 'merged' }, 'PR is merged'],
      ['closed', { state: 'closed' }, 'PR is closed']
    ] as const)('mergeBlocker: %s', (_name, over, expected) => {
      expect(mergeBlocker(entry(over))).toBe(expected);
    });

    it.each([
      ['none', 'button'],
      ['requested', { note: 'Copilot asked' }],
      ['reviewed', { note: 'Copilot reviewed' }],
      [null, null]
    ] as const)('copilotView: %s', (copilot, expected) => {
      expect(copilotView(entry({ copilot }))).toEqual(expected);
    });
  });
});
