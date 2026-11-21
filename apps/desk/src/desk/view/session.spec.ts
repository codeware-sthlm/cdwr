import { describe, expect, it } from 'vitest';

import { model } from '../model';
import type { SessionState } from '../types';

import { NOW, filled, runs, view } from './fixtures';
import { headline } from './session';

const withPr = (pr: number | null) => ({
  steps: 0,
  done: 0,
  next: null,
  idea: null,
  blockedBy: [],
  pr,
  prAt: null
});

describe('headline', () => {
  it('counts the wait rows and names the first in the idle headline, hand-offs included', () => {
    const state = filled();
    state.data.runs = runs(
      view({
        next: [],
        table: {
          before: [],
          label: [],
          after: [{ ticket: 'COD-5', kind: 'handoffs', items: ['a'] }]
        }
      })
    );
    state.data.ideas = [];
    const h = headline(model(state, NOW), state.details, NOW);
    expect(h.text).toEqual([
      'Nothing for the agent. 1 thing waits on you',
      ', starting with ',
      { id: 'COD-5' },
      '.'
    ]);
    expect(h.tone).toBe('wait');
  });

  it('puts the PR in the takes-next headline', () => {
    const session: SessionState = {
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:30'
    };
    const state = filled(session);
    state.data.runs = runs(
      view({
        session,
        next: [
          { ticket: 'COD-1', reason: 'ready' },
          { ticket: 'COD-2', reason: 'answered' }
        ]
      })
    );
    state.details.set('COD-1', withPr(31));
    state.details.set('COD-2', withPr(32));
    const { text } = headline(
      model(filled({ state: 'alive', detail: 'working' }), NOW),
      state.details,
      NOW
    );
    expect(text).toContainEqual(expect.objectContaining({ prn: 31 }));
  });
});
