import { describe, expect, it } from 'vitest';

import type { StudioBuild } from './build-state';
import { listedFindings, markedFindings } from './findings';

const at = { column: 1, message: 'm' } as const;
const failed: StudioBuild = {
  status: 'failed',
  hash: null,
  builtAt: null,
  diagnostics: [
    { ...at, line: 0, severity: 'error' },
    { ...at, line: 4, severity: 'warning' },
    { ...at, line: 2, severity: 'error' }
  ]
};

describe('listedFindings', () => {
  it('lists the stored build, errors first', () => {
    const listed = listedFindings({
      build: failed,
      check: null,
      edited: false
    });
    expect(listed?.origin).toBe('build');
    expect(listed?.diagnostics.map(({ line }) => line)).toEqual([0, 2, 4]);
  });

  it('prefers the last check, even an empty one', () => {
    expect(
      listedFindings({
        build: failed,
        check: { diagnostics: [] },
        edited: false
      })
    ).toEqual({ origin: 'check', diagnostics: [] });
  });

  it('lists nothing for a clean build', () => {
    const ready: StudioBuild = { ...failed, status: 'ready', diagnostics: [] };
    expect(listedFindings({ build: ready, check: null, edited: false })).toBe(
      null
    );
    expect(listedFindings({ build: null, check: null, edited: false })).toBe(
      null
    );
  });
});

describe('markedFindings', () => {
  it('marks the failed build until the source is edited', () => {
    expect(
      markedFindings({ build: failed, check: null, edited: false })
    ).toHaveLength(2);
    expect(
      markedFindings({ build: failed, check: null, edited: true })
    ).toEqual([]);
  });

  it('marks a check whatever else changed, and skips line-0 findings', () => {
    const check = { diagnostics: failed.diagnostics };
    expect(
      markedFindings({ build: null, check, edited: true }).map(
        ({ line }) => line
      )
    ).toEqual([4, 2]);
  });

  it('does not mark the warnings of a ready build', () => {
    const ready: StudioBuild = { ...failed, status: 'ready' };
    expect(
      markedFindings({ build: ready, check: null, edited: false })
    ).toEqual([]);
  });
});
