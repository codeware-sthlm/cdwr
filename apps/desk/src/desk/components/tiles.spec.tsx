// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { NOW, filled, planSample, runs, view } from '../render/fixtures';
import { type DeskState, createState } from '../state';

import { Tiles } from './tiles';

const mount = (s: DeskState, onSheet = vi.fn()) => {
  const { container } = render(
    <Tiles m={model(s, NOW)} state={s} now={NOW} onSheet={onSheet} />
  );
  const tile = (id: string) =>
    container.querySelector<HTMLElement>(`button[data-w="${id}"]`);
  const value = (id: string) => tile(id)?.querySelector('b.v')?.textContent;
  return { container, onSheet, tile, value };
};

describe('Tiles', () => {
  it('gives every tile a sheet, with the plan and timers among them and no interim row', () => {
    const t = mount(filled());
    expect(t.container.querySelector('h2')?.textContent).toBe(
      'Everything else'
    );
    const ids = Array.from(
      t.container.querySelectorAll('button[data-w]'),
      (b) => b.getAttribute('data-w')
    );
    expect(ids).toEqual([
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
    ]);
    // The limit and the NUC moved to the Capacity row
    expect(t.tile('limit')).toBeNull();
    expect(t.tile('nuc')).toBeNull();
    expect(t.container.textContent).not.toContain('Until the Platform view');
    expect(t.container.querySelector('.tiles.small')).toBeNull();
    for (const b of t.container.querySelectorAll('button[data-w]'))
      expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    expect(t.tile('next')?.querySelector('.ico svg')).not.toBeNull();
  });

  it('shows the value and sub-line of each of the ten tiles', () => {
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
    const t = mount(state);
    const tile = (id: string, value: string, sub: string) => {
      expect(t.value(id)).toBe(value);
      expect(t.tile(id)?.querySelector('span.s')?.textContent).toBe(sub);
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
    expect(t.tile('next')?.className).toBe('tile');
  });

  it('omits the sub-line of a tile that has none, and shows dashes before the runs', () => {
    const t = mount(createState());
    expect(t.value('next')).toBe('–');
    expect(t.tile('next')?.querySelector('.s')).toBeNull();
  });

  it('marks the review tile bad when checks failed, and the runs tile bad on a failure', () => {
    const state = filled();
    state.data.githubEvents = [
      {
        pr: 7,
        subject: 'x',
        action: 'check_suite:failure',
        updated_at: new Date('2026-10-29T11:59:00').toISOString()
      } as never
    ];
    const bad = mount(state);
    expect(bad.tile('review')?.className).toBe('tile bad');
    expect(bad.tile('runs')?.className).toBe('tile bad');

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
    const ok = mount(state);
    expect(ok.tile('review')?.className).toBe('tile');
    expect(ok.tile('review')?.textContent).toContain('1 await you · live');
    expect(ok.tile('runs')?.className).toBe('tile');
    expect(ok.tile('runs')?.textContent).toContain('median – · 0 failed');
  });

  it('shows the plan tile as both used shares', () => {
    expect(mount(filled()).value('plan')).toBe('5h 30% · 7d 18%');
  });

  it('shows a reset or missing plan window as a dash, and no data at all as one', () => {
    const reset = filled();
    reset.data.planUsage = [
      planSample('five_hour', -1, 90, 200),
      planSample('seven_day', 100, 18)
    ];
    expect(mount(reset).value('plan')).toBe('5h – · 7d 18%');
    const none = filled();
    none.data.planUsage = [];
    expect(mount(none).value('plan')).toBe('5h – · 7d –');
  });

  it('appends the age to a stale plan tile', () => {
    const state = filled();
    state.data.planUsage = [
      planSample('five_hour', 2, 30, 180),
      planSample('seven_day', 100, 18, 90)
    ];
    expect(mount(state).value('plan')).toBe('5h 30% · 7d 18% · 3 h ago');
  });

  it('marks the plan tile bad when a window will run out before its reset', () => {
    const state = filled();
    state.data.planUsage = [
      planSample('five_hour', 2, 70),
      planSample('seven_day', 100, 18)
    ];
    expect(mount(state).tile('plan')?.className).toBe('tile bad');
  });

  it('opens the sheet of the tile clicked', () => {
    const t = mount(filled());
    fireEvent.click(t.tile('plan') as HTMLElement);
    expect(t.onSheet).toHaveBeenLastCalledWith('plan');
    fireEvent.click(t.tile('ideas') as HTMLElement);
    expect(t.onSheet).toHaveBeenLastCalledWith('ideas');
    expect(t.onSheet).toHaveBeenCalledTimes(2);
  });
});
