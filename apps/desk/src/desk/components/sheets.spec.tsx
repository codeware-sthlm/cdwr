// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import {
  NEW,
  NOW,
  OLD,
  behind,
  filled,
  issue,
  planSample,
  runs,
  view
} from '../render/fixtures';
import { platform } from '../render/header';
import { headline, headlineHtml } from '../render/session';
import {
  type DeskState,
  SHEET_IDS,
  type SheetId,
  createState,
  isSheetId,
  sheetIdOf
} from '../state';

import { whyLine } from './queue-bodies';
import { SHEETS, type SheetActions } from './sheets';

const actions: SheetActions = {
  wait: { snooze: vi.fn(), wake: vi.fn(), label: vi.fn(), pr: vi.fn() },
  onSnoozedOpen: vi.fn(),
  onActFilter: vi.fn(),
  onFilter: vi.fn()
};

/** A sheet's body rendered from the state; `m` stands in for the model when a test shapes it */
const body = (
  id: SheetId,
  state: DeskState,
  m = model(state, NOW)
): HTMLElement => {
  const { Body } = SHEETS[id];
  return render(<Body m={m} state={state} now={NOW} actions={actions} />)
    .container;
};

const text = (el: Element): string => el.textContent ?? '';

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

  it.each(SHEET_IDS)('render %s from filled and from empty state', (id) => {
    for (const state of [
      filled({
        state: 'alive',
        detail: 'working',
        lastSeen: '2026-10-29T11:50:00'
      }),
      createState()
    ]) {
      const { innerHTML } = body(id, state);
      expect(innerHTML.length).toBeGreaterThan(0);
      expect(innerHTML).not.toContain('undefined');
      expect(innerHTML).not.toContain('[object');
    }
    expect(SHEETS[id].title).not.toBe('');
  });
});

describe('scheduler sheet', () => {
  it('says when the image is behind main', () => {
    const state = behind({ image: NEW, desk: null, deskWeb: null }, true);
    const m = model(state, NOW, null);
    expect(platform(m).updates).toBe(1);
    const html = text(body('scheduler', state, m));
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
    expect(text(body('scheduler', state, m))).toContain(
      'cdwr agent desk install'
    );
  });

  it('shows neither when both are current', () => {
    const state = behind({ image: OLD, desk: OLD, deskWeb: null }, true);
    const m = model(state, NOW, OLD);
    expect(platform(m).updates).toBe(0);
    const html = text(body('scheduler', state, m));
    expect(html).not.toContain('cdwr agent desk install');
    expect(html).not.toContain('docker compose pull');
  });

  it('links the commit of the image and of the desk to GitHub', () => {
    const state = behind({ image: NEW, desk: NEW, deskWeb: null }, true);
    const c = body('scheduler', state, model(state, NOW, OLD));
    const hrefs = [...c.querySelectorAll('a.prn')].map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toContain(
      'https://github.com/codeware-sthlm/cdwr/commit/def5678'
    );
  });
});

