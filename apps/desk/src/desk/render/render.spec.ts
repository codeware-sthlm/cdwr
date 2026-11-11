import { describe, expect, it } from 'vitest';

import type { RunsPayload, SnoozeRow } from '../../supabase';
import { hhmm } from '../format';
import { model } from '../model';
import {
  type DeskState,
  SHEET_IDS,
  createState,
  isSheetId,
  sheetIdOf,
  viewOf
} from '../state';
import type { QueueView, SessionState, WatchEntry } from '../types';

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
import {
  NEW,
  NOW,
  OLD,
  activity,
  at,
  behind,
  down,
  filled,
  hostSample,
  issue,
  live,
  planSample,
  runs,
  view
} from './fixtures';
import { platform } from './header';
import {
  renderAlert,
  renderFrozenLabel,
  renderProblems,
  tickText
} from './problems';
import { headline, headlineHtml } from './session';
import { SHEETS, whyLine } from './sheets';
import { renderTiles } from './tiles';
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

describe('waiting card, queue sheets and tiles', () => {
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

describe('problems', () => {
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
  });

  it('passes a host whose session ended', () => {
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
    expect(model(s, NOW).problems).toEqual([]);
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

  it('draws the unknown problem', () => {
    const m = model(silent(base()), NOW);
    const out = renderProblems(m);
    expect(out).toContain('nuc silent with a run open');
    expect(out).toContain('data-fmt="quiet"');
    expect(out).toContain(' · limit ');
    expect(out).toContain('data-fmt="silent"');
    expect(out).toContain(
      `${LINK('COD-1')} started ${hhmm(at(10))} and has no finished_at.`
    );
    expect(out).toContain('from the CLI or with a control token in Settings');
    expect(out).not.toContain('data-cmd');
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

describe('controls on', () => {
  const target = { supabaseUrl: 'https://x.supabase.co', controlToken: 't' };
  const on = (build: (s: DeskState) => void = () => undefined): DeskState => {
    const s = filled();
    s.controls.target = target;
    build(s);
    return s;
  };

  it('offer resume while paused on the limits card', () => {
    const s = on((x) => {
      const r = x.data.runs;
      if (r?.job) r.job = { ...r.job, paused: true };
    });
    const cap = renderCapacity(model(s, NOW));
    expect(cap).toContain('Queue paused');
    expect(cap).toContain('data-cmd="resume"');
    expect(cap).toContain('data-cmd="run"');
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
