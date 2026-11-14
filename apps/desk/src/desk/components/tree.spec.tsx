// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { createState } from '../state';
import type { QueueTreeNode } from '../types';
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

const mount = (tree: QueueTreeNode[], onDesk = vi.fn()): HTMLElement => {
  const state = filled();
  state.data.runs = runs(view({ tree }));
  return render(
    <TreePage m={model(state, NOW)} details={state.details} onDesk={onDesk} />
  ).container;
};

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
        onDesk={vi.fn()}
      />
    ).container;
    expect(text(c)).toContain('No agent ticket in flight.');
    expect(text(c)).toContain('Done ones for 14 days');
    expect(text(mount([node('COD-10')]))).toContain('Done ones for 14 days');
  });
});
