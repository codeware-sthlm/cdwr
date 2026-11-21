import { exportShared } from './export-shared';
import { InfisicalMissingError } from './infisical-runner';

const target = { path: '/apps/cms', environment: 'prod' };

describe('exportShared', () => {
  it('keeps the shared value and marks a personal-only key null', () => {
    const run = () =>
      JSON.stringify([
        { key: 'A', value: 'mine', type: 'personal' },
        { key: 'A', value: 'shared', type: 'shared' },
        { key: 'B', value: 'mine', type: 'personal' },
        { key: 'C', value: 1, type: 'shared' },
        null
      ]);
    expect(exportShared(target, 'failed', run)).toEqual([
      { key: 'A', value: 'shared' },
      { key: 'B', value: null }
    ]);
  });

  it('throws the given message, not the runner error', () => {
    const run = () => {
      throw new Error('SENTINEL');
    };
    expect(() => exportShared(target, 'failed', run)).toThrow(/^failed$/);
  });

  it('rethrows a missing CLI as it is', () => {
    const run = () => {
      throw new InfisicalMissingError();
    };
    expect(() => exportShared(target, 'failed', run)).toThrow(
      InfisicalMissingError
    );
  });
});
