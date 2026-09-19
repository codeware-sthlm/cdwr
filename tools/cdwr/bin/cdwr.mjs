#!/usr/bin/env node
// Runs the cdwr CLI from source. Symlink this file onto PATH as `cdwr`
// (`cdwr setup` does it), or run it through `pnpm cdwr`.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
const root = join(here, '..', '..', '..');
const tsx = join(root, 'node_modules', '.bin', 'tsx');
const tsconfig = join(root, 'tools', 'cdwr', 'tsconfig.lib.json');
const main = join(root, 'tools', 'cdwr', 'src', 'main.ts');

const result = spawnSync(
  tsx,
  ['--tsconfig', tsconfig, main, ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, CDWR_ROOT: root } }
);

if (result.error) {
  console.error(`cdwr: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
