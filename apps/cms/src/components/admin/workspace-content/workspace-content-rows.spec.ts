import {
  workspaceListHref,
  workspaceSources,
  workspaceWhere
} from './workspace-content-rows';

describe('workspaceSources', () => {
  it('filters users through their membership and the rest on tenant', () => {
    expect(
      workspaceSources.map(({ collection, path }) => [collection, path])
    ).toEqual([
      ['users', 'tenants.tenant'],
      ['pages', 'tenant'],
      ['posts', 'tenant'],
      ['categories', 'tenant'],
      ['media', 'tenant']
    ]);
  });
});

describe('workspaceListHref', () => {
  it('builds the filtered list url', () => {
    expect(
      workspaceListHref({
        adminRoute: '/admin',
        collection: 'pages',
        path: 'tenant',
        tenantId: 7
      })
    ).toBe('/admin/collections/pages?where%5Btenant%5D%5Bequals%5D=7');
  });

  it('encodes the nested users path and honours a custom admin route', () => {
    expect(
      workspaceListHref({
        adminRoute: '/cms',
        collection: 'users',
        path: 'tenants.tenant',
        tenantId: 'abc'
      })
    ).toBe('/cms/collections/users?where%5Btenants.tenant%5D%5Bequals%5D=abc');
  });
});

describe('workspaceWhere', () => {
  it('matches the workspace on the given path', () => {
    expect(workspaceWhere('tenants.tenant', 3)).toEqual({
      'tenants.tenant': { equals: 3 }
    });
  });
});
