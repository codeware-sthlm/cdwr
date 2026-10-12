import { describe, expect, it } from 'vitest';

import { pathProblem, sameFolders } from './delete-folder.logic';

describe('pathProblem', () => {
  it.each(['/tenants/moon', '/tenants/moon/apps/cms', '/apps/cms'])(
    'accepts %s',
    (path) => {
      expect(pathProblem(path)).toBeUndefined();
    }
  );

  it.each([
    ['/', 'end with /'],
    ['/apps', 'two levels'],
    ['/tenants', 'two levels'],
    ['', 'start with /'],
    ['tenants/moon', 'start with /'],
    ['/tenants/moon/', 'end with /'],
    ['/tenants/../apps', '..'],
    ['/tenants/moon/..', '..']
  ])('refuses %j', (path, reason) => {
    expect(pathProblem(path)).toContain(reason);
  });
});

describe('sameFolders', () => {
  const planned = [
    { path: '/tenants/moon', secrets: 1 },
    { path: '/tenants/moon/apps', secrets: 2 }
  ];

  it('is true for equal listings', () => {
    expect(
      sameFolders(
        planned,
        planned.map((f) => ({ ...f }))
      )
    ).toBe(true);
    expect(sameFolders([], [])).toBe(true);
  });

  it('is false when a count differs', () => {
    expect(
      sameFolders(planned, [planned[0]!, { ...planned[1]!, secrets: 3 }])
    ).toBe(false);
  });

  it('is false when a folder was added, removed or renamed', () => {
    expect(sameFolders(planned, planned.slice(0, 1))).toBe(false);
    expect(
      sameFolders(planned, [
        ...planned,
        { path: '/tenants/moon/x', secrets: 0 }
      ])
    ).toBe(false);
    expect(
      sameFolders(planned, [
        planned[0]!,
        { path: '/tenants/moon/b', secrets: 2 }
      ])
    ).toBe(false);
  });
});
