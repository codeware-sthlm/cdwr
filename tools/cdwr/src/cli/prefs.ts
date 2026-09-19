import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where cdwr keeps what it remembers, overridable for tests */
export const cdwrHome = (env: NodeJS.ProcessEnv = process.env): string =>
  env['CDWR_HOME'] ?? join(homedir(), '.cdwr');

export interface Prefs {
  /** Last value given for a remembered input, keyed by input key */
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  /** Writes pending changes; a no-op when nothing changed */
  save(): void;
}

/** Remembered defaults in `~/.cdwr/prefs.json`; inputs opt in with `remember` */
export function loadPrefs(home: string = cdwrHome()): Prefs {
  const file = join(home, 'prefs.json');
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    data = {};
  }
  let dirty = false;

  return {
    get: (key) => data[key],
    set(key, value) {
      if (data[key] === value) return;
      data[key] = value;
      dirty = true;
    },
    save() {
      if (!dirty) return;
      mkdirSync(home, { recursive: true });
      writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      dirty = false;
    }
  };
}

export const memoryPrefs = (initial: Record<string, unknown> = {}): Prefs => {
  const data = { ...initial };
  return {
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value;
    },
    save: () => undefined
  };
};
