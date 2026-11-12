// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DeskCommandRow, RunsPayload } from '../../supabase';
import { dayTime } from '../format';
import { model } from '../model';
import type { DeskState } from '../state';
import {
  NEW,
  NOW,
  OLD,
  at,
  down,
  filled,
  hostSample,
  live,
  runs,
  view
} from '../view/fixtures';

import { Platform, type PlatformActions } from './platform';
import { Problems } from './problems';

const actions = () =>
  ({
    desk: vi.fn(),
    problem: vi.fn(),
    sheet: vi.fn(),
    pause: vi.fn(),
    run: vi.fn(),
    step: vi.fn(),
    apply: vi.fn()
  }) satisfies PlatformActions;

const jobWith = (
  over: Partial<NonNullable<RunsPayload['job']>>,
  main: RunsPayload['main'] = { image: null, desk: null, deskWeb: null }
): DeskState => {
  const s = filled();
  const base = runs(view());
  s.data.runs = { ...base, main, job: base.job && { ...base.job, ...over } };
  return s;
};

const session = (host: string, kind: string, ago: number) =>
  ({
    id: `${host}-${kind}`,
    host,
    kind,
    last_seen: new Date(NOW.getTime() - ago * 6e4).toISOString()
  }) as never;

/** Every health check passes, so only the problem under test shows */
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

const mount = (
  s: DeskState,
  desk: string | null = null,
  a: ReturnType<typeof actions> = actions()
) => {
  const m = model(s, NOW, desk);
  const { container } = render(<Platform m={m} now={NOW} actions={a} />);
  const all = (sel: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(sel));
  const text = container.textContent ?? '';
  /** The element of a selector whose text is exactly `t` */
  const withText = (sel: string, t: string) =>
    all(sel).find((e) => e.textContent === t);
  /** The health row of a check, by its name */
  const check = (name: string) =>
    all('.pf-hname').find((e) => e.firstElementChild?.textContent === name);
  const q = <T extends HTMLElement = HTMLButtonElement>(sel: string) =>
    container.querySelector<T>(sel);
  return { container, a, text, all, withText, check, q };
};

