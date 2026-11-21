import { describe, expect, it } from 'vitest';

import {
  NOW as TENANTS_NOW,
  flyApp,
  minutesAgo,
  payload,
  tenant
} from '../../tenants/fixtures';
import { tenantsView } from '../../tenants/status';
import { model } from '../model';
import { createState } from '../state';

import { NOW, filled, runs, view } from './fixtures';
import { agentCount, health, platformCount } from './header';

describe('health', () => {
  it('counts failing checks and run problems', () => {
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    const m = model(state, NOW);
    expect(health(m).failing).toContain('scheduler silent 35 h');
  });
});

describe('agentCount', () => {
  it('is null until the runs have loaded', () => {
    const state = createState();
    expect(agentCount(model(state, NOW), state.details, NOW)).toBeNull();
  });

  it('counts the rows the Waiting on you card counts', () => {
    const state = filled();
    state.data.ideas = [];
    state.data.runs = runs(
      view({
        table: {
          before: [
            { ticket: 'COD-10', kind: 'plan' },
            { ticket: 'COD-11', kind: 'plan' },
            { ticket: 'COD-12', kind: 'plan' }
          ],
          label: [],
          after: []
        }
      })
    );
    expect(agentCount(model(state, NOW), state.details, NOW)).toBe(3);
  });

  it('is 0 with nothing waiting', () => {
    const state = filled();
    state.data.ideas = [];
    state.data.runs = runs(
      view({ table: { before: [], label: [], after: [] } })
    );
    expect(agentCount(model(state, NOW), state.details, NOW)).toBe(0);
  });
});

describe('platformCount', () => {
  const down = () =>
    payload([
      tenant('zed', {
        apps: [
          flyApp('cdwr-headless-zed', 'headless', {
            health: { ok: false, status: 503, ms: 80 }
          })
        ]
      })
    ]);

  it('is null before the data arrives, and says whether it is empty', () => {
    expect(platformCount(null, TENANTS_NOW)).toEqual({
      count: null,
      stale: false,
      empty: false
    });
    expect(platformCount(payload([]), TENANTS_NOW)).toEqual({
      count: null,
      stale: false,
      empty: true
    });
  });

  it('counts the open problems', () => {
    const data = down();
    const expected = tenantsView(data, TENANTS_NOW);
    if (expected.kind !== 'ready') throw new Error('not ready');
    expect(expected.problems.length).toBeGreaterThan(0);
    expect(platformCount(data, TENANTS_NOW)).toEqual({
      count: expected.problems.length,
      stale: false,
      empty: false
    });
  });

  it('is 0 and fresh for healthy tenants, and flags data the NUC stopped writing', () => {
    expect(platformCount(payload([tenant('acme')]), TENANTS_NOW)).toMatchObject(
      { count: 0, stale: false }
    );
    expect(
      platformCount(
        payload([tenant('acme', { at: minutesAgo(40) })]),
        TENANTS_NOW
      )
    ).toMatchObject({ stale: true });
  });
});
