// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { model } from '../model';
import { createState } from '../state';
import type { DeskState } from '../state';
import type { SessionState } from '../types';
import {
  NOW,
  at,
  filled,
  hostSample,
  planSample,
  runs,
  view
} from '../view/fixtures';

import { Parts, SessionCard, UnknownSession } from './session';

const card = (s: DeskState) =>
  render(<SessionCard m={model(s, NOW)} details={s.details} now={NOW} />)
    .container;

const working = (ticket: string): SessionState => ({
  state: 'alive',
  detail: 'working',
  id: 's1',
  ticket,
  lastSeen: '2026-10-29T11:59:30'
});

const detail = (
  done: number,
  steps = 5,
  next: string | null = null,
  pr: number | null = null
) => ({
  steps,
  done,
  next,
  idea: null,
  blockedBy: [],
  pr,
  prAt: null
});

const host = (id: string, name: string, kind: string, ago = 1) =>
  ({
    id,
    host: name,
    kind,
    last_seen: new Date(NOW.getTime() - ago * 6e4).toISOString()
  }) as never;

describe('Parts', () => {
  it('renders text, ids, PRs and code', () => {
    const { container } = render(
      <Parts
        parts={[
          'Run <b> ',
          { id: 'COD-1' },
          ' ',
          { prn: 4, tone: 'ok' },
          ' ',
          { pr: 5 },
          ' ',
          { code: 'cdwr agent install' }
        ]}
      />
    );
    expect(container.textContent).toBe(
      'Run <b> COD-1 #4 #5 cdwr agent install'
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('a.id')?.textContent).toBe('COD-1');
    expect(container.querySelector('a.prn.ok')?.textContent).toBe('#4');
    expect(container.querySelectorAll('a.id')[1].textContent).toBe('#5');
    expect(container.querySelector('code')?.textContent).toBe(
      'cdwr agent install'
    );
  });
});

