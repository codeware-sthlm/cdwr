import { readSharedValue } from './read-shared-value';

const SENTINEL = 'SENTINEL-SECRET-VALUE';

const exporting = (entries: unknown[]) => {
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    return JSON.stringify(entries);
  };
  return { run, calls };
};

const target = { path: '/agent-queue', environment: 'prod', key: 'A' };

describe('readSharedValue', () => {
  it('returns the shared value, never a personal override', () => {
    const { run } = exporting([
      { key: 'A', value: 'mine', type: 'personal' },
      { key: 'A', value: 'shared', type: 'shared' }
    ]);
    expect(readSharedValue(target, run)).toBe('shared');
  });

  it('is undefined for a missing key or a personal one only', () => {
    expect(readSharedValue(target, exporting([]).run)).toBeUndefined();
    const { run } = exporting([{ key: 'A', value: 'mine', type: 'personal' }]);
    expect(readSharedValue(target, run)).toBeUndefined();
  });

  it('skips imports and targets the project', () => {
    const { run, calls } = exporting([]);
    readSharedValue({ ...target, projectId: 'proj-1' }, run);
    expect(calls[0]).toEqual([
      'export',
      '--env=prod',
      '--path=/agent-queue',
      '--format=json',
      '--silent',
      '--include-imports=false',
      '--projectId=proj-1'
    ]);
  });

  it('leaks no output from a failing runner', () => {
    const run = () => {
      throw Object.assign(new Error(`failed ${SENTINEL}`), {
        stdout: SENTINEL
      });
    };
    expect(() => readSharedValue(target, run)).toThrow(
      /^infisical export failed reading A at \/agent-queue \(prod\)$/
    );
  });
});