describe('queue sheets', () => {
  it('show a parked ticket on the next sheet, open PRs on the review sheet and hand-offs on their own', () => {
    const state = filled();
    expect(text(body('next', state))).toContain('Parked on a wait · 1');
    expect(body('review', state).querySelector('[data-pr="7"]')).not.toBeNull();
    const handoffs = text(body('handoffs', state));
    expect(handoffs).toContain('Merged, hand-offs left · 1');
    expect(handoffs).toContain('check it');
    expect(handoffs).toContain('Hand-off checklist:');
  });

  it('list Renovate PRs on the next sheet with GitHub and ticket links, and nothing without any', () => {
    const state = filled();
    expect(text(body('next', state))).not.toContain('Renovate PRs');
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
    const c = body('next', state);
    expect(text(c)).toContain('Renovate PRs · 2');
    expect(
      c.querySelector(
        'a[href="https://github.com/codeware-sthlm/cdwr/pull/754"]'
      )
    ).not.toBeNull();
    expect(text(c)).toContain('Update vite');
    expect(text(c)).toContain('Tended by');
    expect(c.querySelector('a[href$="/issue/COD-740"]')).not.toBeNull();
    expect(c.innerHTML).not.toContain('/issue/PR 754');
  });

  it('tell a conflicting Renovate PR waits for an attended session', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        next: [{ ticket: 'PR 800', reason: 'renovate', detail: 'conflicting' }]
      })
    );
    const m = model(state, NOW);
    const why = render(
      <p>
        {whyLine({ ...m, session: { state: 'none' }, stuck: null }, m.next[0])}
      </p>
    ).container;
    expect(text(why)).toContain(
      'leaves a Renovate conflict to an attended session'
    );
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
    const why = render(
      <p>
        {whyLine({ ...m, session: { state: 'none' }, stuck: null }, m.next[0])}
      </p>
    ).container;
    expect(text(why)).toMatch(
      /^Its PR has review comments to address\. .*Copilot review$/
    );
    expect(text(body('next', state, m))).toContain('Copilot review');
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
    const c = body('review', state, m);
    expect(
      [...c.querySelectorAll('[data-pr]')].map((x) => x.getAttribute('data-pr'))
    ).toEqual(order);
    expect(c.querySelector('span.pill.neutral')?.textContent).toBe('queued');
    expect(c.querySelector('time')).toBeNull();
    expect(text(c)).toContain('Rows update in place as github_events lands');
    expect(
      [...c.querySelectorAll('.pr-row .rank')].map((x) => text(x))
    ).toEqual(['1', '2']);
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
    const c = body('review', state, m);
    expect(c.querySelector('.pr-row.blocked')).not.toBeNull();
    expect(c.querySelector('.chip.blocked')?.textContent).toBe('merge later');
    expect(text(c)).toContain('Merge order: merge');
    expect(text(c)).toContain('#4 (COD-9) first');
    expect(text(body('review', state, base))).not.toContain('merge later');
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
    const before = body('review', state);
    expect(before.querySelector('span.pill.ok')?.textContent).toBe(
      'checks passed'
    );
    expect(before.querySelector('time')?.textContent).toBe('12 m ago');
    state.data.githubEvents = [
      event('pull_request_review:copilot', 2),
      event('check_suite:success', 12)
    ];
    const after = body('review', state);
    expect(after.querySelector('span.pill.wait')?.textContent).toBe(
      'Copilot reviewed — your turn'
    );
    expect(after.querySelector('time')?.textContent).toBe('2 m ago');
    expect(text(after)).not.toContain('checks passed');
    state.data.githubEvents = [event('check_suite:failure', 1)];
    expect(
      body('review', state).querySelector('span.pill.bad')?.textContent
    ).toBe('checks failed');
  });

  it('link the ticket ids of the review sheet and the limit hints', () => {
    const state = filled();
    const review = body('review', state);
    expect(review.querySelector('.prnum')).not.toBeNull();
    expect(
      review.querySelector(
        'a.id[href="https://linear.app/codeware/issue/COD-3"]'
      )
    ).not.toBeNull();
    const hint = body('next', state).querySelector('.knobs li span');
    expect(text(hint as Element)).toBe('Merging or closing COD-3 frees a slot');
    expect(hint?.querySelector('a.id')?.getAttribute('href')).toBe(
      'https://linear.app/codeware/issue/COD-3'
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
    expect(text(body('next', state, m))).not.toContain('Parked on a wait');
    const review = text(body('review', state, m));
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
    expect(text(body('next', state, m))).not.toContain('Parked on a wait');
  });
});

