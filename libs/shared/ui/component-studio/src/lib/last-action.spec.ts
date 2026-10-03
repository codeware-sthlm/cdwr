import { describe, expect, it } from 'vitest';

import {
  type ActionResult,
  countFindings,
  describeAction,
  nameList
} from './last-action';

describe('describeAction', () => {
  const cases: Array<[string, ActionResult, string, string]> = [
    ['format', { kind: 'format', changed: true }, 'ok', 'Formatted'],
    [
      'format unchanged',
      { kind: 'format', changed: false },
      'ok',
      'Already formatted'
    ],
    [
      'format error with position',
      { kind: 'format-error', message: 'Unexpected token', line: 3, column: 5 },
      'error',
      'Format failed: Unexpected token (3:5)'
    ],
    [
      'format error without position',
      { kind: 'format-error', message: 'Bad', line: null, column: null },
      'error',
      'Format failed: Bad'
    ],
    [
      'clean check',
      { kind: 'check', errors: 0, warnings: 0, durationMs: 900 },
      'ok',
      'Check: no problems'
    ],
    [
      'check with warnings',
      { kind: 'check', errors: 0, warnings: 1, durationMs: null },
      'warn',
      'Check: 1 problem'
    ],
    [
      'check with errors',
      { kind: 'check', errors: 2, warnings: 1, durationMs: null },
      'error',
      'Check: 3 problems'
    ],
    [
      'forbidden check',
      { kind: 'check-failed', task: 'check', reason: 'forbidden' },
      'error',
      'Check: this account may not check components'
    ],
    [
      'forbidden sync',
      { kind: 'check-failed', task: 'sync', reason: 'forbidden' },
      'error',
      'Sync inputs: this account may not check components'
    ],
    [
      'unreachable sync',
      { kind: 'check-failed', task: 'sync', reason: 'unreachable' },
      'error',
      'Sync inputs: the build service could not be reached'
    ],
    [
      'import added',
      { kind: 'import', label: 'Button', added: true },
      'ok',
      'Import added: Button'
    ],
    [
      'import present',
      { kind: 'import', label: 'Button', added: false },
      'muted',
      'Already imported: Button'
    ],
    ['busy', { kind: 'busy', task: 'sync' }, 'muted', 'Syncing inputs…'],
    [
      'sync unchanged',
      { kind: 'sync', outcome: { status: 'unchanged', skipped: [] } },
      'muted',
      'Inputs already in sync'
    ],
    [
      'sync changed',
      {
        kind: 'sync',
        outcome: {
          status: 'changed',
          added: ['a', 'b'],
          removed: ['c'],
          updated: [],
          skipped: []
        }
      },
      'ok',
      'Inputs synced: 2 added, 1 removed'
    ]
  ];

  it.each(cases)('words %s', (_name, result, tone, text) => {
    expect(describeAction(result)).toMatchObject({ tone, text });
  });

  it('lists the names behind a sync and the ones it skipped', () => {
    const { details } = describeAction({
      kind: 'sync',
      outcome: {
        status: 'changed',
        added: ['title'],
        removed: [],
        updated: ['count'],
        skipped: ['onClick']
      }
    });

    expect(details).toEqual([
      'Added: title',
      'Updated: count',
      'Left as they are, no input can supply their type: onClick'
    ]);
  });

  it('gives a check its error split and its duration', () => {
    const { details } = describeAction({
      kind: 'check',
      errors: 1,
      warnings: 0,
      durationMs: 1040
    });
    expect(details).toEqual(['1 error, 0 warnings', 'Checked in 1.0 s']);
  });
});

describe('nameList', () => {
  it('shortens a long list', () => {
    expect(nameList(['a', 'b', 'c'], 2)).toBe('a, b and 1 more');
    expect(nameList(['a', 'b'], 2)).toBe('a, b');
  });
});

describe('countFindings', () => {
  it('splits by severity', () => {
    const at = { line: 1, column: 1, message: 'm' };
    expect(
      countFindings([
        { ...at, severity: 'error' },
        { ...at, severity: 'warning' },
        { ...at, severity: 'error' }
      ])
    ).toEqual({ errors: 2, warnings: 1 });
  });
});
