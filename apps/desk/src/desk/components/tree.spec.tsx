// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import {
  type DeskState,
  NO_TREE_FILTER,
  type TreeFilter,
  createState
} from '../state';
import type { QueueTreeNode, SessionState } from '../types';
import { NOW, filled, runs, view } from '../view/fixtures';

import { TreePage } from './tree';

const node = (
  ticket: string,
  over: Partial<QueueTreeNode> = {}
): QueueTreeNode => ({
  ticket,
  title: `Tree ${ticket}`,
  state: 'started',
  label: null,
  pr: null,
  position: null,
  waiting: false,
  blockers: [],
  gaps: [],
  children: [],
  ...over
});

const ALL: TreeFilter = { ...NO_TREE_FILTER, closed: true };

/** The page over `tree`; `prepare` adjusts the state (details, session, watches) first */
const mountWith = (
  tree: QueueTreeNode[],
  {
    onDesk = vi.fn(),
    onFilter = vi.fn(),
    onTicket = vi.fn(),
    filter = ALL,
    open = {},
    onOpen = vi.fn(),
    session = { state: 'none' },
    prepare = () => undefined
  }: {
    onDesk?: () => void;
    onFilter?: (filter: TreeFilter) => void;
    onTicket?: (id: string) => void;
    filter?: TreeFilter;
    open?: Record<string, boolean>;
    onOpen?: (ticket: string, open: boolean) => void;
    session?: SessionState;
    prepare?: (state: DeskState) => void;
  } = {}
): HTMLElement => {
  const state = filled();
  state.data.runs = runs(view({ tree, session }));
  prepare(state);
  return render(
    <TreePage
      m={model(state, NOW)}
      details={state.details}
      now={NOW}
      filter={filter}
      onFilter={onFilter}
      open={open}
      onOpen={onOpen}
      onDesk={onDesk}
      onTicket={onTicket}
    />
  ).container;
};

const mount = (tree: QueueTreeNode[], onDesk = vi.fn()): HTMLElement =>
  mountWith(tree, { onDesk });

const watching = (state: DeskState, over: Record<string, unknown> = {}) => {
  const base = state.data.runs;
  if (!base) return;
  state.data.runs = {
    ...base,
    watches: [
      {
        host: 'nuc',
        at: NOW.toISOString(),
        watch: {
          'COD-10': {
            pr: 42,
            state: 'open',
            unresolved: 0,
            threads: 0,
            conflicting: false,
            ci: 'SUCCESS',
            copilot: 'none',
            at: NOW.toISOString(),
            ...over
          }
        }
      }
    ]
  };
};

const ids = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('a.id')].map((a) => text(a));

const text = (el: Element | null): string => el?.textContent ?? '';

