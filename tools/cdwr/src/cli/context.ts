import type { Ui } from '../ui/ui';

import type { Prefs } from './prefs';

export interface Flags {
  yes: boolean;
  dryRun: boolean;
  json: boolean;
  nonInteractive: boolean;
  verbose: boolean;
}

/** What every command gets: where it runs, how it talks, what it remembers */
export interface Context {
  /** Workspace root, the directory holding nx.json */
  root: string;
  flags: Flags;
  ui: Ui;
  prefs: Prefs;
  env: NodeJS.ProcessEnv;
  /** Name of the running command, for prefs and history */
  command: string;
}