describe('Platform', () => {
  it('draws the four sections with a back link and the head counts', () => {
    const p = mount(filled());
    expect(p.all('h2.cap-label').map((e) => e.textContent)).toEqual([
      'CONTROLS',
      'HOSTS & HEARTBEAT',
      'VERSIONS & UPDATES',
      'HEALTH CHECKS'
    ]);
    expect(p.q('[data-view="desk"]')).not.toBeNull();
    expect(p.q('h1#platform-title')).not.toBeNull();
    expect(p.text).toContain('controls need a control token in Settings');
    expect(p.text).toContain('Read-only here: add a control token');
    expect(p.q('[data-cmd]')).toBeNull();
    // Realtime is not connected in the fixture
    expect(p.q('.pf-stat.bad')?.textContent).toMatch(/^\d+ failing$/);
  });

  it('says whether the queue runs or is paused, and the limits it sets', () => {
    const p = mount(filled());
    expect(p.withText('.pf-val', 'Running')?.classList.contains('wait')).toBe(
      false
    );
    expect(p.text).toContain(
      '2 open now · set per session with /work-queue limit=N'
    );
    expect(p.text).toContain('last run ');
    expect(
      mount(jobWith({ paused: true }))
        .withText('.pf-val', 'Paused')
        ?.classList.contains('wait')
    ).toBe(true);
    expect(mount(jobWith({ live: true })).text).toContain('on events');
  });

  it('shows the effort cap, and a dash when it is not published', () => {
    expect(
      mount(filled()).withText('.pf-val', '–')?.classList.contains('wait')
    ).toBe(false);
    const p = mount(jobWith({ effort: { spent: 32, cap: 40 } }));
    expect(p.withText('.pf-val', '$40')?.classList.contains('wait')).toBe(
      false
    );
    expect(p.text).toContain('80% used today');
  });

  it('chips the image, the desk and the scripts against main', () => {
    const behind = mount(
      jobWith(
        { host: 'container', rev: 'sha-abc1234' },
        { image: NEW, desk: NEW, deskWeb: null }
      ),
      OLD
    );
    expect(behind.text).toContain('update available');
    expect(behind.text).toContain('sha-abc1234 → sha-def5678');
    expect(behind.text).toContain('out of date');
    expect(behind.text).toContain('cdwr agent desk install');
    const current = mount(
      jobWith(
        { host: 'container', rev: 'sha-abc1234' },
        { image: OLD, desk: OLD, deskWeb: null }
      ),
      OLD
    );
    expect(current.text).toContain('up to date');
    expect(current.text).not.toContain('update available');
    expect(current.text).not.toContain('reload the desk');
    expect(current.text).toContain('matches main');
    expect(mount(filled()).withText('.pf-chip.muted', 'unknown')).toBeDefined();
  });

  it('says the scripts are out of date with their items, or unknown', () => {
    const stale = mount(
      jobWith({ install: 'stale', items: 'watch.jq, waits.sh' })
    );
    expect(stale.text).toContain('out of date (watch.jq, waits.sh)');
    const unknown = mount(jobWith({ install: 'unknown' }));
    expect(unknown.text).toContain('Scheduler scripts');
    expect(unknown.text).not.toContain('matches main');
  });

  it('lists a check per row, with the problem text of a failing one', () => {
    const s = filled();
    s.data.hostMetrics = [hostSample(0)];
    s.data.connection.downSince = NOW.getTime() - 60e3;
    const p = mount(s);
    expect(p.text).toContain('Realtime');
    expect(p.text).toContain('queue_state parses');
    expect(p.text).toContain('nuc heartbeat');
    expect(p.text).toContain('github_events last event');
    expect(p.text).toContain('Linear poll');
    expect(p.text).toContain('Realtime is not connected; polling every 5 min');
    expect(p.q('.cap-dot.bad')).not.toBeNull();
    expect(p.text).toContain('never');
    // A check no other problem explains links to its own card
    expect(
      p.q('[data-problem="problem-check-github-events-last-event"]')
        ?.textContent
    ).toBe('not loaded');
  });

  it('says which PR change the webhook missed, on the row and the CHECK card', () => {
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
    const p = mount(s);
    expect(
      p.q('[data-problem="problem-check-github-events-last-event"]')
        ?.textContent
    ).toBe(text);
    const { container } = render(
      <Problems
        m={model(s, NOW)}
        now={NOW}
        actions={{
          seeProblems: vi.fn(),
          reconnect: vi.fn(),
          reload: vi.fn(),
          copyRow: vi.fn(),
          platform: vi.fn(),
          abandon: vi.fn()
        }}
      />
    );
    expect(
      container.querySelector('#problem-check-github-events-last-event')
        ?.textContent
    ).toContain(text);
  });

  it('says quiet on the webhook row when no PR changed', () => {
    const s = filled();
    s.data.githubEvents = [];
    expect(
      mount(s).check('github_events last event')?.querySelector('small.pf-note')
        ?.textContent
    ).toBe('quiet');
  });

  it('shows the Mac panel only with a Mac host', () => {
    const none = mount(filled());
    expect(none.q('.pf-box.mac')).toBeNull();
    expect(none.q('.pf-strip')).toBeNull();
    expect(none.text).not.toContain('mac today');
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
    const p = mount(s);
    expect(p.q('.pf-box.mac')).not.toBeNull();
    expect(p.withText('b.cap-name', 'mac')).toBeDefined();
    expect(p.withText('.pf-chip.work.on', 'ATTENDED')).toBeDefined();
    expect(p.text).toContain(
      'you are on COD-1 · the queue schedules nothing here'
    );
    expect(p.text).toContain('heartbeat within 5 min');
    expect(p.text).toContain('no heartbeat for 5–30 min');
    expect(p.q('.pf-strip span.on b')?.textContent).toBe('attended');
    const back = filled();
    back.data.sessions = [session('mac', 'attended', 10)];
    const handing = mount(back);
    expect(handing.text).not.toContain('ATTENDED');
    expect(handing.withText('.pf-chip.muted', 'HANDING BACK')).toBeDefined();
    expect(handing.text).toContain('seen 10 m ago');
  });

  it('gives the NUC a verdict chip and its heartbeat line', () => {
    const busy = mount(filled());
    expect(busy.withText('.pf-chip.ok', 'BUSY')).toBeDefined();
    expect(busy.text).toContain('heartbeat 0 s ago · every 10 min · CPU 25%');
    const idle = jobWith({});
    idle.data.runs = runs(view());
    idle.data.runs.rows = [];
    expect(mount(idle).withText('.pf-chip.ok', 'IDLE')).toBeDefined();
    const stale = filled();
    stale.data.hostMetrics = [hostSample(30)];
    expect(mount(stale).withText('.pf-chip.muted', 'STALE')).toBeDefined();
    const bad = filled();
    bad.data.hostMetrics = [hostSample(0, { mem_available: 0.2 * 2 ** 30 })];
    expect(mount(bad).withText('.pf-chip.bad', 'BAD')).toBeDefined();
    const empty = filled();
    empty.data.hostMetrics = [];
    expect(mount(empty).text).toContain('no samples yet');
  });

  it("lists the Mac's sessions of today, and says when there are none", () => {
    const s = filled();
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const p = mount(s);
    expect(p.text).toContain('mac today');
    expect(p.text).toContain('attended session · last seen');
    expect(p.withText('.pf-t', 'now')).toBeDefined();
    const old = filled();
    old.data.sessions = [session('mac', 'attended', 20 * 60)];
    expect(mount(old).text).toContain('no sessions today');
  });

  describe('health checks and problems', () => {
    it('links a failing check to the card of the problem that explains it', () => {
      const m = model(live(crashed(base())), NOW);
      expect(m.problems.map((p) => p.kind)).toEqual(['check']);
      const p = mount(live(crashed(base())));
      expect(
        p
          .check('mac heartbeat')
          ?.querySelector('[data-problem="problem-check-mac-heartbeat"]')
      ).not.toBeNull();
    });

    it('says no session for a host whose session ended', () => {
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
      expect(
        mount(s).check('mac heartbeat')?.querySelector('small.pf-note')
          ?.textContent
      ).toBe('no session');
    });

    it('links a failing health check to its problem card', () => {
      expect(
        mount(down(base())).q('[data-problem="problem-connection"]')
      ).not.toBeNull();
      expect(
        mount(live(fresh(base()))).q('[data-problem="problem-connection"]')
      ).toBeNull();
      const frozen = parse(base());
      if (frozen.data.runs)
        frozen.data.runs = {
          ...frozen.data.runs,
          at: new Date(at(60 * 24 * 5)).toISOString()
        };
      const p = mount(frozen);
      expect(
        p
          .check('queue_state parses')
          ?.querySelector('[data-problem="problem-data-parse"]')
      ).not.toBeNull();
      expect(
        p
          .check('Snapshot age')
          ?.querySelector('[data-problem="problem-data-stale"]')
      ).not.toBeNull();
    });

    it('opens the problem card from the failing check', () => {
      const p = mount(down(base()));
      const button = p.q('.pf-problem');
      expect(button?.getAttribute('data-problem')).toBe('problem-connection');
      fireEvent.click(button as HTMLElement);
      expect(p.a.problem).toHaveBeenCalledWith('problem-connection');
    });
  });

  describe('buttons', () => {
    it('goes back to the desk', () => {
      const p = mount(filled());
      fireEvent.click(p.q('.pf-back') as HTMLElement);
      expect(p.a.desk).toHaveBeenCalledTimes(1);
    });

    it("opens the scheduler row's sheets", () => {
      const p = mount(filled());
      for (const [id, label] of [
        ['scheduler', 'details'],
        ['timers', 'timers'],
        ['runs', 'runs']
      ] as const) {
        const b = p.q(`[data-w="${id}"]`);
        expect(b?.textContent).toBe(label);
        fireEvent.click(b as HTMLElement);
        expect(p.a.sheet).toHaveBeenLastCalledWith(id);
      }
      expect(p.a.sheet).toHaveBeenCalledTimes(3);
    });
  });
});

