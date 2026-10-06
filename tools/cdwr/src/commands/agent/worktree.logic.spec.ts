import {
  type Candidate,
  isTicket,
  isTicketWorktree,
  parsePrState,
  parseWorktreeList,
  pruneVerdict,
  worktreePath
} from './worktree.logic';

describe('isTicket', () => {
  it.each([
    ['COD-529', true],
    ['cod-1', true],
    ['COD-', false],
    ['COD-12a', false],
    ['ABC-12', false],
    ['COD-12 ', false]
  ])('%s -> %s', (value, expected) => {
    expect(isTicket(value)).toBe(expected);
  });
});

describe('worktreePath', () => {
  it.each([
    ['/w/codeware-queue', 'COD-529', '/w/codeware-cod-529'],
    ['/w/codeware-cod-1', 'cod-2', '/w/codeware-cod-2']
  ])('%s + %s -> %s', (root, ticket, expected) => {
    expect(worktreePath(root, ticket)).toBe(expected);
  });
});

describe('isTicketWorktree', () => {
  it.each([
    ['/w/codeware-cod-529', true],
    ['/w/codeware-agent', false],
    ['/w/codeware-queue', false],
    ['/w/codeware-cod-529-old', false],
    ['/w/codeware', false]
  ])('%s -> %s', (path, expected) => {
    expect(isTicketWorktree(path)).toBe(expected);
  });
});

describe('parseWorktreeList', () => {
  it('reads paths and branches, detached entries have none', () => {
    const text = `worktree /w/codeware
HEAD abc
branch refs/heads/main

worktree /w/codeware-agent
HEAD def
detached

worktree /w/codeware-cod-529
HEAD 123
branch refs/heads/cod-529-keep-going/x
`;
    expect(parseWorktreeList(text)).toEqual([
      { path: '/w/codeware', branch: 'main' },
      { path: '/w/codeware-agent', branch: undefined },
      { path: '/w/codeware-cod-529', branch: 'cod-529-keep-going/x' }
    ]);
  });

  it('is empty for empty output', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('parsePrState', () => {
  it.each([
    ['[{"number":1,"state":"MERGED"}]', 'MERGED'],
    ['[{"number":1,"state":"OPEN"}]', 'OPEN'],
    ['[{"number":1,"state":"CLOSED"}]', 'CLOSED'],
    ['[]', undefined],
    ['not json', undefined],
    ['[{"number":1,"state":"DRAFT"}]', undefined]
  ])('%s -> %s', (text, expected) => {
    expect(parsePrState(text)).toBe(expected);
  });
});

describe('pruneVerdict', () => {
  const base: Candidate = {
    path: '/w/codeware-cod-1',
    branch: 'b',
    missing: false,
    dirty: false
  };
  it.each([
    [{ pr: 'MERGED' as const }, 'remove', true],
    [{ pr: 'CLOSED' as const }, 'remove', false],
    [{ pr: 'OPEN' as const }, 'keep', undefined],
    [{}, 'keep', undefined],
    [{ pr: 'MERGED' as const, dirty: true }, 'keep', undefined],
    [{ pr: 'MERGED' as const, branch: undefined }, 'keep', undefined],
    [{ pr: 'MERGED' as const, missing: true }, 'keep', undefined]
  ])('%j -> %s', (patch, action, deleteBranch) => {
    const verdict = pruneVerdict({ ...base, ...patch });
    expect(verdict.action).toBe(action);
    if (verdict.action === 'remove') {
      expect(verdict.deleteBranch).toBe(deleteBranch);
    }
    expect(verdict.reason).not.toBe('');
  });
});
