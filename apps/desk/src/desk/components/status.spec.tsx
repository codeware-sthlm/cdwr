// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { createState } from '../state';
import type { QueueTreeNode } from '../types';
import {
  NEW,
  NOW,
  OLD,
  at,
  behind,
  connection,
  down,
  filled,
  live,
  runs,
  view
} from '../view/fixtures';

import { Status, TreePill } from './status';

const node = (ticket: string, gaps: string[] = []): QueueTreeNode => ({
  ticket,
  title: null,
  state: 'started',
  label: null,
  pr: null,
  position: null,
  waiting: false,
  blockers: [],
  gaps: gaps.map((kind) => ({ kind, candidate: false })),
  children: []
});

describe('TreePill', () => {
  const pill = (tree: QueueTreeNode[] | null, current = 'agent') => {
    const state = filled();
    state.data.runs = tree ? runs(view({ tree })) : null;
    const onView = vi.fn();
    const { container } = render(
      <TreePill
        m={model(state, NOW)}
        view={current as 'agent'}
        onView={onView}
      />
    );
    return {
      onView,
      button: container.querySelector('button[data-view="tree"]') as HTMLElement
    };
  };

  it('counts the roots and the gaps in the wait tone', () => {
    const { button } = pill([
      node('COD-1'),
      node('COD-2', ['label-on-closed'])
    ]);
    expect(button.textContent).toContain('Tree');
    expect(button.querySelector('.roots')?.textContent).toBe('2');
    const gaps = button.querySelector('.gaps');
    expect(gaps?.textContent).toBe('· 1 gap');
    expect(gaps?.className).toContain('text-[color:var(--wait)]');
    expect(button.querySelector('.flag.wait')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe(
      'Ticket tree: 2 roots, 1 gap'
    );
  });

  it('shows no gaps text or flag when there are none', () => {
    const { button } = pill([node('COD-1')]);
    expect(button.querySelector('.gaps')).toBeNull();
    expect(button.querySelector('.flag')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Ticket tree: 1 root');
  });

  it('shows a dash for the count before the runs arrive', () => {
    const { button } = pill(null);
    expect(button.querySelector('.roots')?.textContent).toBe('–');
    expect(button.getAttribute('aria-label')).toBe('Ticket tree: loading');
  });

  it('is the current page on the tree view only', () => {
    expect(pill([], 'tree').button.getAttribute('aria-current')).toBe('page');
    expect(pill([], 'agent').button.hasAttribute('aria-current')).toBe(false);
  });

  it('opens the tree view on click', () => {
    const { button, onView } = pill([]);
    fireEvent.click(button);
    expect(onView).toHaveBeenCalledWith('tree');
  });
});

describe('Status', () => {
  it('opens the Agent health view from the Agent health pill', () => {
    const onView = vi.fn();
    const { container } = render(
      <Status
        m={model(filled(), NOW)}
        connection={connection(true)}
        onView={onView}
      />
    );
    const button = screen.getByRole('button', { name: /Agent health/ });
    expect(button.textContent).toContain('Agent health');
    fireEvent.click(button);
    expect(onView).toHaveBeenCalledWith('health');
    expect(container.textContent).toContain('LIVE');
    expect(container.textContent).toContain('realtime ·');
  });

  it('marks the Agent health pill as the current page on the Agent health view', () => {
    const { container } = render(
      <Status
        m={model(filled(), NOW)}
        connection={connection(true)}
        view="health"
        onView={vi.fn()}
      />
    );
    expect(
      container.querySelector('.health')?.getAttribute('aria-current')
    ).toBe('page');
  });

  describe('the Slack button', () => {
    const slack = (
      notify: NonNullable<ReturnType<typeof runs>['notify']> | undefined,
      onSheet = vi.fn(),
      pill = true,
      now = NOW
    ) => {
      const state = filled();
      if (state.data.runs) state.data.runs = { ...state.data.runs, notify };
      const { container } = render(
        <Status
          m={model(state, NOW)}
          connection={connection(true)}
          onView={vi.fn()}
          onSheet={onSheet}
          pill={pill}
          now={now}
        />
      );
      return {
        onSheet,
        button: container.querySelector<HTMLElement>('button.slack')
      };
    };

    it('shows the level after the Agent health pill and opens the notices', () => {
      const { button, onSheet } = slack({ level: 'action' });
      expect(button?.textContent).toBe('Slack: action');
      expect(button?.previousElementSibling?.classList.contains('health')).toBe(
        true
      );
      fireEvent.click(button as HTMLElement);
      expect(onSheet).toHaveBeenCalledWith('notices');
    });

    it('says urgent only until the time while a mute is ahead', () => {
      const until = new Date(NOW.getTime() + 3600_000);
      const { button } = slack({
        level: 'all',
        muteUntil: until.toISOString()
      });
      expect(button?.textContent).toBe(
        `Slack: urgent only until ${until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      );
    });

    it('reads a mute that has passed as none', () => {
      const { button } = slack({
        level: 'all',
        muteUntil: new Date(NOW.getTime() - 60_000).toISOString()
      });
      expect(button?.textContent).toBe('Slack: all');
    });

    it('puts the day in front when the mute ends on another day', () => {
      const until = new Date(NOW.getTime() + 30 * 3600_000);
      const { button } = slack({
        level: 'all',
        muteUntil: until.toISOString()
      });
      const time = until.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      expect(button?.textContent).toContain(time);
      expect(button?.textContent).not.toBe(`Slack: urgent only until ${time}`);
    });

    it('is absent without a dial', () => {
      expect(slack(undefined).button).toBeNull();
    });

    it('stays on a view without the Agent health pill', () => {
      expect(slack({ level: 'all' }, vi.fn(), false).button?.textContent).toBe(
        'Slack: all'
      );
    });
  });

  it('leaves out the pill but keeps the connection indicator without it', () => {
    const { container } = render(
      <Status
        m={model(filled(), NOW)}
        connection={connection(true)}
        pill={false}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('LIVE');
  });

  it('shows the unknown state while polling', () => {
    const { container } = render(
      <Status
        m={model(filled(), NOW)}
        connection={connection(false)}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.conn.off')).not.toBeNull();
    expect(container.textContent).toContain('POLLING');
    expect(container.textContent).toContain('every 5 min');
  });

  it('shows a dash for the checks while loading', () => {
    render(
      <Status
        m={model(createState(), NOW)}
        connection={connection(true)}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('checks –')).toBeTruthy();
  });

  it('counts failing checks and run problems', () => {
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    const { container } = render(
      <Status
        m={model(state, NOW)}
        connection={connection(true)}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.checks.bad')?.textContent).toMatch(
      /\d+ failing/
    );
  });

  it('shows a run held by the session limit in the wait tone, not as failing', () => {
    const state = filled();
    const when = new Date(NOW.getTime() - 6e4);
    const pad = (n: number) => String(n).padStart(2, '0');
    state.data.runs = {
      ...runs(view()),
      last: {
        when: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`,
        outcome: 'limited'
      },
      rows: [
        {
          when: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`,
          outcome: 'limited',
          ticket: 'COD-1',
          detail: '',
          started: when.toISOString(),
          finished: null
        }
      ]
    };
    const m = model(state, NOW);
    const { container } = render(
      <Status m={m} connection={connection(true)} onView={vi.fn()} />
    );
    expect(m.runProblems).toEqual([]);
    expect(container.querySelector('.limited')?.className).toContain(
      'text-[color:var(--wait)]'
    );
    expect(container.querySelector('.limited')?.textContent).toContain(
      'session limit'
    );
  });

  it('says when the image is behind main, and not when both are current', () => {
    const stale = behind({ image: NEW, desk: null, deskWeb: null }, true);
    const first = render(
      <Status
        m={model(stale, NOW, null)}
        connection={stale.data.connection}
        onView={vi.fn()}
      />
    );
    expect(first.container.querySelector('.updates')?.textContent).toContain(
      '· 1 update'
    );
    first.unmount();
    const current = behind({ image: OLD, desk: OLD, deskWeb: null }, true);
    const second = render(
      <Status
        m={model(current, NOW, OLD)}
        connection={current.data.connection}
        onView={vi.fn()}
      />
    );
    expect(second.container.querySelector('.updates')).toBeNull();
  });

  it('shows OFFLINE once the channel is down', () => {
    const s = down(filled());
    const { container } = render(
      <Status
        m={model(s, NOW)}
        connection={s.data.connection}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.conn.offline')).not.toBeNull();
    expect(screen.getByText('OFFLINE')).toBeTruthy();
    expect(container.querySelector('.long')?.textContent).toContain(
      'down since '
    );
    expect(container.querySelector('.short')?.textContent).toMatch(/^since /);
    expect(container.textContent).not.toContain('last event');
  });

  it('names the last event when one was seen before the drop', () => {
    const s = down(filled());
    s.data.connection.lastIssue = {
      issue_id: 'u',
      identifier: 'COD-1',
      action: 'update',
      updated_at: new Date(at(1)).toISOString()
    };
    const { container } = render(
      <Status
        m={model(s, NOW)}
        connection={s.data.connection}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.long')?.textContent).toContain(
      'last event '
    );
    expect(container.textContent).not.toContain('down since');
  });

  it('shows POLLING, not OFFLINE, within the grace', () => {
    const grace = down(filled(), {
      retries: 0,
      downSince: NOW.getTime() - 2000
    });
    const { container } = render(
      <Status
        m={model(grace, NOW)}
        connection={grace.data.connection}
        onView={vi.fn()}
      />
    );
    expect(container.textContent).toContain('POLLING');
    expect(container.textContent).not.toContain('OFFLINE');
  });

  it('shows LIVE once the channel is up', () => {
    const on = live(filled());
    render(
      <Status
        m={model(on, NOW)}
        connection={on.data.connection}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('LIVE')).toBeTruthy();
  });
});
