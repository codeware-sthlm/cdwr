import { readKeyLengths } from './read-key-lengths';

const SENTINEL = 'SENTINEL-SECRET-VALUE';

const exporting = (entries: unknown[]) => {
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    return JSON.stringify(entries);
  };
  return { run, calls };
};

describe('readKeyLengths', () => {
  it('returns the length of each shared value', () => {
    const { run } = exporting([
      { key: 'A', value: 'abc', type: 'shared' },
      { key: 'B', value: 'abcdef', type: 'shared' }
    ]);
    expect(readKeyLengths('/apps/cms', 'prod', run)).toEqual([
      { key: 'A', length: 3 },
      { key: 'B', length: 6 }
    ]);
  });

  it('drops malformed entries', () => {
    const { run } = exporting([
      { key: 'A', value: 'abc', type: 'shared' },
      { key: 'N', value: 1, type: 'shared' },
      null
    ]);
    expect(readKeyLengths('/a', 'prod', run)).toEqual([
      { key: 'A', length: 3 }
    ]);
  });

  it('uses the shared length when a personal override has the same key', () => {
    const { run } = exporting([
      { key: 'A', value: 'mine-is-longer', type: 'personal' },
      { key: 'A', value: 'abc', type: 'shared' }
    ]);
    expect(readKeyLengths('/a', 'prod', run)).toEqual([
      { key: 'A', length: 3 }
    ]);
  });

  it('has no length for a key that only came back as personal', () => {
    const { run } = exporting([{ key: 'P', value: 'mine', type: 'personal' }]);
    expect(readKeyLengths('/a', 'prod', run)).toEqual([
      { key: 'P', length: null }
    ]);
  });

  it('counts an empty value as length 0', () => {
    const { run } = exporting([{ key: 'E', value: '', type: 'shared' }]);
    expect(readKeyLengths('/a', 'prod', run)).toEqual([
      { key: 'E', length: 0 }
    ]);
  });

  it('skips imports and targets the project', () => {
    const { run, calls } = exporting([]);
    readKeyLengths('/apps/cms', 'prod', run, 'proj-1');
    expect(calls[0]).toEqual([
      'export',
      '--env=prod',
      '--path=/apps/cms',
      '--format=json',
      '--silent',
      '--include-imports=false',
      '--projectId=proj-1'
    ]);
  });

  it('omits projectId when not given', () => {
    const { run, calls } = exporting([]);
    readKeyLengths('/a', 'prod', run);
    expect(calls[0]?.some((arg) => arg.startsWith('--projectId'))).toBe(false);
  });

  it('returns only the key and the length, never the value', () => {
    const { run } = exporting([{ key: 'A', value: SENTINEL, type: 'shared' }]);
    const [entry] = readKeyLengths('/a', 'prod', run);
    expect(Object.keys(entry ?? {}).sort()).toEqual(['key', 'length']);
    expect(JSON.stringify(entry)).not.toContain(SENTINEL);
  });

  it('leaks no output from a failing runner', () => {
    const run = () => {
      throw Object.assign(new Error(`failed ${SENTINEL}`), {
        stdout: SENTINEL,
        stderr: SENTINEL
      });
    };
    let thrown: unknown;
    try {
      readKeyLengths('/apps/cms', 'prod', run);
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof Error)) throw new Error('did not throw');
    const error = thrown;
    expect(error.message).toBe('infisical export failed for /apps/cms (prod)');
    expect(String(error)).not.toContain(SENTINEL);
    expect(JSON.stringify(error)).not.toContain(SENTINEL);
    expect(error.cause).toBeUndefined();
  });
});
