import { fakeRunner } from './fake-runner';
import { fetchVault } from './fetch-vault';

describe('fetchVault', () => {
  it('merges in discovery order, deeper path wins, and returns the paths', () => {
    const { run } = fakeRunner(
      { '/apps/cms': ['signature'], '/apps/cms/signature': [] },
      {
        '/apps/cms': { A: 'parent', B: 'parent' },
        '/apps/cms/signature': { B: 'child', C: 'child' }
      }
    );
    expect(fetchVault('/apps/cms', 'development', run)).toEqual({
      values: { A: 'parent', B: 'child', C: 'child' },
      paths: ['/apps/cms', '/apps/cms/signature']
    });
  });

  it('skips malformed entries and empty output', () => {
    const run = (args: string[]) =>
      args[0] === 'export'
        ? JSON.stringify([{ key: 'OK', value: 'v' }, { key: 1 }, null, 'x'])
        : '[]';
    expect(fetchVault('/a', 'development', run).values).toEqual({ OK: 'v' });
    expect(fetchVault('/a', 'development', () => '').values).toEqual({});
  });

  it('asks for json export', () => {
    const { run, calls } = fakeRunner({}, {});
    fetchVault('/apps/cms', 'development', run);
    expect(calls.find((c) => c[0] === 'export')).toEqual([
      'export',
      '--env=development',
      '--path=/apps/cms',
      '--format=json',
      '--silent'
    ]);
  });

  it('reads only the known paths without discovering', () => {
    const { run, calls } = fakeRunner(
      { '/apps/cms': ['signature'] },
      { '/apps/cms': { A: '1' } }
    );
    expect(fetchVault('/apps/cms', 'development', run, ['/apps/cms'])).toEqual({
      values: { A: '1' },
      paths: ['/apps/cms']
    });
    expect(calls.every((call) => call[0] === 'export')).toBe(true);
  });

  it('fails on output that is not JSON without echoing it', () => {
    const run = (args: string[]) =>
      args[0] === 'export' ? 'SECRET-SENTINEL not json' : '[]';
    let thrown: unknown;
    try {
      fetchVault('/apps/cms', 'development', run);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe(
      'infisical returned output that is not JSON (export of /apps/cms)'
    );
    expect((thrown as Error).cause).toBeUndefined();
  });
});
