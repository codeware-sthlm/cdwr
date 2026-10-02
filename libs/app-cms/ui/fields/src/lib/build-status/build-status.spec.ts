import { describe, expect, it } from 'vitest';

import {
  type BuildDiagnostic,
  type BuildState,
  formatPosition,
  isServingPrevious,
  parseBuild,
  parseDiagnostics,
  shouldPoll,
  sortDiagnostics
} from './build-status';

const diagnostic = (
  overrides: Partial<BuildDiagnostic> = {}
): BuildDiagnostic => ({
  message: 'm',
  line: 1,
  column: 1,
  severity: 'error',
  ...overrides
});

describe('shouldPoll', () => {
  it.each([
    ['pending', true],
    ['building', true],
    ['ready', false],
    ['failed', false],
    [undefined, false]
  ] as const)('%s -> %s', (status, expected) => {
    expect(shouldPoll(status)).toBe(expected);
  });
});

describe('sortDiagnostics', () => {
  it('puts errors before warnings, then orders by position', () => {
    const sorted = sortDiagnostics([
      diagnostic({ message: 'w1', severity: 'warning', line: 1 }),
      diagnostic({ message: 'e2', line: 5, column: 2 }),
      diagnostic({ message: 'e1', line: 5, column: 1 }),
      diagnostic({ message: 'e0', line: 2 })
    ]);
    expect(sorted.map((d) => d.message)).toEqual(['e0', 'e1', 'e2', 'w1']);
  });

  it('does not mutate its input', () => {
    const input = [
      diagnostic({ severity: 'warning' }),
      diagnostic({ severity: 'error' })
    ];
    sortDiagnostics(input);
    expect(input[0].severity).toBe('warning');
  });
});

describe('parseDiagnostics', () => {
  it('keeps only well-formed entries', () => {
    expect(
      parseDiagnostics([diagnostic(), { message: 'x' }, null, 'text'])
    ).toEqual([diagnostic()]);
  });

  it('returns an empty list for anything but an array', () => {
    expect(parseDiagnostics(null)).toEqual([]);
    expect(parseDiagnostics({})).toEqual([]);
  });
});

describe('parseBuild', () => {
  it('reads a build group', () => {
    expect(
      parseBuild({
        status: 'ready',
        hash: 'abc',
        builtAt: '2026-10-02T10:00:00.000Z',
        diagnostics: []
      })
    ).toEqual({
      status: 'ready',
      hash: 'abc',
      builtAt: '2026-10-02T10:00:00.000Z',
      diagnostics: []
    });
  });

  it('fills missing fields with null and an empty list', () => {
    expect(parseBuild({ status: 'pending', hash: null })).toEqual({
      status: 'pending',
      hash: null,
      builtAt: null,
      diagnostics: []
    });
  });

  it('rejects input without a known status', () => {
    expect(parseBuild(undefined)).toBeNull();
    expect(parseBuild({ status: 'done' })).toBeNull();
    expect(parseBuild([])).toBeNull();
  });
});

describe('isServingPrevious', () => {
  const build = (overrides: Partial<BuildState>): BuildState => ({
    status: 'failed',
    hash: 'abc',
    builtAt: null,
    diagnostics: [],
    ...overrides
  });

  it('is true for a failed build that has a hash', () => {
    expect(isServingPrevious(build({}))).toBe(true);
  });

  it('is false without a hash or when not failed', () => {
    expect(isServingPrevious(build({ hash: null }))).toBe(false);
    expect(isServingPrevious(build({ status: 'ready' }))).toBe(false);
  });
});

describe('formatPosition', () => {
  it('joins line and column', () => {
    expect(formatPosition({ line: 3, column: 14 })).toBe('3:14');
  });
});
