import { describe, expect, it } from 'vitest';

import { model } from '../model';

import { NOW, filled, runs, view } from './fixtures';
import { platform } from './header';

describe('platform', () => {
  it('counts failing checks and run problems', () => {
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    const m = model(state, NOW);
    expect(platform(m).failing).toContain('scheduler silent 35 h');
  });
});
