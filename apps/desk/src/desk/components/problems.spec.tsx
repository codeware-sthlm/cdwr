// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { hhmm } from '../format';
import { type Model, model } from '../model';
import {
  NOW,
  at,
  down,
  filled,
  hostSample,
  live,
  runs,
  view
} from '../render/fixtures';
import type { DeskState } from '../state';

import {
  Alert,
  type ProblemActions,
  Problems,
  frozenLabel,
  tickText
} from './problems';

const actions = (): ProblemActions => ({
  seeProblems: vi.fn(),
  reconnect: vi.fn(),
  reload: vi.fn(),
  copyRow: vi.fn(),
  platform: vi.fn(),
  abandon: vi.fn()
});

const mount = (m: Model, a = actions(), now = NOW) => {
  const { container, rerender } = render(
    <Problems m={m} now={now} actions={a} />
  );
  const button = (text: string) =>
    Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === text
    );
  return {
    container,
    rerender,
    actions: a,
    button,
    text: container.textContent ?? '',
    html: container.innerHTML
  };
};

const alertOf = (m: Model, onSeeProblems = vi.fn()) => {
  const { container } = render(<Alert m={m} onSeeProblems={onSeeProblems} />);
  return { container, onSeeProblems, text: container.textContent ?? '' };
};

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
    others: [{ host: 'mbp', at: new Date(at(30)).toISOString(), paused: true }]
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