describe('SessionCard', () => {
  it.each([
    [{ state: 'alive', detail: 'polling' }, 'Session live', 'live'],
    [{ state: 'waiting' }, 'Waiting on a prompt', 'wait'],
    [{ state: 'stopped' }, 'Session stopped', 'idle'],
    [{ state: 'none' }, 'No session', 'idle']
  ] satisfies [SessionState, string, string][])(
    'shows the session %j',
    (session, label, tone) => {
      const c = card(filled(session));
      const article = c.querySelector('article');
      expect(article?.getAttribute('data-w')).toBe('session');
      expect(article?.className).toBe(`card-top session ${tone}`);
      const button = c.querySelector('button.open.state');
      expect(button?.textContent).toBe(label);
      expect(button?.getAttribute('aria-haspopup')).toBe('dialog');
    }
  );

  it('says it is loading before the runs arrive', () => {
    const s = createState();
    expect(card(s).textContent).toContain('Loading the runs…');
  });

  it('names the ticket, its reason and where the session runs', () => {
    const s = filled({ ...working('COD-1') });
    s.data.sessions = [
      {
        id: 's1',
        host: 'mac',
        kind: 'attended',
        last_seen: new Date('2026-10-29T11:59:30').toISOString()
      } as never
    ];
    const c = card(s);
    expect(c.querySelector('.big')?.textContent).toContain('Working on');
    expect(c.querySelector('.big a.id')?.textContent).toBe('COD-1');
    expect(c.querySelector('.ct-sub')?.textContent).toBe(
      'ready · Title of COD-1'
    );
    expect(c.querySelector('.who-runs b.attended')?.textContent).toBe(
      'attended on mac'
    );
    expect(c.querySelector('.who-runs')?.textContent).toContain(
      'seen 30 s ago'
    );
  });

  it('says the session is stuck', () => {
    const c = card(
      filled({
        state: 'alive',
        detail: 'polling',
        lastSeen: '2026-10-29T10:00:00'
      })
    );
    expect(c.querySelector('button.state')?.textContent).toBe('Session stuck');
    expect(c.querySelector('article')?.className).toContain('block');
  });

  it('lists the newest event of each live table, and says when there is none', () => {
    const s = filled();
    expect(card(s).textContent).toContain('No live event yet');
    s.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'check_suite:failure',
        updated_at: new Date('2026-10-29T11:59:00').toISOString()
      } as never
    ];
    s.data.connection.lastIssue = {
      issue_id: 'u',
      identifier: 'COD-<5>',
      action: 'update',
      updated_at: new Date('2026-10-29T11:50:00').toISOString()
    };
    const c = card(s);
    const rows = c.querySelectorAll('.feed li');
    expect(rows).toHaveLength(2);
    expect(c.querySelector('.dot.block')).not.toBeNull();
    expect(rows[0].textContent).toContain('#7 · checks failed');
    expect(rows[1].textContent).toContain('COD-<5> · update');
  });

  it('shows the step the working ticket is on, with its next step linked', () => {
    const s = filled(working('COD-1'));
    s.details.set('COD-1', detail(2, 5, 'wire the bar <now> after COD-4'));
    const c = card(s);
    expect(c.querySelector<HTMLElement>('.ct-step .bar i')?.style.width).toBe(
      '40%'
    );
    expect(c.querySelector('.ct-step span')?.textContent).toBe('Step 3 of 5');
    const next = c.querySelector('.ct-next');
    expect(next?.textContent).toBe('wire the bar <now> after COD-4');
    expect(next?.querySelector('a.id')?.textContent).toBe('COD-4');
  });

  it('caps the step at the last one, and leaves the step out without a plan', () => {
    const s = filled(working('COD-1'));
    s.details.set('COD-1', detail(5));
    const c = card(s);
    expect(c.querySelector('.ct-step')?.textContent).toContain('Step 5 of 5');
    expect(c.querySelector('.ct-next')).toBeNull();
    s.details.set('COD-1', detail(0, 0));
    expect(card(s).querySelector('.ct-step')).toBeNull();
    const idle = filled({ state: 'alive', detail: 'polling' });
    idle.details.set('COD-1', detail(2));
    expect(card(idle).querySelector('.ct-step')).toBeNull();
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
    const wait = card(s).querySelector('.ct-wait');
    expect(wait?.textContent).toBe('waits on CI on #5 for 12 m');
    expect(wait?.querySelector('a.id')?.textContent).toBe('#5');
    expect(card(filled(working('COD-1'))).querySelector('.ct-wait')).toBeNull();
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
    const wait = card(s).querySelector('.ct-wait');
    expect(wait).not.toBeNull();
    expect(wait?.textContent).not.toContain(' for 12 m');
  });

  it('opens the feed with the own PR and its state', () => {
    const s = filled(working('COD-2'));
    s.data.githubEvents = [
      {
        pr: 5,
        subject: 'x',
        action: 'check_suite:success',
        updated_at: new Date('2026-10-29T11:56:00').toISOString()
      } as never
    ];
    const c = card(s);
    expect(c.querySelector('h4.feed-h')?.textContent).toBe('Latest events');
    const own = c.querySelector('.feed li.own');
    expect(own?.querySelector('a.prn')?.textContent).toBe('#5');
    expect(own?.querySelector('.pill.ok')?.textContent).toBe('checks passed');
    expect(own?.querySelector('time')?.textContent).toBe('4 m ago');
    expect(c.querySelector('.feed li.own + li')).not.toBeNull();
  });

  it('says queued for an own PR with no event, and keeps the fallback otherwise', () => {
    const own = card(filled(working('COD-2')));
    expect(own.querySelector('li.own')).not.toBeNull();
    expect(own.querySelector('.pill.neutral')?.textContent).toBe('queued');
    expect(own.textContent).not.toContain('No live event yet');
    const idle = card(filled());
    expect(idle.textContent).toContain('No live event yet');
    expect(idle.querySelector('.own')).toBeNull();
    expect(card(filled(working('COD-1'))).querySelector('.own')).toBeNull();
  });

  it('puts the PR beside Working on', () => {
    const s = filled(working('COD-1'));
    s.details.set('COD-1', detail(0, 0, null, 31));
    const big = card(s).querySelector('.big');
    expect(big?.querySelector('.mono a.id')?.textContent).toBe('COD-1');
    expect(big?.querySelector('.mono a.prn')?.textContent).toBe('#31');
    expect(
      card(filled(working('COD-1'))).querySelector('.big a.prn')
    ).toBeNull();
  });

  it('takes the PR the queue view names when the ticket has no details yet', () => {
    const session = working('COD-1');
    const s = filled(session);
    s.data.runs = runs(
      view({ session, parked: [{ ticket: 'COD-1', wait: 'CI', pr: 77 }] })
    );
    expect(card(s).querySelector('.big a.prn')?.textContent).toBe('#77');
  });

  it("names what comes next, skipping the session's own ticket", () => {
    const s = filled(working('COD-1'));
    expect(card(s).querySelector('.ct-then')).toBeNull();
    s.data.runs = runs(
      view({
        session: working('COD-1'),
        next: [
          { ticket: 'COD-1', reason: 'ready' },
          { ticket: 'COD-4', reason: 'answered' }
        ]
      })
    );
    const then = card(s).querySelector('.ct-then');
    expect(then?.textContent).toBe('Then: COD-4 (answered)');
    expect(then?.querySelector('a.id')?.textContent).toBe('COD-4');
    expect(card(filled()).querySelector('.ct-then')).toBeNull();
  });

  it('shows the plan headroom, the 7-day share only when it has one', () => {
    const s = filled();
    const both = card(s).querySelector('.ct-plan');
    expect(both?.textContent).toMatch(/^Plan: 5h 30% · resets .+ · 7d 18%$/);
    s.data.planUsage = [planSample('five_hour', 2, 30)];
    const five = card(s).querySelector('.ct-plan');
    expect(five?.textContent).toContain('Plan: 5h');
    expect(five?.textContent).not.toContain('7d');
  });

  it('marks a window bad when it runs out, and shows nothing without a live window', () => {
    const s = filled();
    s.data.planUsage = [
      planSample('five_hour', 2, 70),
      planSample('seven_day', 100, 18)
    ];
    const c = card(s);
    expect(c.querySelector('.ct-plan .bad')?.textContent).toBe('70%');
    expect(c.querySelectorAll('.ct-plan span')[1].className).toBe('');
    s.data.planUsage = [planSample('five_hour', -1, 90, 200)];
    expect(card(s).querySelector('.ct-plan')).toBeNull();
  });

  it('keeps the 7-day share when the 5-hour window has reset', () => {
    const s = filled();
    s.data.planUsage = [
      planSample('five_hour', -1, 90, 200),
      planSample('seven_day', 100, 18)
    ];
    expect(card(s).querySelector('.ct-plan')?.textContent).toBe('Plan: 7d 18%');
  });

  it('marks the plan line stale when its sample is old', () => {
    const s = filled();
    s.data.planUsage = [planSample('five_hour', 2, 30, 90)];
    expect(card(s).querySelector('.ct-plan.stale')).not.toBeNull();
    s.data.planUsage = [planSample('five_hour', 2, 30)];
    expect(card(s).querySelector('.ct-plan.stale')).toBeNull();
  });

  it('lists the other live sessions, two at most', () => {
    const s = filled(working('COD-1'));
    s.data.sessions = [host('s1', 'mac', 'attended')];
    expect(card(s).querySelector('.ct-also')).toBeNull();
    s.data.sessions = [
      host('s1', 'mac', 'attended'),
      host('s2', 'nuc', 'implement', 2)
    ];
    expect(card(s).querySelector('.ct-also')?.textContent).toBe(
      'also: implement on nuc'
    );
    s.data.sessions = [
      host('s1', 'mac', 'attended'),
      host('s2', 'nuc', 'implement', 2),
      host('s3', 'nuc', 'plan', 3),
      host('s4', 'mac', 'attended', 4),
      host('s5', 'mac', 'attended', 5)
    ];
    expect(card(s).querySelector('.ct-also')?.textContent).toMatch(
      /^also: [^·]+ · [^·]+ \+2 more$/
    );
  });

  it('adds no PR link to the headline of an idle card', () => {
    const c = card(filled({ state: 'alive', detail: 'polling' }));
    expect(c.querySelector('.big a.prn')).toBeNull();
  });
});

