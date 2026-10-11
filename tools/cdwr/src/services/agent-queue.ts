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
  implementCap,
  lastImplementRun,
  nodeMajor,
  parseLaunchctlPrint,
  plistPath,
  queuePaths,
  serviceTarget,
  spendForDay
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

/**
 * What the installed script would do now: its decision (the last line) and the
 * `attended:` verdict and `queue-view:` lines when it printed them. Undefined when it is not installed
 */
export async function checkRun(
  queue: QueuePaths,
  repo: string,
  env: NodeJS.ProcessEnv
): Promise<
  { decision: string; attended?: string; queueView?: string } | undefined
> {
  if (!existsSync(queue.script)) return undefined;
  const { stdout } = await run('/bin/zsh', [queue.script, '--check'], {
    env: {
      ...env,
      AGENT_QUEUE_HOME: queue.home,
      AGENT_QUEUE_REPO: repo
    },
    // Two Linear reads of up to 20 s each (attended, then the plan query)
    timeout: 60_000
  });
  const lines = stdout.trim().split('\n');
  const attended = lines.filter((line) => line.startsWith('attended: ')).at(-1);
  const queueView = lines
    .filter((line) => line.startsWith('queue-view: '))
    .at(-1);
  return {
    decision: lines.at(-1) ?? '',
    ...(attended === undefined
      ? {}
      : { attended: attended.slice('attended: '.length) }),
    ...(queueView === undefined
      ? {}
      : { queueView: queueView.slice('queue-view: '.length) })
  };
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

/** Today's implementing spend against the daily cap, and the last implementing row of the runs log */
export function implementReport(
  queue: QueuePaths,
  env: NodeJS.ProcessEnv,
  now: Date = new Date()
): {
  spent: number | undefined;
  cap: number;
  last: ReturnType<typeof lastImplementRun>;
} {
  // The day implement.sh stamps: local date
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    spent: spendForDay(readText(queue.implementSpend), day),
    cap: implementCap(env['AGENT_QUEUE_IMPLEMENT_CAP_USD']),
    last: lastImplementRun(readText(queue.runs))
  };
}

/**
 * What the job sees: node 22, a logged-in gh and a claude that runs, on the PATH
 * the installed plist gives it. Undefined when no plist PATH is installed.
 */
export async function jobPathChecks(
  env: NodeJS.ProcessEnv,
  queue: QueuePaths
): Promise<{ node: boolean; gh: boolean; claude: boolean } | undefined> {
  const path = plistPath(readText(queue.plist));
  if (path === undefined) return undefined;
  const jobEnv = { ...env, PATH: path };
  const ok = async (cmd: string, args: string[]): Promise<string | undefined> =>
    run(cmd, args, { env: jobEnv, timeout: 20_000 }).then(
      ({ stdout }) => stdout,
      () => undefined
    );
  const [node, gh, claude] = await Promise.all([
    ok('node', ['--version']),
    ok('gh', ['auth', 'status']),
    ok('claude', ['--version'])
  ]);
  return {
    node: node !== undefined && nodeMajor(node) === 22,
    gh: gh !== undefined,
    claude: claude !== undefined
  };
}
