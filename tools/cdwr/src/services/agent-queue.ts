import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Context } from '../cli/context';
import { CliError } from '../cli/errors';
import { cdwrHome } from '../cli/prefs';
import {
  type JobState,
  KEYCHAIN_SERVICE,
  QUEUE_FILES,
  QUEUE_SOURCE_DIR,
  type QueueFile,
  type QueuePaths,
  WORKTREE_PREF,
  byFile,
  filesDrift,
  parseLaunchctlPrint,
  queuePaths,
  serviceTarget
} from '../commands/agent/agent.logic';

import { run } from './shell';

export function requireMac(): void {
  if (process.platform !== 'darwin') {
    throw new CliError('The agent queue runs on macOS only');
  }
}

export const paths = (env: NodeJS.ProcessEnv): QueuePaths =>
  queuePaths(cdwrHome(env), homedir());

/** The checkout the queue plans in; a sibling of the workspace unless set */
export function worktreeOf(ctx: Context): string {
  const pref = ctx.prefs.get(WORKTREE_PREF);
  return typeof pref === 'string' && pref
    ? pref
    : join(dirname(ctx.root), 'codeware-agent');
}

export const currentUid = (): number => process.getuid?.() ?? -1;

/** The job as launchd sees it; a failing `launchctl print` means it is not loaded */
export async function jobState(
  uid: number = currentUid()
): Promise<(JobState & { loaded: true }) | { loaded: false }> {
  try {
    const { stdout } = await run('launchctl', ['print', serviceTarget(uid)]);
    return { loaded: true, ...parseLaunchctlPrint(stdout) };
  } catch {
    return { loaded: false };
  }
}

/** Whether the Linear key is in the Keychain; the secret itself is never read */
export async function keyPresent(): Promise<boolean> {
  try {
    await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE]);
    return true;
  } catch {
    return false;
  }
}

/** What the installed script would do now; undefined when it is not installed */
export async function checkRun(
  queue: QueuePaths,
  repo: string,
  env: NodeJS.ProcessEnv
): Promise<string | undefined> {
  if (!existsSync(queue.script)) return undefined;
  const { stdout } = await run('/bin/zsh', [queue.script, '--check'], {
    env: {
      ...env,
      AGENT_QUEUE_HOME: queue.home,
      AGENT_QUEUE_REPO: repo
    },
    timeout: 30_000
  });
  return stdout.trim().split('\n').at(-1) ?? '';
}

/** Milliseconds since the lock was taken; undefined when it is free */
export function lockAge(lock: string): number | undefined {
  try {
    return Date.now() - statSync(lock).mtimeMs;
  } catch {
    return undefined;
  }
}

export function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** The queue's files in the repo; names the first one that is missing otherwise */
export function readQueueSources(
  root: string
): { source: Record<QueueFile, string> } | { missing: string } {
  const texts = byFile((file) => readText(join(root, QUEUE_SOURCE_DIR, file)));
  for (const file of QUEUE_FILES) {
    if (texts[file] === undefined) {
      return { missing: `${QUEUE_SOURCE_DIR}/${file}` };
    }
  }
  return {
    source: byFile((file) => texts[file] ?? '')
  };
}

/** Whether the installed queue files match the repo's; a missing source counts as missing */
export function queueDrift(
  queue: QueuePaths,
  root: string
): ReturnType<typeof filesDrift> {
  const sources = readQueueSources(root);
  return 'source' in sources
    ? filesDrift(
        byFile((file) => readText(queue.files[file])),
        sources.source
      )
    : 'missing';
}
