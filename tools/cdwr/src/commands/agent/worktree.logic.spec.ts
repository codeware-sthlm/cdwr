import {
  type Candidate,
  isTicket,
  isTicketWorktree,
  orphanDaemons,
  parsePrHead,
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

describe('orphanDaemons', () => {
  const nx = (dir: string) =>
    `/usr/bin/node ${dir}/node_modules/.pnpm/nx@22.0.0/node_modules/nx/src/daemon/server/start.js`;
  const existing = ['/w/codeware', '/w/codeware-cod-2'];

  it('finds the daemon of a worktree that is gone, with leading spaces', () => {
    const ps = `  101 ${nx('/w/codeware-cod-1')}\n12345 ${nx('/w/codeware-cod-1')}\n`;
    expect(orphanDaemons(ps, existing, '/w')).toEqual([
      { pid: 101, path: '/w/codeware-cod-1' },
      { pid: 12345, path: '/w/codeware-cod-1' }
    ]);
  });

  it('finds the plugin worker of a gone worktree', () => {
    const ps = ` 7 node /w/codeware-cod-1/node_modules/nx/src/project-graph/plugins/isolation/plugin-worker.js`;
    expect(orphanDaemons(ps, existing, '/w')).toEqual([
      { pid: 7, path: '/w/codeware-cod-1' }
    ]);
  });

  it('ignores the daemon of an existing worktree and of the main checkout', () => {
    const ps = ` 1 ${nx('/w/codeware-cod-2')}\n 2 ${nx('/w/codeware')}\n`;
    expect(orphanDaemons(ps, existing, '/w')).toEqual([]);
  });

  it('ignores a checkout that is not a ticket one or lies elsewhere', () => {
    const ps = ` 1 ${nx('/w/codeware-agent')}\n 2 ${nx('/other/codeware-cod-9')}\n`;
    expect(orphanDaemons(ps, existing, '/w')).toEqual([]);
  });

  it('ignores other node processes', () => {
    const ps = ` 1 node /w/codeware-cod-1/node_modules/.bin/vite\n 2 -zsh\n\n`;
    expect(orphanDaemons(ps, existing, '/w')).toEqual([]);
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

describe('parsePrHead', () => {
  it.each([
    ['[{"state":"MERGED","headRefOid":"abc"}]', 'abc'],
    ['[{"state":"MERGED","headRefOid":""}]', undefined],
    ['[{"state":"MERGED"}]', undefined],
    ['[]', undefined],
    ['not json', undefined]
  ])('%s -> %s', (text, expected) => {
    expect(parsePrHead(text)).toBe(expected);
  });
});

describe('pruneVerdict', () => {
  const base: Candidate = {
    path: '/w/codeware-cod-1',
    branch: 'b',
    missing: false,
    dirty: false,
    tipIsPrHead: true
  };
  it.each([
    [{ pr: 'MERGED' as const }, 'remove', true],
    [{ pr: 'CLOSED' as const }, 'remove', false],
    [{ pr: 'OPEN' as const }, 'keep', undefined],
    [{}, 'keep', undefined],
    [{ pr: 'MERGED' as const, dirty: true }, 'keep', undefined],
    [{ pr: 'MERGED' as const, branch: undefined }, 'keep', undefined],
    [{ pr: 'MERGED' as const, missing: true }, 'keep', undefined],
    [{ pr: 'MERGED' as const, tipIsPrHead: false }, 'remove', false]
  ])('%j -> %s', (patch, action, deleteBranch) => {
    const verdict = pruneVerdict({ ...base, ...patch });
    expect(verdict.action).toBe(action);
    if (verdict.action === 'remove') {
      expect(verdict.deleteBranch).toBe(deleteBranch);
    }
    expect(verdict.reason).not.toBe('');
  });
});
