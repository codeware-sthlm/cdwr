// After each run the shim asks whether the installed completion still matches
// the checkout `cdwr setup` linked from, and starts a background rewrite when it
// doesn't. Plain JS like the shim: it runs before any TypeScript loads. The
// fingerprint and the record mirror `src/commands/completion.install.ts` and
// `completion.logic.ts`; change them together.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHELLS = ['zsh', 'bash', 'fish'];

/** A started refresh holds off the next one this long; it removes the marker when it succeeds */
export const RETRY_MS = 10 * 60 * 1000;

/** The recorded checkout and tree, or undefined when the refresh would reject the record too */
export const parseRecord = (text) => {
  try {
    const data = JSON.parse(text);
    return SHELLS.includes(data?.shell) &&
      typeof data.file === 'string' &&
      typeof data.root === 'string' &&
      (typeof data.tree === 'string' || data.tree === null)
      ? { root: data.root, tree: data.tree }
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Only the recorded checkout refreshes, and only once its tree moved: a shim
 * run from another checkout (`pnpm cdwr` in a worktree) could be behind it
 */
export const shouldRefresh = (record, root, tree) =>
  record !== undefined &&
  tree !== undefined &&
  record.root === root &&
  record.tree !== tree;

/** A refresh started within RETRY_MS is still running, or failed and waits its turn */
export const refreshPending = (markerMtimeMs, now) =>
  markerMtimeMs !== undefined && now - markerMtimeMs < RETRY_MS;

const treeOf = (root) => {
  const result = spawnSync(
    'git',
    ['-C', root, 'rev-parse', 'HEAD:tools/cdwr/src'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
};

const mtimeOf = (file) => {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
};

/** Never throws: completion is a convenience and must not fail a command */
export function refreshCompletion(root, env = process.env) {
  try {
    const home = env.CDWR_HOME ?? join(homedir(), '.cdwr');
    const file = join(home, 'completion.json');
    if (!existsSync(file)) return;
    const record = parseRecord(readFileSync(file, 'utf8'));
    // Skips the git call on every run outside the linked checkout
    if (record?.root !== root) return;
    const marker = join(home, 'completion.refresh');
    if (refreshPending(mtimeOf(marker), Date.now())) return;
    if (!shouldRefresh(record, root, treeOf(root))) return;
    writeFileSync(marker, `${new Date().toISOString()}\n`);
    const tsx = join(root, 'node_modules', '.bin', 'tsx');
    const tsconfig = join(root, 'tools', 'cdwr', 'tsconfig.lib.json');
    const script = join(root, 'tools', 'cdwr', 'src', 'completion-refresh.ts');
    spawn(tsx, ['--tsconfig', tsconfig, script], {
      detached: true,
      stdio: 'ignore',
      env
    })
      .on('error', () => undefined)
      .unref();
  } catch {
    // The next run tries again
  }
}
