import { describe, expect, it } from 'vitest';

import {
  RETRY_MS,
  parseRecord,
  refreshPending,
  shouldRefresh
} from './completion-check.mjs';

const record = { root: '/code/cdwr', tree: 'abc123' };

describe('parseRecord', () => {
  it('keeps the root and tree', () => {
    expect(
      parseRecord(JSON.stringify({ shell: 'zsh', file: '/f', ...record }))
    ).toEqual(record);
  });

  // The same record the refresh rejects, or the shim would start it on every run
  it.each([
    'nope',
    '{}',
    JSON.stringify({ shell: 'zsh', file: '/f', root: '/code/cdwr' }),
    JSON.stringify({ shell: 'csh', file: '/f', ...record }),
    JSON.stringify({ shell: 'zsh', ...record })
  ])('ignores %s', (text) => {
    expect(parseRecord(text)).toBeUndefined();
  });
});

describe('shouldRefresh', () => {
  it('renders once the linked checkout has a new tree', () => {
    expect(shouldRefresh(record, '/code/cdwr', 'def456')).toBe(true);
  });

  it('renders when setup ran outside git', () => {
    expect(
      shouldRefresh({ ...record, tree: null }, '/code/cdwr', 'def456')
    ).toBe(true);
  });

  it('leaves an unchanged tree alone', () => {
    expect(shouldRefresh(record, '/code/cdwr', 'abc123')).toBe(false);
  });

  it('leaves it to the recorded checkout', () => {
    expect(shouldRefresh(record, '/code/worktree', 'def456')).toBe(false);
  });

  it('does nothing without a record or a tree', () => {
    expect(shouldRefresh(undefined, '/code/cdwr', 'def456')).toBe(false);
    expect(shouldRefresh(record, '/code/cdwr', undefined)).toBe(false);
  });
});

describe('refreshPending', () => {
  it('holds off while a started refresh is recent', () => {
    expect(refreshPending(1000, 1000 + RETRY_MS - 1)).toBe(true);
  });

  it('tries again once the wait is over', () => {
    expect(refreshPending(1000, 1000 + RETRY_MS)).toBe(false);
  });

  it('starts at once without a marker', () => {
    expect(refreshPending(undefined, 1000)).toBe(false);
  });
});
