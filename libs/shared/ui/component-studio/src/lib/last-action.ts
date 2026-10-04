import type { ComponentDiagnostic } from '@codeware/shared/util/payload-utils';

import type { RebuildOutcome } from './rebuild';

export type Tone = 'ok' | 'warn' | 'error' | 'muted';

/** What the host did to its form when asked to sync the inputs */
export type SyncOutcome =
  | {
      status: 'changed';
      added: readonly string[];
      removed: readonly string[];
      updated: readonly string[];
      /** Props of a type no input can supply */
      skipped: readonly string[];
    }
  | { status: 'unchanged'; skipped: readonly string[] };

/** What the studio is doing right now */
export type BusyTask = 'format' | 'check' | 'sync' | 'rebuild';

/** What the last action came to; the strip words it */
export type ActionResult =
  | { kind: 'busy'; task: BusyTask }
  | { kind: 'format'; changed: boolean }
  | {
      kind: 'format-error';
      message: string;
      line: number | null;
      column: number | null;
    }
  | {
      kind: 'check';
      errors: number;
      warnings: number;
      durationMs: number | null;
    }
  | {
      kind: 'check-failed';
      /** Which action asked for the check: sync runs one too */
      task: 'check' | 'sync';
      reason: 'forbidden' | 'unreachable';
    }
  | { kind: 'rebuild'; outcome: RebuildOutcome['status'] }
  | { kind: 'sync'; outcome: SyncOutcome }
  | { kind: 'sync-unresolved' }
  | { kind: 'sync-failed'; message: string }
  | { kind: 'import'; label: string; added: boolean };

/** An action's outcome in words, with the lines that fold out */
export type Described = {
  tone: Tone;
  text: string;
  details: string[];
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** `a, b and 2 more` stays short enough for a line */
export const nameList = (names: readonly string[], max = 6): string =>
  names.length <= max
    ? names.join(', ')
    : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;

const syncText = (outcome: SyncOutcome): string => {
  if (outcome.status === 'unchanged') {
    return 'Inputs already in sync';
  }
  const parts = [
    outcome.added.length > 0 ? `${outcome.added.length} added` : null,
    outcome.removed.length > 0 ? `${outcome.removed.length} removed` : null,
    outcome.updated.length > 0 ? `${outcome.updated.length} updated` : null
  ].filter((part) => part !== null);
  return parts.length > 0
    ? `Inputs synced: ${parts.join(', ')}`
    : 'Inputs synced';
};

const syncDetails = (outcome: SyncOutcome): string[] => {
  const lines: string[] = [];
  if (outcome.status === 'changed') {
    if (outcome.added.length > 0) {
      lines.push(`Added: ${nameList(outcome.added)}`);
    }
    if (outcome.removed.length > 0) {
      lines.push(`Removed: ${nameList(outcome.removed)}`);
    }
    if (outcome.updated.length > 0) {
      lines.push(`Updated: ${nameList(outcome.updated)}`);
    }
  }
  if (outcome.skipped.length > 0) {
    lines.push(
      `Left as they are, no input can supply their type: ${nameList(outcome.skipped)}`
    );
  }
  return lines;
};

const positioned = (
  message: string,
  line: number | null,
  column: number | null
) => (line === null ? message : `${message} (${line}:${column ?? 1})`);

/** One describer per kind; a new kind does not compile without one */
const describers = {
  busy: ({ task }) => ({
    tone: 'muted',
    text: {
      format: 'Formatting…',
      check: 'Checking…',
      sync: 'Syncing inputs…',
      rebuild: 'Queueing a rebuild…'
    }[task],
    details: []
  }),
  format: ({ changed }) => ({
    tone: 'ok',
    text: changed ? 'Formatted' : 'Already formatted',
    details: []
  }),
  'format-error': ({ message, line, column }) => ({
    tone: 'error',
    text: `Format failed: ${positioned(message, line, column)}`,
    details: ['Prettier could not parse the source, so nothing was changed.']
  }),
  check: ({ errors, warnings, durationMs }) => {
    const total = errors + warnings;
    return {
      tone: errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'ok',
      text:
        total === 0
          ? 'Check: no problems'
          : `Check: ${plural(total, 'problem')}`,
      details: [
        ...(total > 0
          ? [`${plural(errors, 'error')}, ${plural(warnings, 'warning')}`]
          : []),
        ...(durationMs === null
          ? []
          : [`Checked in ${(durationMs / 1000).toFixed(1)} s`])
      ]
    };
  },
  'check-failed': ({ task, reason }) => {
    const action = task === 'sync' ? 'Sync inputs' : 'Check';
    return reason === 'forbidden'
      ? {
          tone: 'error',
          text: `${action}: this account may not check components`,
          details: [
            'Checking runs the code through the build, which only a component developer may do. A platform administrator grants that on the account, per workspace.'
          ]
        }
      : {
          tone: 'error',
          text: `${action}: the build service could not be reached`,
          details: []
        };
  },
  rebuild: ({ outcome }) =>
    outcome === 'queued'
      ? { tone: 'ok', text: 'Rebuild queued', details: [] }
      : {
          tone: 'error',
          text:
            outcome === 'forbidden'
              ? 'Rebuild: this account may not rebuild components'
              : 'Rebuild: the request failed',
          details: []
        },
  sync: ({ outcome }) => ({
    tone: outcome.status === 'changed' ? 'ok' : 'muted',
    text: syncText(outcome),
    details: syncDetails(outcome)
  }),
  'sync-unresolved': () => ({
    tone: 'error',
    text: 'Inputs not synced: the props could not be read from the code',
    details: ['Fix the errors the check reports, then sync again.']
  }),
  'sync-failed': ({ message }) => ({
    tone: 'error',
    text: `Inputs not synced: ${message}`,
    details: []
  }),
  import: ({ label, added }) => ({
    tone: added ? 'ok' : 'muted',
    text: added ? `Import added: ${label}` : `Already imported: ${label}`,
    details: []
  })
} as const satisfies {
  [K in ActionResult['kind']]: (
    result: Extract<ActionResult, { kind: K }>
  ) => Described;
};

export const describeAction = (result: ActionResult): Described => {
  switch (result.kind) {
    case 'busy':
      return describers.busy(result);
    case 'format':
      return describers.format(result);
    case 'format-error':
      return describers['format-error'](result);
    case 'check':
      return describers.check(result);
    case 'check-failed':
      return describers['check-failed'](result);
    case 'rebuild':
      return describers.rebuild(result);
    case 'sync':
      return describers.sync(result);
    case 'sync-unresolved':
      return describers['sync-unresolved']();
    case 'sync-failed':
      return describers['sync-failed'](result);
    case 'import':
      return describers.import(result);
  }
};

/** Counts the findings of a check by severity. */
export const countFindings = (
  diagnostics: readonly ComponentDiagnostic[]
): { errors: number; warnings: number } => ({
  errors: diagnostics.filter(({ severity }) => severity === 'error').length,
  warnings: diagnostics.filter(({ severity }) => severity === 'warning').length
});
