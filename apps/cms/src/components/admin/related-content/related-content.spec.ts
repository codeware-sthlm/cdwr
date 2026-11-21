import {
  readRelatedContent,
  relatedListHref,
  relatedWhere,
  relatedWorkspaceId,
  workspaceSources
} from './related-content';

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

describe('readRelatedContent', () => {
  it('reads the config under its key', () => {
    const config = {
      description: 'relatedContent:tagDescription',
      sources: [{ collection: 'media', path: 'tags' }],
      workspace: 'tenant'
    } as const;
    expect(readRelatedContent({ relatedContent: config })).toBe(config);
  });

  it('is undefined for a collection without one', () => {
    expect(readRelatedContent(undefined)).toBeUndefined();
    expect(readRelatedContent({})).toBeUndefined();
  });
});

describe('relatedWorkspaceId', () => {
  it('takes the document itself for a workspace', () => {
    expect(relatedWorkspaceId({ id: 4, tenant: 9 }, 'self')).toBe(4);
  });

  it('takes the tenant a document belongs to, populated or not', () => {
    expect(relatedWorkspaceId({ id: 4, tenant: 9 }, 'tenant')).toBe(9);
    expect(relatedWorkspaceId({ id: 4, tenant: { id: 'abc' } }, 'tenant')).toBe(
      'abc'
    );
  });

  it('is undefined without one', () => {
    expect(relatedWorkspaceId({ id: 4 }, 'tenant')).toBeUndefined();
    expect(
      relatedWorkspaceId({ id: 4, tenant: null }, 'tenant')
    ).toBeUndefined();
    expect(relatedWorkspaceId(undefined, 'self')).toBeUndefined();
  });
});

describe('relatedListHref', () => {
  it('builds the filtered list url', () => {
    expect(
      relatedListHref({
        adminRoute: '/admin',
        collection: 'pages',
        path: 'tenant',
        docId: 7
      })
    ).toBe('/admin/collections/pages?where%5Btenant%5D%5Bequals%5D=7');
  });

  it('encodes the nested users path and honours a custom admin route', () => {
    expect(
      relatedListHref({
        adminRoute: '/cms',
        collection: 'users',
        path: 'tenants.tenant',
        docId: 'abc'
      })
    ).toBe('/cms/collections/users?where%5Btenants.tenant%5D%5Bequals%5D=abc');
  });
});

describe('relatedWhere', () => {
  it('matches the document on the given path', () => {
    expect(relatedWhere('tenants.tenant', 3)).toEqual({
      'tenants.tenant': { equals: 3 }
    });
  });
});
