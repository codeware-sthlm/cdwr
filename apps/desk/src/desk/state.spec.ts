import { describe, expect, it } from 'vitest';

import { NO_TREE_FILTER, treeFilterOf, viewOf } from './state';

describe('viewOf', () => {
  it('names Platform from its hash, and from the old tenants link', () => {
    expect(viewOf('platform')).toBe('platform');
    expect(viewOf('tenants')).toBe('platform');
  });

  it('names Agent health from its hash, and from the old nuc link', () => {
    expect(viewOf('health')).toBe('health');
    expect(viewOf('nuc')).toBe('health');
  });

  it('names the tree, and nothing for anything else, which opens Agent', () => {
    expect(viewOf('tree')).toBe('tree');
    expect(viewOf('agent')).toBeNull();
    expect(viewOf('scheduler')).toBeNull();
    expect(viewOf('')).toBeNull();
    expect(viewOf(null)).toBeNull();
  });
});

describe('treeFilterOf', () => {
  it('reads the current shape', () => {
    const f = { closed: true, gaps: false, unqueued: true };
    expect(treeFilterOf(f)).toEqual(f);
  });

  it('migrates the old shape: All becomes Closed, Open nothing', () => {
    expect(treeFilterOf({ scope: 'all', gaps: true })).toEqual({
      closed: true,
      gaps: true,
      unqueued: false
    });
    expect(treeFilterOf({ scope: 'open', gaps: false })).toEqual(
      NO_TREE_FILTER
    );
  });

  it.each([
    null,
    'open',
    {},
    { scope: 'weird', gaps: true },
    { closed: true, gaps: true },
    { closed: 1, gaps: true, unqueued: false }
  ])('rejects %j', (value) => {
    expect(treeFilterOf(value)).toBeNull();
  });
});
