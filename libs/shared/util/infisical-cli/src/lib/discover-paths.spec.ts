import { discoverPaths } from './discover-paths';
import { fakeRunner } from './fake-runner';

describe('discoverPaths', () => {
  it('lists parent first, depth-first', () => {
    const { run } = fakeRunner(
      {
        '/apps/cms': ['api-url', 'signature'],
        '/apps/cms/api-url': ['deep'],
        '/apps/cms/api-url/deep': [],
        '/apps/cms/signature': []
      },
      {}
    );
    expect(discoverPaths('/apps/cms', 'development', run)).toEqual([
      '/apps/cms',
      '/apps/cms/api-url',
      '/apps/cms/api-url/deep',
      '/apps/cms/signature'
    ]);
  });

  it.each([
    ['an empty array', []],
    ['null', null]
  ])('handles %s', (_, listing) => {
    const { run } = fakeRunner({ '/apps/web': listing }, {});
    expect(discoverPaths('/apps/web', 'development', run)).toEqual([
      '/apps/web'
    ]);
  });

  it('handles an empty stdout', () => {
    expect(discoverPaths('/a', 'development', () => '')).toEqual(['/a']);
  });

  it('does not double the slash from the root', () => {
    const { run } = fakeRunner({ '/': ['apps'], '/apps': [] }, {});
    expect(discoverPaths('/', 'development', run)).toEqual(['/', '/apps']);
  });

  it('asks for json in the given environment', () => {
    const { run, calls } = fakeRunner({}, {});
    discoverPaths('/apps/cms', 'staging', run);
    expect(calls[0]).toEqual([
      'secrets',
      'folders',
      'get',
      '--path=/apps/cms',
      '--env=staging',
      '-o',
      'json',
      '--silent'
    ]);
  });
});

describe('discoverPaths with output that is not JSON', () => {
  it('fails without echoing the output', () => {
    const run = () => 'SECRET-SENTINEL not json';
    let thrown: unknown;
    try {
      discoverPaths('/apps/cms', 'development', run);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      'infisical returned output that is not JSON (folders of /apps/cms)'
    );
    expect((thrown as Error).cause).toBeUndefined();
  });
});

describe('discoverPaths with a project', () => {
  it('passes projectId to every folder listing', () => {
    const { run, calls } = fakeRunner(
      { '/apps/cms': ['signature'], '/apps/cms/signature': [] },
      {}
    );
    discoverPaths('/apps/cms', 'development', run, 'proj-1');
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call).toContain('--projectId=proj-1');
  });

  it('adds no projectId by default', () => {
    const { run, calls } = fakeRunner({ '/a': [] }, {});
    discoverPaths('/a', 'development', run);
    expect(calls[0]?.some((arg) => arg.startsWith('--projectId'))).toBe(false);
  });
});
