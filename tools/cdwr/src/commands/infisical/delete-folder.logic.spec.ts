import { describe, expect, it } from 'vitest';

import { pathProblem } from './delete-folder.logic';

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