describe('TreePage', () => {
  it('titles the view and takes focus-by-script on the title', () => {
    const c = mount([node('COD-10')]);
    const h1 = c.querySelector('h1#tree-title') as HTMLElement;
    expect(text(h1)).toBe('Ticket tree');
    expect(h1.tabIndex).toBe(-1);
    expect(text(c)).toContain('the whole backlog in the queue');
  });

  it('goes back to the desk from the back button', () => {
    const onDesk = vi.fn();
    const c = mount([node('COD-10')], onDesk);
    fireEvent.click(c.querySelector('button[data-view="desk"]') as HTMLElement);
    expect(onDesk).toHaveBeenCalledOnce();
  });

  it('opens the Ticket sheet from a row title, and keeps the id a link to Linear', () => {
    const onTicket = vi.fn();
    const c = mountWith([node('COD-10', { children: [node('COD-11')] })], {
      onTicket
    });
    const titles = [...c.querySelectorAll('button.title')];
    expect(titles.map(text)).toEqual(['Tree COD-10', 'Tree COD-11']);
    fireEvent.click(titles[1]);
    expect(onTicket).toHaveBeenCalledWith('COD-11');
    expect(c.querySelector('a.id[href$="/issue/COD-11"]')?.textContent).toBe(
      'COD-11'
    );
  });

  it('nests the children of a root under it', () => {
    const c = mount([
      node('COD-10', {
        children: [node('COD-11'), node('COD-12', { state: 'unstarted' })]
      })
    ]);
    const root = c.querySelector(':scope > ul > li') as HTMLElement;
    expect(text(root.querySelector('a.id'))).toBe('COD-10');
    const kids = [...root.querySelectorAll(':scope > ul > li')];
    expect(kids.map((k) => text(k.querySelector('a.id')))).toEqual([
      'COD-11',
      'COD-12'
    ]);
    expect(text(root)).toContain('Tree COD-11');
  });

  it('shows the state as a chip coloured by its type, and an unknown one raw', () => {
    const c = mount([
      node('COD-10', { state: 'unstarted' }),
      node('COD-20', { state: 'started' }),
      node('COD-30', { state: 'weird' }),
      node('COD-40', { state: 'completed' }),
      node('COD-50', { state: 'canceled' }),
      node('COD-60', { state: 'backlog' }),
      node('COD-70', { state: 'triage' })
    ]);
    const chip = (kind: string) =>
      [...c.querySelectorAll(`.chip.${kind}`)].map(text);
    expect(chip('todo')).toEqual(['todo']);
    expect(chip('in-progress')).toEqual(['in progress']);
    expect(chip('done')).toEqual(['done']);
    expect(chip('canceled')).toEqual(['canceled']);
    expect(chip('backlog').filter((t) => t !== 'not queued')).toEqual([
      'backlog',
      'triage'
    ]);
    expect(text(c)).toContain('weird');
  });

  it('shows the pick position, or not queued for an open ticket without one', () => {
    const c = mount([
      node('COD-10', { position: 1 }),
      node('COD-20'),
      node('COD-30', { state: 'completed' })
    ]);
    expect([...c.querySelectorAll('.pos')].map(text)).toEqual(['#1']);
    expect([...c.querySelectorAll('.chip.backlog')].map(text)).toEqual([
      'not queued'
    ]);
  });

  it('shows a waiting chip for an open agent ticket the queue waits on', () => {
    const c = mount([
      node('COD-10', { label: 'agent:review', waiting: true }),
      node('COD-20')
    ]);
    expect([...c.querySelectorAll('.chip.backlog')].map(text)).toEqual([
      'waiting',
      'not queued'
    ]);
  });

  it('shows the agent label as a chip without its prefix', () => {
    const c = mount([node('COD-10', { label: 'agent:needs-input' })]);
    expect(c.querySelector('.chip.needs-input')?.textContent).toBe(
      'needs-input'
    );
  });

  it('links the PR, a blocker and a gap', () => {
    const c = mount([
      node('COD-10', {
        pr: 42,
        blockers: ['COD-9'],
        gaps: [{ kind: 'label-on-closed', candidate: false }]
      })
    ]);
    expect(c.querySelector('a.prn[href$="/pull/42"]')?.textContent).toBe('#42');
    expect(text(c.querySelector('.chip.blocked'))).toBe('blocked by COD-9');
    expect(
      c.querySelector('.chip.blocked a.id[href$="/issue/COD-9"]')
    ).not.toBeNull();
    expect(text(c.querySelector('.chip.conflict'))).toBe('label-on-closed');
  });

  it('falls back to the index title, and to none', () => {
    const c = mount([node('COD-1', { title: null })]);
    expect(text(c)).toContain('Title of COD-1');
    const none = mount([node('COD-404', { title: null })]);
    expect(text(none)).not.toContain('undefined');
  });

  it('notes a root whose children were cut short', () => {
    expect(text(mount([node('COD-10', { truncated: true })]))).toContain(
      'more sub-issues than the query reads'
    );
    expect(text(mount([node('COD-10')]))).not.toContain(
      'more sub-issues than the query reads'
    );
  });

  it('mutes a done or canceled child and not an open one', () => {
    const c = mount([
      node('COD-10', {
        children: [
          node('COD-11', { state: 'completed' }),
          node('COD-12', { state: 'canceled' }),
          node('COD-13', { state: 'started' })
        ]
      })
    ]);
    const muted = (id: string) =>
      c
        .querySelector(`a.id[href$="/issue/${id}"]`)
        ?.parentElement?.classList.contains('opacity-60');
    expect(muted('COD-11')).toBe(true);
    expect(muted('COD-12')).toBe(true);
    expect(muted('COD-13')).toBe(false);
    expect(muted('COD-10')).toBe(false);
  });

  it('says so with no tree, and always ends on the rule', () => {
    const state = createState();
    const c = render(
      <TreePage
        m={model(state, NOW)}
        details={state.details}
        now={NOW}
        filter={ALL}
        onFilter={vi.fn()}
        open={{}}
        onOpen={vi.fn()}
        onDesk={vi.fn()}
        onTicket={vi.fn()}
      />
    ).container;
    expect(text(c)).toContain('No open ticket.');
    expect(text(c)).toContain('Done ones for 14 days');
    expect(text(mount([node('COD-10')]))).toContain('Done ones for 14 days');
  });

  it('shows the plan progress only for a ticket with a plan', () => {
    const c = mountWith([node('COD-10'), node('COD-20')], {
      prepare: (s) =>
        s.details.set('COD-10', {
          steps: 7,
          done: 3,
          next: null,
          idea: null,
          blockedBy: [],
          pr: null,
          prAt: null
        })
    });
    expect(text(c)).toContain('plan 3/7');
    expect(c.textContent?.match(/plan \d/g)).toHaveLength(1);
  });

  it('shows a live session on the ticket it holds, with its host', () => {
    const session = { state: 'alive', ticket: 'COD-10', id: 's1' };
    const c = mountWith([node('COD-10'), node('COD-20')], {
      session,
      prepare: (s) => {
        s.data.sessions = [
          {
            id: 's1',
            host: 'mac',
            kind: 'attended',
            state: 'alive',
            detail: null,
            last_seen: NOW.toISOString()
          }
        ];
      }
    });
    const chips = [...c.querySelectorAll('.chip.working')];
    expect(chips.map(text)).toEqual(['session · mac']);
  });

  it('shows a session that waits, and none for another ticket or an ended one', () => {
    const waits = mountWith([node('COD-10')], {
      session: { state: 'waiting', ticket: 'COD-10' }
    });
    expect(text(waits.querySelector('.chip.needs-input'))).toBe('session');
    const other = mountWith([node('COD-10')], {
      session: { state: 'alive', ticket: 'COD-99' }
    });
    expect(other.querySelector('.chip.working')).toBeNull();
    const ended = mountWith([node('COD-10')], {
      session: { state: 'ended', ticket: 'COD-10' }
    });
    expect(text(ended)).not.toContain('session');
  });

  it.each([
    ['conflicts', { conflicting: true }, 'conflicts with main', 'review'],
    ['failing checks', { ci: 'FAILURE' }, 'checks failure', 'review'],
    ['open threads', { threads: 2 }, '2 unresolved threads', 'review'],
    ['all clear', {}, 'mergeable', 'ready']
  ])('shows the PR watch: %s', (_name, over, words, kind) => {
    const c = mountWith([node('COD-10', { pr: 42 })], {
      prepare: (s) => watching(s, over)
    });
    expect(text(c.querySelector(`.chip.${kind}`))).toBe(words);
  });

  it('shows no watch for a ticket without one, or for another PR', () => {
    const none = mountWith([node('COD-20', { pr: 42 })], {
      prepare: (s) => watching(s)
    });
    expect(none.querySelector('.chip.ready, .chip.review')).toBeNull();
    const other = mountWith([node('COD-10', { pr: 43 })], {
      prepare: (s) => watching(s)
    });
    expect(other.querySelector('.chip.ready, .chip.review')).toBeNull();
  });

  it('shows when the ticket was last updated, and nothing for one the desk lacks', () => {
    const c = mount([node('COD-1'), node('COD-404')]);
    expect(text(c)).toContain('updated 28 days ago');
    expect(c.textContent?.match(/updated /g)).toHaveLength(1);
  });

  it('lists the three toggles as one group, and calls back on a press', () => {
    const onFilter = vi.fn();
    const c = mountWith([node('COD-10')], {
      onFilter,
      filter: { closed: false, gaps: true, unqueued: false }
    });
    const buttons = [...c.querySelectorAll('.filters button')];
    expect(buttons.map(text)).toEqual(['Closed', 'Gaps', 'Not queued']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false'
    ]);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onFilter).toHaveBeenLastCalledWith({
      closed: true,
      gaps: true,
      unqueued: false
    });
    fireEvent.click(buttons[1] as HTMLElement);
    expect(onFilter).toHaveBeenLastCalledWith({
      closed: false,
      gaps: false,
      unqueued: false
    });
    fireEvent.click(buttons[2] as HTMLElement);
    expect(onFilter).toHaveBeenLastCalledWith({
      closed: false,
      gaps: true,
      unqueued: true
    });
  });

  it('collapses a finished root by default and expands an open one', () => {
    const kids = [node('COD-11', { state: 'completed' })];
    const c = mount([
      node('COD-10', { state: 'completed', children: kids }),
      node('COD-20', { children: [node('COD-21')] })
    ]);
    const toggle = (id: string) =>
      c.querySelector(`button[aria-controls="tree-${id}"]`) as HTMLElement;
    expect(toggle('COD-10').getAttribute('aria-expanded')).toBe('false');
    expect(toggle('COD-20').getAttribute('aria-expanded')).toBe('true');
    expect(c.querySelector('#tree-COD-10')?.hasAttribute('hidden')).toBe(true);
    expect(c.querySelector('#tree-COD-20')?.hasAttribute('hidden')).toBe(false);
  });

  it('takes the viewer’s choice over the default, and reports a toggle', () => {
    const onOpen = vi.fn();
    const c = mountWith(
      [
        node('COD-10', {
          state: 'completed',
          children: [node('COD-11', { state: 'completed' })]
        }),
        node('COD-20', { children: [node('COD-21')] })
      ],
      { open: { 'COD-10': true, 'COD-20': false }, onOpen }
    );
    const toggle = (id: string) =>
      c.querySelector(`button[aria-controls="tree-${id}"]`) as HTMLElement;
    expect(toggle('COD-10').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('COD-20').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle('COD-20'));
    expect(onOpen).toHaveBeenLastCalledWith('COD-20', true);
    fireEvent.click(toggle('COD-10'));
    expect(onOpen).toHaveBeenLastCalledWith('COD-10', false);
  });

  it('has no toggle on a root without children', () => {
    expect(
      mount([node('COD-10')]).querySelector('button[aria-expanded]')
    ).toBeNull();
  });

  it('summarises a collapsed root: the child count and its worst chip', () => {
    const c = mountWith(
      [
        node('COD-10', {
          children: [
            node('COD-11', {
              gaps: [{ kind: 'untouched', candidate: true }]
            }),
            node('COD-12', { gaps: [{ kind: 'stale', candidate: false }] })
          ]
        })
      ],
      { open: { 'COD-10': false } }
    );
    const row = c.querySelector('li > div') as HTMLElement;
    expect(text(row)).toContain('2');
    expect(text(row.querySelector('.chip.conflict'))).toBe('stale');
    expect(row.querySelector('.chip.held')).toBeNull();
  });

  it('shows a candidate gap as a soft chip', () => {
    const c = mount([
      node('COD-10', {
        gaps: [
          { kind: 'untouched', candidate: true },
          { kind: 'stale', candidate: false }
        ]
      })
    ]);
    expect(text(c.querySelector('.chip.held'))).toBe('untouched');
    expect(text(c.querySelector('.chip.conflict'))).toBe('stale');
  });

  it('lists the roots the filter keeps and says so when it keeps none', () => {
    const done = node('COD-10', { state: 'completed' });
    const c = mountWith([done], {
      filter: NO_TREE_FILTER
    });
    expect(ids(c)).toEqual([]);
    expect(text(c)).toContain('No ticket matches the filter.');
    expect(text(c)).toContain('Done ones for 14 days');
    expect(ids(mountWith([done], { filter: ALL }))).toEqual(['COD-10']);
  });
});