describe('Platform with controls', () => {
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

  it('draws the buttons and steppers with their data attributes', () => {
    const p = mount(on());
    expect(p.q('[data-cmd="pause"]')).not.toBeNull();
    expect(p.q('[data-cmd="run"]')).not.toBeNull();
    expect(p.q('[data-step="limit:-1"]')).not.toBeNull();
    expect(p.q('[data-step="limit:1"]')).not.toBeNull();
    expect(p.q('[data-step="cap:-5"]')).not.toBeNull();
    expect(p.q('[data-step="cap:5"]')).not.toBeNull();
    expect(p.q('[data-apply="limit"]')).not.toBeNull();
    expect(p.text).not.toContain('read-only');
    expect(p.text).not.toContain('COD-680');
  });

  it('offers resume while paused', () => {
    const p = mount(
      on((x) => {
        const r = x.data.runs;
        if (r?.job) r.job = { ...r.job, paused: true };
      })
    );
    expect(p.q('[data-cmd="resume"]')).not.toBeNull();
    expect(p.q('[data-cmd="pause"]')).toBeNull();
  });

  it('shows the draft and enables Apply only when it differs', () => {
    expect(
      mount(on()).q<HTMLButtonElement>('[data-apply="limit"]')?.disabled
    ).toBe(true);
    const p = mount(on((s) => (s.controls.drafts = { limit: 7 })));
    expect(p.withText('.ctl-draft', '7')).toBeDefined();
    expect(p.q<HTMLButtonElement>('[data-apply="limit"]')?.disabled).toBe(
      false
    );
  });

  it('disables a pending control and says so', () => {
    const p = mount(on((s) => (s.data.deskCommands = [row(1, 'run')])));
    expect(p.q<HTMLButtonElement>('[data-cmd="run"]')?.disabled).toBe(true);
    expect(p.text).toContain('pending…');
  });

  it('shows a refused note', () => {
    const p = mount(
      on((s) => (s.data.deskCommands = [row(1, 'run', 'refused', 'paused')]))
    );
    const note = p.q('small[role="status"]');
    expect(note?.textContent).toBe('paused');
    expect(p.q<HTMLButtonElement>('[data-cmd="run"]')?.disabled).toBe(false);
  });

  it('sends pause, or resume while paused, and run', () => {
    const p = mount(on());
    fireEvent.click(p.q('[data-cmd="pause"]') as HTMLElement);
    expect(p.a.pause).toHaveBeenCalledWith('pause');
    fireEvent.click(p.q('[data-cmd="run"]') as HTMLElement);
    expect(p.a.run).toHaveBeenCalledTimes(1);
    const paused = mount(
      on((x) => {
        const r = x.data.runs;
        if (r?.job) r.job = { ...r.job, paused: true };
      })
    );
    fireEvent.click(paused.q('[data-cmd="resume"]') as HTMLElement);
    expect(paused.a.pause).toHaveBeenCalledWith('resume');
  });

  it('steps the limit and the cap, and applies a draft', () => {
    const p = mount(
      on((s) => {
        const r = s.data.runs;
        if (r?.job) r.job = { ...r.job, effort: { spent: 10, cap: 40 } };
        s.controls.drafts = { limit: 7 };
      })
    );
    fireEvent.click(p.q('[data-step="limit:1"]') as HTMLElement);
    expect(p.a.step).toHaveBeenLastCalledWith('limit', 1);
    fireEvent.click(p.q('[data-step="cap:-5"]') as HTMLElement);
    expect(p.a.step).toHaveBeenLastCalledWith('cap', -5);
    fireEvent.click(p.q('[data-apply="limit"]') as HTMLElement);
    expect(p.a.apply).toHaveBeenCalledWith('limit');
  });
});
