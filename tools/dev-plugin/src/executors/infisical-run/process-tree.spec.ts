// @vitest-environment node
import { descendants, parseProcessTable } from './process-tree';

describe('descendants', () => {
  it.each([
    { name: 'no children', pid: 1, table: [[2, 9]], expected: [] },
    { name: 'a unknown pid', pid: 42, table: [[2, 1]], expected: [] },
    {
      name: 'a chain, deepest first',
      pid: 1,
      table: [
        [2, 1],
        [3, 2],
        [4, 3]
      ],
      expected: [4, 3, 2]
    },
    {
      name: 'siblings and unrelated processes',
      pid: 10,
      table: [
        [11, 10],
        [12, 10],
        [13, 11],
        [20, 1]
      ],
      expected: [12, 13, 11]
    },
    {
      name: 'a cycle without looping',
      pid: 1,
      table: [
        [2, 1],
        [1, 2]
      ],
      expected: [2]
    }
  ] as const)('$name', ({ pid, table, expected }) => {
    expect(descendants(pid, table)).toEqual(expected);
  });
});

describe('parseProcessTable', () => {
  it('reads pid and ppid per line and skips noise', () => {
    expect(parseProcessTable('  1     0\n 20  1\n\nbad line\n')).toEqual([
      [1, 0],
      [20, 1]
    ]);
  });
});
