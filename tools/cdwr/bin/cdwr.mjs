#!/usr/bin/env node
// Runs the cdwr CLI from source. Symlink this file onto PATH as `cdwr`
// (`cdwr setup` does it), or run it through `pnpm cdwr`.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refreshCompletion } from './completion-check.mjs';

const BIN = join('tools', 'cdwr', 'bin', 'cdwr.mjs');

// The checkout the caller stands in, so one global symlink runs each clone's
// own code rather than the clone that happened to run `cdwr setup`
const checkoutOf = (dir) => {
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, BIN))) return current;
    if (dirname(current) === current) return undefined;
  }
};

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
// The checkout this shim file lives in: the linked one when run through the symlink
const own = resolve(here, '..', '..', '..');
const root = checkoutOf(process.cwd()) ?? own;
const tsx = join(root, 'node_modules', '.bin', 'tsx');
const tsconfig = join(root, 'tools', 'cdwr', 'tsconfig.lib.json');
const main = join(root, 'tools', 'cdwr', 'src', 'main.ts');

if (!existsSync(tsx)) {
  console.error(
    `cdwr: ${root} has no dependencies installed, run pnpm install`
  );
  process.exit(1);
}

// Ctrl-C and Ctrl-\ go to the whole foreground group; the CLI decides what they
// do, so this launcher must not die under it (an interactive session it starts
// would lose its terminal to the shell)
for (const signal of ['SIGINT', 'SIGQUIT']) process.on(signal, () => undefined);

const result = spawnSync(
  tsx,
  ['--tsconfig', tsconfig, main, ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, CDWR_ROOT: root } }
);

if (result.error) {
  console.error(`cdwr: ${result.error.message}`);
  process.exit(1);
}
// After the command, so its output and exit code are untouched
refreshCompletion(own);
process.exit(result.status ?? 1);
