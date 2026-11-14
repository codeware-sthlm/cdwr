// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { type DeskState, type TreeFilter, createState } from '../state';
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
  blockers: [],
  gaps: [],
  children: [],
  ...over
});

const ALL: TreeFilter = { scope: 'all', gaps: false };

/** The page over `tree`; `prepare` adjusts the state (details, session, watches) first */
const mountWith = (
  tree: QueueTreeNode[],
  {
    onDesk = vi.fn(),
    onFilter = vi.fn(),
    filter = ALL,
    session = { state: 'none' },
    prepare = () => undefined
  }: {
    onDesk?: () => void;
    onFilter?: (filter: TreeFilter) => void;
    filter?: TreeFilter;
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
      onDesk={onDesk}
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
    expect(text(c)).toContain('every agent ticket where it sits in its split');
  });

  it('goes back to the desk from the back button', () => {
    const onDesk = vi.fn();
    const c = mount([node('COD-10')], onDesk);
    fireEvent.click(c.querySelector('button[data-view="desk"]') as HTMLElement);
    expect(onDesk).toHaveBeenCalledOnce();
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

  it('names the state, and shows an unknown one raw', () => {
    const c = mount([
      node('COD-10', { state: 'unstarted' }),
      node('COD-20', { state: 'started' }),
      node('COD-30', { state: 'weird' })
    ]);
    const t = text(c);
    expect(t).toContain('todo');
    expect(t).toContain('in progress');
    expect(t).toContain('weird');
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
        gaps: ['label-on-closed']
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
        onDesk={vi.fn()}
      />
    ).container;
    expect(text(c)).toContain('No agent ticket in flight.');
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

  it('lists the filters with the current ones pressed, and calls back on a press', () => {
    const onFilter = vi.fn();
    const c = mountWith([node('COD-10')], {
      onFilter,
      filter: { scope: 'open', gaps: false }
    });
    const pressed = (sel: string) =>
      c.querySelector(sel)?.getAttribute('aria-pressed');
    expect(pressed('[data-scope="open"]')).toBe('true');
    expect(pressed('[data-scope="all"]')).toBe('false');
    expect(pressed('[data-gaps]')).toBe('false');
    fireEvent.click(c.querySelector('[data-scope="all"]') as HTMLElement);
    expect(onFilter).toHaveBeenLastCalledWith({ scope: 'all', gaps: false });
    fireEvent.click(c.querySelector('[data-gaps]') as HTMLElement);
    expect(onFilter).toHaveBeenLastCalledWith({ scope: 'open', gaps: true });
  });

  it('lists the roots the filter keeps and says so when it keeps none', () => {
    const done = node('COD-10', { state: 'completed' });
    const c = mountWith([done], {
      filter: { scope: 'open', gaps: false }
    });
    expect(ids(c)).toEqual([]);
    expect(text(c)).toContain('No ticket matches the filter.');
    expect(text(c)).toContain('Done ones for 14 days');
    expect(ids(mountWith([done], { filter: ALL }))).toEqual(['COD-10']);
  });
});