describe('UnknownSession', () => {
  const silent = (): DeskState => {
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
    s.data.runs = runs(view({ session: { state: 'alive', ticket: 'COD-1' } }));
    s.data.hostMetrics = [hostSample(60), hostSample(50)];
    return s;
  };

  it('stands in for the session card with the last known ticket', () => {
    const { container } = render(<UnknownSession m={model(silent(), NOW)} />);
    const section = container.querySelector('section.state-unknown');
    expect(section?.getAttribute('aria-label')).toBe('Session state unknown');
    expect(section?.querySelector('.p-pill.solid')?.textContent).toBe(
      'STATE UNKNOWN'
    );
    expect(section?.querySelector('.su-title')?.textContent).toContain(
      'Last known: nuc'
    );
    expect(section?.querySelector('.long')?.textContent).toBe('running COD-1');
    expect(section?.querySelector('.short')?.textContent).toBe('on COD-1');
    expect(section?.querySelector('.long .mono a.id')?.textContent).toBe(
      'COD-1'
    );
    expect(section?.textContent).toContain(
      'Nothing here is assumed to be running.'
    );
  });

  it('renders nothing without an unknown problem', () => {
    const s = filled();
    s.data.runs = runs(view());
    const { container } = render(<UnknownSession m={model(s, NOW)} />);
    expect(container.innerHTML).toBe('');
  });
});