describe('scheduler sheets', () => {
  it('list the hosts with live sessions on the session sheet', () => {
    const state = filled();
    expect(text(body('session', state))).toContain(
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
    const c = body('session', state);
    expect(c.querySelector('.knobs li b')?.textContent).toBe('nuc');
    expect(text(c)).toContain(
      '1 session · implement · newest heartbeat 3 m ago'
    );
  });

  it('count the runs of today on the runs sheet, and keep them off the scheduler sheet', () => {
    const state = filled();
    const m = model(state, NOW);
    const c = body('runs', state, m);
    expect(
      [...c.querySelectorAll('.pv-stats > div')].map((x) => text(x))
    ).toEqual(['1runs today', '–median duration', '1failed']);
    expect(text(c)).toContain('Recent runs that did something, last 30 days');
    expect(text(c)).toContain('idle runs are left out');
    const row = c.querySelector('.item.blocked .main > div') as Element;
    expect(text(row)).toBe('failed COD-1');
    expect(row.querySelector('a.id')?.getAttribute('href')).toBe(
      'https://linear.app/codeware/issue/COD-1'
    );
    expect(text(body('scheduler', state, m))).not.toContain(
      'Recent runs that did something'
    );
  });

  it('link the ticket ids of a run detail', () => {
    const state = filled();
    const m = model(state, NOW);
    const detailed = {
      ...m,
      runs: m.runs && {
        ...m.runs,
        rows: [{ ...m.runs.rows[0], detail: 'after COD-7 in `COD-8`' }]
      }
    } as typeof m;
    const meta = body('runs', state, detailed).querySelector(
      '.item .meta'
    ) as Element;
    expect(text(meta)).toBe('after COD-7 in COD-8');
    expect(meta.querySelector('code a.id')?.textContent).toBe('COD-8');
    expect(meta.querySelectorAll('a.id')).toHaveLength(2);
  });

  it('list the timers by group', () => {
    const c = body('timers', filled());
    expect(
      [...c.querySelectorAll('.group > h3')].map((h) => text(h))
    ).toContain('Scheduler (launchd, run.sh)');
    expect(text(c)).toContain('Scheduled run');
    expect(c.querySelector('.meta code')?.textContent).toBe(
      'cdwr agent usage-record'
    );
  });

  it('draw the plan sheet with a bar and a projection per window', () => {
    const c = body('plan', filled());
    expect(text(c)).toContain('5-hour window');
    expect(text(c)).toContain('7-day window');
    expect(text(c)).toContain('At this rate 50% at reset');
    expect(c.querySelectorAll('svg.gauge')).toHaveLength(2);
    expect(c.querySelectorAll('svg.spark')).toHaveLength(1);
    expect(text(c)).toContain('Last 24 hours');
    expect(text(c)).toContain('API-equivalent dollars');
  });

  it('say when a plan window runs out and when it is used up', () => {
    const warn = filled();
    warn.data.planUsage = [planSample('five_hour', 2, 70)];
    expect(text(body('plan', warn))).toMatch(
      /Runs out ~.*, before the .* reset/
    );
    const bad = filled();
    bad.data.planUsage = [planSample('five_hour', 2, 100)];
    expect(text(body('plan', bad))).toContain('Used up until');
  });

  it('say a plan window has reset', () => {
    const state = filled();
    state.data.planUsage = [planSample('five_hour', -1, 90, 200)];
    expect(text(body('plan', state))).toContain('The window has reset');
  });

  it('total the roles on the plan sheet', () => {
    const rows = [...body('plan', filled()).querySelectorAll('tbody tr')].map(
      (r) => [...r.children].map((c) => text(c))
    );
    expect(rows).toContainEqual(['total', '$4.50', '$4.50']);
    expect(rows).toContainEqual(['other', '$3.00', '$3.00']);
  });

  it('explain a missing plan_usage or usage_hours table, or no samples yet', () => {
    const failed = filled();
    failed.data.planUsage = null;
    failed.data.usageHours = null;
    failed.errors.set('planUsage', { code: 'bad_response', message: 'x' });
    failed.errors.set('usageHours', { code: 'bad_response', message: 'x' });
    const html = text(body('plan', failed));
    expect(html).toContain("The plan_usage table couldn't load from Supabase.");
    expect(html).toContain(
      "The usage_hours table couldn't load from Supabase."
    );

    const loading = filled();
    loading.data.planUsage = null;
    loading.data.usageHours = null;
    const wait = text(body('plan', loading));
    expect(wait).toContain('Loading the plan samples');
    expect(wait).toContain('Loading the hourly usage');

    const none = filled();
    none.data.planUsage = [];
    none.data.usageHours = [];
    const empty = text(body('plan', none));
    expect(empty).toContain('cdwr agent statusline install');
    expect(empty).toContain('No hourly usage yet');
    expect(empty).toContain('a proxy for what the plan counts');
  });
});

describe('data sheets', () => {
  it('escape the text of an activity row', () => {
    const c = body('activity', filled());
    expect(c.querySelector('tbody td:last-child')?.textContent).toBe(
      'moved <b>'
    );
    expect(c.querySelector('tbody td:last-child b')).toBeNull();
  });

  it('show everything when the activity filter names a ticket that has left', () => {
    const state = filled();
    state.ui.actFilter = 'COD-1234';
    const c = body('activity', state);
    expect(text(c)).toContain('1 event');
    expect(c.querySelector('select')?.value).toBe('all');
    expect(state.ui.actFilter).toBe('COD-1234');
  });

  it('tell the page which ticket the activity select picked', () => {
    const c = body('activity', filled());
    const select = c.querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-label')).toBe('Filter by ticket');
    expect([...select.options].map((o) => o.value)).toEqual(['all', 'COD-30']);
    fireEvent.change(select, { target: { value: 'COD-30' } });
    expect(actions.onActFilter).toHaveBeenCalledWith('COD-30');
  });

  it('mark the pressed filter on the All sheet and tell the page about a press', () => {
    const state = filled();
    state.ui.filter = 'agent';
    const c = body('all', state);
    const pressed = Object.fromEntries(
      [...c.querySelectorAll('.filters button')].map((b) => [
        text(b),
        b.getAttribute('aria-pressed')
      ])
    );
    expect(pressed).toEqual({
      'All open': 'false',
      'Todo + In Progress': 'false',
      'Agent only': 'true'
    });
    expect(c.querySelector('.filters')?.getAttribute('role')).toBe('group');
    fireEvent.click(
      [...c.querySelectorAll('.filters button')].find(
        (b) => text(b) === 'All open'
      ) as Element
    );
    expect(actions.onFilter).toHaveBeenCalledWith('all');
  });

  it('put the cost per ticket and the spend per day on the effort sheet', () => {
    const c = body('effort', filled());
    expect(text(c)).toContain('Every ticket with usage');
    expect(text(c)).toContain('By model');
    expect(c.querySelectorAll('.chart-slot')).toHaveLength(1);
    expect(
      c.querySelector(
        'td a.id[href="https://linear.app/codeware/issue/COD-30"]'
      )
    ).not.toBeNull();
  });

  it('draw the closed chart in its slot above the days with closed tickets', () => {
    const c = body('shipped', filled());
    expect(c.querySelectorAll('.chart-slot')).toHaveLength(1);
    expect(text(c)).toContain('last 30 days');
    expect(text(c)).toContain('COD-30');
  });

  it('list the suggestions to decide, accepted and discarded, with the reason', () => {
    const c = body('ideas', filled());
    expect(text(c)).toContain('To decide · 1');
    expect(c.querySelectorAll('article.idea')).toHaveLength(1);
    expect(text(c)).toContain('Discarded · 1');
    expect(c.querySelector('.reason')?.textContent).toBe('“not worth it”');
    expect(text(c)).toContain('1of them "not worth it"');
  });
});
