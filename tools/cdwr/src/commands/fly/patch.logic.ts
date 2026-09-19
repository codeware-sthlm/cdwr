import * as TOML from 'smol-toml';
import type { TomlTable, TomlValue } from 'smol-toml';

import { theme } from '../../ui/theme';

const isTable = (value: TomlValue): value is TomlTable =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof TOML.TomlDate);

/** A patch value replaces the base entirely for arrays; tables merge key by key */
export function deepMerge(base: TomlValue, patch: TomlValue): TomlValue {
  if (Array.isArray(patch)) return patch;
  if (!isTable(patch)) return patch;
  const merged: TomlTable = isTable(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = deepMerge(merged[key], value);
  }
  return merged;
}

/** Merge a patch into a base config, both as TOML text, and stringify the result */
export function mergeTOML(base: string, patch: string): string {
  const merged = deepMerge(TOML.parse(base), TOML.parse(patch));
  return TOML.stringify(merged);
}

/** Parse and re-stringify, so two configs written differently still compare equal */
export function normalizeTOML(input: string): string {
  try {
    return TOML.stringify(TOML.parse(input));
  } catch {
    return input;
  }
}

export type DiffLineType = 'same' | 'removed' | 'added';

export interface DiffLine {
  type: DiffLineType;
  content: string;
}

/**
 * Line-level diff between two TOML texts, grouped into hunks with context
 * around each change, unified-diff style. Both sides are normalized first so
 * formatting alone never shows as a change.
 */
export function diffTOML(
  before: string,
  after: string,
  contextLines = 2
): DiffLine[][] {
  const beforeLines = normalizeTOML(before).split('\n');
  const afterLines = normalizeTOML(after).split('\n');
  const lines: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < beforeLines.length || j < afterLines.length) {
    const beforeLine = beforeLines[i] ?? '';
    const afterLine = afterLines[j] ?? '';
    if (
      i < beforeLines.length &&
      j < afterLines.length &&
      beforeLine === afterLine
    ) {
      lines.push({ type: 'same', content: beforeLine });
      i++;
      j++;
    } else if (
      i < beforeLines.length &&
      (j >= afterLines.length || !afterLines.slice(j).includes(beforeLine))
    ) {
      lines.push({ type: 'removed', content: beforeLine });
      i++;
    } else if (j < afterLines.length) {
      lines.push({ type: 'added', content: afterLine });
      j++;
    } else {
      i++;
    }
  }

  const hunks: Array<[number, number]> = [];
  let start = -1;
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].type !== 'same') {
      if (start === -1) start = Math.max(0, idx - contextLines);
      continue;
    }
    if (start === -1) continue;

    let gap = 0;
    let nextChange = -1;
    for (let k = idx; k < lines.length && k < idx + contextLines * 2; k++) {
      if (lines[k].type !== 'same') {
        nextChange = k;
        break;
      }
      gap++;
    }
    if (nextChange === -1 || gap >= contextLines * 2) {
      hunks.push([start, Math.min(lines.length, idx + contextLines)]);
      start = -1;
    }
  }
  if (start !== -1) hunks.push([start, lines.length]);

  return hunks.map(([from, to]) => lines.slice(from, to));
}

/** Top-level keys that were added, removed or changed, as `+[key]`/`-[key]`/`~[key]` */
export function summarizeChanges(before: string, after: string): string[] {
  const beforeTable = TOML.parse(before);
  const afterTable = TOML.parse(after);
  const keys = new Set([
    ...Object.keys(beforeTable),
    ...Object.keys(afterTable)
  ]);

  const changes: string[] = [];
  for (const key of keys) {
    const wasPresent = key in beforeTable;
    const isPresent = key in afterTable;
    if (!wasPresent) changes.push(`+[${key}]`);
    else if (!isPresent) changes.push(`-[${key}]`);
    else if (
      JSON.stringify(beforeTable[key]) !== JSON.stringify(afterTable[key])
    )
      changes.push(`~[${key}]`);
  }
  return changes;
}

const summaryToken = (change: string): string =>
  change.startsWith('+')
    ? theme.added(change)
    : change.startsWith('-')
      ? theme.removed(change)
      : theme.changed(change);

const diffLine = (line: DiffLine): string =>
  line.type === 'added'
    ? theme.added(`+ ${line.content}`)
    : line.type === 'removed'
      ? theme.removed(`- ${line.content}`)
      : theme.muted(`  ${line.content}`);

/** Coloured block for `ctx.ui.write`: the app, its change summary, then the diff */
export function renderPatchDiff(
  app: string,
  changes: string[],
  hunks: DiffLine[][]
): string {
  const header = `${theme.title(app)}  ${changes.map(summaryToken).join(' ')}`;
  const body = hunks.map((hunk) => hunk.map(diffLine).join('\n')).join('\n\n');
  return `${header}\n\n${body}`;
}
