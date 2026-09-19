import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cdwrHome } from './prefs';

export interface HistoryEntry {
  at: string;
  command: string;
  /** Inputs without secrets */
  inputs: Record<string, unknown>;
  target?: { environment?: string; name?: string };
  outcome: 'done' | 'partial' | 'failed';
  summary: string;
  /** Milliseconds from plan to result */
  took: number;
}

const historyFile = (home: string) => join(home, 'history.jsonl');

/** Append what a command did; only commands that change something are recorded */
export function recordHistory(
  entry: HistoryEntry,
  home: string = cdwrHome()
): void {
  mkdirSync(home, { recursive: true });
  appendFileSync(historyFile(home), `${JSON.stringify(entry)}\n`);
}

/** Newest first */
export function readHistory(home: string = cdwrHome()): HistoryEntry[] {
  let raw = '';
  try {
    raw = readFileSync(historyFile(home), 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryEntry)
    .reverse();
}