describe('Problems', () => {
  it('draws a card for a failing check no other problem explains, without freezing numbers', () => {
    const m = model(live(crashed(base())), NOW);
    expect(m.problems.map((p) => p.kind)).toEqual(['check']);
    const p = mount(m);
    const card = p.container.querySelector('#problem-check-mac-heartbeat');
    expect(card?.getAttribute('data-kind')).toBe('check');
    expect(p.text).toContain('mac heartbeat');
    expect(p.text).toContain('no heartbeat for 42 m while a turn was running');
    const platform = p.button('Platform ›');
    if (!platform) throw new Error('no Platform button');
    fireEvent.click(platform);
    expect(p.actions.platform).toHaveBeenCalledOnce();
    const a = alertOf(m);
    expect(a.text).toContain('a health check is failing');
    expect(a.text).toContain('1 check failing · see Platform');
    expect(frozenLabel(m)).toBe('');
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

  it('draws the connection problem with its timers, status and retry', () => {
    const p = mount(model(down(base()), NOW));
    expect(p.container.querySelector('h2')?.textContent).toBe('PROBLEMS · 1');
    const card = p.container.querySelector('#problem-connection');
    expect(card?.getAttribute('data-kind')).toBe('connection');
    expect(p.text).toContain('Realtime channel closed');
    const ticks = Array.from(
      p.container.querySelectorAll('.tick'),
      (t) => t.textContent
    );
    expect(ticks).toEqual(['for 2 m 42 s', '2 m 42 s', 'next refresh in 16 s']);
    expect(p.container.querySelector('.tick.next')).not.toBeNull();
    expect(p.container.querySelector('.p-mono')?.textContent).toBe(
      'CHANNEL_ERROR · dropped 2×next refresh in 16 s'
    );
    expect(p.text).toContain('The desk polls instead');
    expect(p.text).toContain('Dropped 2×. Polling; numbers may lag.');
    const reconnect = p.button('Reconnect now');
    const reload = p.button('Reload desk');
    if (!reconnect || !reload) throw new Error('no connection buttons');
    fireEvent.click(reconnect);
    fireEvent.click(reload);
    expect(p.actions.reconnect).toHaveBeenCalledOnce();
    expect(p.actions.reload).toHaveBeenCalledOnce();
    const idle = mount(
      model(down(base(), { status: null, retries: 0, nextAt: null }), NOW)
    );
    expect(idle.container.querySelector('.p-mono')?.textContent).toBe(
      'not connected'
    );
    expect(idle.text).not.toContain('dropped');
    expect(idle.container.querySelector('.tick.next')).toBeNull();
    expect(idle.text).toContain('Realtime channel not connected');
    expect(idle.text).toContain('Live updates have not connected since ');
    expect(idle.text).toContain('Not connected. Polling; numbers may lag.');
  });

  it('updates the timers in place from second to second', () => {
    const m = model(down(base()), NOW);
    const p = mount(m);
    const card = p.container.querySelector('#problem-connection');
    const tick = p.container.querySelector('.tick');
    const later = new Date(NOW.getTime() + 1000);
    p.rerender(<Problems m={m} now={later} actions={p.actions} />);
    expect(p.container.querySelector('#problem-connection')).toBe(card);
    expect(p.container.querySelector('.tick')).toBe(tick);
    expect(tick?.textContent).toBe('for 2 m 43 s');
    expect(p.container.querySelector('.tick.next')?.textContent).toBe(
      'next refresh in 15 s'
    );
  });

  it('words each timer', () => {
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
    const p = mount(model(parse(base()), NOW));
    expect(p.text).toContain("queue_state doesn't parse");
    expect(p.container.querySelector('[data-kind="data"]')).not.toBeNull();
    expect(p.text).toContain('The row fails at session, limit.');
    expect(p.text).toContain(`from ${hhmm(at(5))}`);
    const raw = p.container.querySelector<HTMLElement>('pre.raw');
    expect(raw?.textContent).not.toContain('⟨');
    expect(raw?.textContent).toContain('"limit": 1');
    const marks = p.container.querySelector('pre.raw-marks');
    expect(marks?.textContent).toBe('session: ⟨missing⟩\nlimit: ⟨invalid⟩');
    expect(marks?.querySelectorAll('mark')).toHaveLength(2);
    const copy = p.button('Copy raw row');
    if (!copy) throw new Error('no copy button');
    fireEvent.click(copy);
    expect(p.actions.copyRow).toHaveBeenCalledWith(raw);
  });

  it('draws the writers problem with the fix and no button', () => {
    const p = mount(model(writers(filled()), NOW));
    expect(p.text).toContain('More than one host publishes the queue');
    expect(p.text).toContain('mbp (paused, last ');
    expect(p.text).toContain('cdwr agent uninstall');
    expect(p.text).toContain('stop the agent container');
    expect(p.text).not.toContain('<host>');
    expect(p.text).toContain('in the last 2 h');
    expect(p.text).toContain(`last ${hhmm(at(30))}`);
    expect(
      p.container.querySelector('.problem[data-kind="data"] button')
    ).toBeNull();
  });

  it('draws the stale problem without a raw row or a button', () => {
    const p = mount(model(stale(base()), NOW));
    expect(p.text).toContain('queue_state is older than the newest run');
    expect(p.container.querySelector('.raw')).toBeNull();
    expect(p.container.querySelector('button')).toBeNull();
  });

  it('draws the unknown problem, with the abandon note but no button without controls', () => {
    const m = model(silent(base()), NOW);
    const p = mount(m);
    expect(p.text).toContain('nuc silent with a run open');
    const ticks = Array.from(
      p.container.querySelectorAll('.tick'),
      (t) => t.textContent
    );
    expect(ticks[0]).toMatch(/^no heartbeat for \d+ m$/);
    expect(ticks[1]).toMatch(/^\d+ m silent$/);
    expect(p.text).toContain(' · limit ');
    const link = p.container.querySelector<HTMLAnchorElement>('.p-body a.id');
    expect(link?.textContent).toBe('COD-1');
    expect(link?.href).toBe('https://linear.app/codeware/issue/COD-1');
    expect(p.text).toContain(
      `COD-1 started ${hhmm(at(10))} and has no finished_at.`
    );
    expect(p.text).toContain(
      'from the CLI or with a control token in Settings'
    );
    expect(p.container.querySelector('[data-cmd]')).toBeNull();
  });

  it('asks to confirm the abandon with a control token, and sends through its action', () => {
    const s = silent(base());
    s.controls.target = {
      supabaseUrl: 'https://x.supabase.co',
      controlToken: 't'
    };
    const p = mount(model(s, NOW));
    const button = p.container.querySelector<HTMLButtonElement>(
      'button[data-cmd="abandon"]'
    );
    expect(button?.textContent).toBe('Mark run abandoned');
    expect(button?.className).toBe('p-btn');
    expect(p.text).toContain('Check the host first.');
    if (!button) throw new Error('no abandon button');
    fireEvent.click(button);
    expect(p.actions.abandon).toHaveBeenCalledOnce();
    s.controls.confirm = { until: NOW.getTime() + 1000, session: null };
    p.rerender(<Problems m={model(s, NOW)} now={NOW} actions={p.actions} />);
    expect(button.textContent).toBe('Confirm abandon');
  });

  it('renders nothing once the state is healthy again', () => {
    const m = model(live(fresh(base())), NOW);
    expect(m.problems).toEqual([]);
    expect(mount(m).html).toBe('');
    expect(alertOf(m).container.innerHTML).toBe('');
    expect(frozenLabel(m)).toBe('');
  });
});

describe('Alert', () => {
  it('words the alert for a second writer alone, and keeps the usual one when mixed', () => {
    const only = alertOf(model(live(writers(base())), NOW)).text;
    expect(only).toContain('1 problem — another host publishes the queue');
    expect(only).toContain('the desk reads nuc');
    expect(only).not.toContain("can't vouch");
    const mixed = alertOf(model(down(writers(base())), NOW)).text;
    expect(mixed).toContain("the desk can't vouch for what it shows");
  });

  it('counts the problems and says when the numbers froze', () => {
    const m = model(down(parse(base())), NOW);
    const a = alertOf(m);
    expect(a.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(a.text).toContain(
      "2 problems — the desk can't vouch for what it shows"
    );
    // The parse problem began at the row's time, earlier than the drop
    expect(a.text).toContain(
      `numbers frozen at ${hhmm(at(5))} · channel dropped 2×`
    );
    const link = a.container.querySelector<HTMLAnchorElement>('a.alert-link');
    expect(link?.getAttribute('href')).toBe('#problems');
    if (!link) throw new Error('no See problems link');
    fireEvent.click(link);
    expect(a.onSeeProblems).toHaveBeenCalledOnce();
    expect(frozenLabel(m)).toBe(`EVERYTHING ELSE · FROZEN AT ${hhmm(at(5))}`);
    expect(mount(m).container.querySelector('h2.problems-h')?.textContent).toBe(
      'PROBLEMS · 2'
    );
    const closed = alertOf(model(down(base(), { retries: 0 }), NOW)).text;
    expect(closed).toContain('1 problem —');
    expect(closed).toContain('live updates down since ');
    expect(closed).toContain('numbers may lag');
    expect(closed).not.toContain('frozen');
    expect(closed).not.toContain('channel dropped');
    expect(alertOf(model(down(base()), NOW)).text).toContain(
      'numbers may lag · channel dropped 2×'
    );
    expect(frozenLabel(model(down(base()), NOW))).toBe('');
  });
});
