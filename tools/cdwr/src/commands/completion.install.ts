import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import { dirname } from 'node:path';

import { type Shell, collect, render } from '../cli/completion';

import {
  type CompletionRecord,
  parseRecord,
  recordFile,
  stamp
} from './completion.logic';
import { ENTRIES, GROUPS } from './index';

/** The fingerprint of everything completion is rendered from; the shim computes the same */
export const treeOf = (root: string): string | undefined => {
  const result = spawnSync(
    'git',
    ['-C', root, 'rev-parse', 'HEAD:tools/cdwr/src'],
    { encoding: 'utf8' }
  );
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
};

export const readRecord = (cdwrHome: string): CompletionRecord | undefined => {
  const file = recordFile(cdwrHome);
  return existsSync(file) ? parseRecord(readFileSync(file, 'utf8')) : undefined;
};

/** Written beside the target and renamed over it, so a concurrent run never reads half a file */
const writeAtomic = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
};

/** Renders this checkout's completion for a shell, writes it and records what it came from */
export async function installCompletion(options: {
  shell: Shell;
  file: string;
  root: string;
  cdwrHome: string;
}): Promise<CompletionRecord> {
  // Resolved, so the shim and the refresh compare it with their own real path
  const root = realpathSync(options.root);
  const record: CompletionRecord = {
    shell: options.shell,
    file: options.file,
    root,
    tree: treeOf(root) ?? null
  };
  const script = render(options.shell, GROUPS, await collect(ENTRIES));
  writeAtomic(options.file, stamp(script, record));
  writeAtomic(
    recordFile(options.cdwrHome),
    `${JSON.stringify(record, null, 2)}\n`
  );
  return record;
}
