import { describe, expect, it } from 'vitest';

import type { StudioBuild } from './build-state';
import {
  buildBadge,
  buildMeta,
  buildSummary,
  formatAgo,
  formatBuiltAt,
  shortHash,
  stripModel,
  worstTone
} from './strip';

const build = (overrides: Partial<StudioBuild> = {}): StudioBuild => ({
  status: 'ready',
  hash: 'abcdef0123456789',
  builtAt: '2026-10-02T10:30:00Z',
  diagnostics: [],
  ...overrides
});

const warning = {
  message: 'w',
  line: 1,
  column: 1,
  severity: 'warning'
} as const;

describe('buildBadge', () => {
  it.each([
    [null, 'Not built', 'muted'],
    [build({ status: 'pending' }), 'Pending', 'muted'],
    [build({ status: 'building' }), 'Building', 'muted'],
    [build(), 'Ready', 'success'],
    [build({ diagnostics: [warning] }), 'Ready with warnings', 'warning'],
    [build({ status: 'failed' }), 'Failed', 'destructive']
  ] as const)('labels %#', (state, label, variant) => {
    expect(buildBadge(state)).toMatchObject({ label, variant });
  });
});

describe('worstTone', () => {
  it('takes the most serious tone', () => {
    expect(worstTone(['ok', 'error', 'warn'])).toBe('error');
    expect(worstTone(['muted', 'ok'])).toBe('ok');
    expect(worstTone([])).toBe('muted');
  });
});

describe('stripModel', () => {
  it('stays closed for a ready build', () => {
    expect(
      stripModel(build(), { kind: 'format', changed: true })
    ).toMatchObject({
      expand: false,
      tone: 'ok',
      builtAt: '2026-10-02T10:30:00Z',
      hash: 'abcdef01'
    });
  });

  it('opens for a failed build with findings', () => {
    const failed = build({ status: 'failed', diagnostics: [warning] });
    expect(stripModel(failed, null).expand).toBe(true);
    expect(stripModel(failed, null).tone).toBe('error');
  });

  it('opens for an action that failed, whatever the build says', () => {
    const model = stripModel(build(), {
      kind: 'format-error',
      message: 'x',
      line: null,
      column: null
    });
    expect(model).toMatchObject({ expand: true, tone: 'error' });
  });

  it('has no action before one is taken', () => {
    expect(stripModel(null, null).action).toBeNull();
  });
});

describe('buildSummary', () => {
  it('says whether a failed build still serves a bundle', () => {
    expect(buildSummary(build({ status: 'failed' }))).toContain(
      'previous bundle is still served'
    );
    expect(buildSummary(build({ status: 'failed', hash: null }))).toContain(
      'no earlier bundle'
    );
  });

  it('has a line for every state, built or not', () => {
    expect(buildSummary(null)).toContain('Not built yet');
    expect(buildSummary(build({ status: 'pending' }))).toContain('Queued');
    expect(buildSummary(build({ status: 'building' }))).toBe('Building…');
    expect(buildSummary(build({ status: 'ready' }))).toContain(
      'serves this build'
    );
  });
});

describe('buildMeta', () => {
  it('joins the job details it is given', () => {
    expect(
      buildMeta(
        build({ status: 'failed', job: { step: 'bundle', durationMs: 2400 } })
      )
    ).toBe('bundle · 2.4 s');
    expect(buildMeta(build({ status: 'ready' }))).toBeNull();
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');

  it('says how long ago in the largest unit that fits', () => {
    expect(formatAgo('2026-10-02T11:59:40Z', now)).toBe('just now');
    expect(formatAgo('2026-10-02T11:55:00Z', now)).toBe('5 minutes ago');
    expect(formatAgo('2026-10-02T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatAgo('2026-05-02T12:00:00Z', now)).toBe('5 months ago');
  });

  it('is null for what is not a date', () => {
    expect(formatAgo('nope', now)).toBeNull();
  });
});

describe('formatting', () => {
  it('shortens a hash and tolerates no hash', () => {
    expect(shortHash('abcdef0123')).toBe('abcdef01');
    expect(shortHash(null)).toBeNull();
  });

  it('hands back what is not a date', () => {
    expect(formatBuiltAt('nope')).toBe('nope');
  });
});
