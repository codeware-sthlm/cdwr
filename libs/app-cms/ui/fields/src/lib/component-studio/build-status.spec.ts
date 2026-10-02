import { describe, expect, it } from 'vitest';

import {
  type BuildDiagnostic,
  parseBuild,
  parseDiagnostics
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
