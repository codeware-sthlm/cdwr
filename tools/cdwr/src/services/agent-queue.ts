import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Context } from '../cli/context';
import { CliError } from '../cli/errors';
import { cdwrHome } from '../cli/prefs';
import { ENV_FILE } from '../cli/workspace';
import {
  HOST_ENV,
  type JobState,
  KEYCHAIN_SERVICE,
  QUEUE_FILES,
  QUEUE_SOURCE_DIR,
  type QueueFile,
  type QueuePaths,
  WORKTREE_PREF,
  byFile,
  filesDrift,
  hostKind,
  implementBudget,
  implementCap,
  installedEnv,
  lastImplementRun,
  linearKeySource,
  nodeMajor,
  parseLaunchctlPrint,
  plistPath,
  queuePaths,
  serviceTarget,
  spendForDay
} from '../commands/agent/agent.logic';

import { CommandError, run } from './shell';

/** The host this command runs on; throws unless it is one of `allowed` */
export function requireHost(
  allowed: ReadonlyArray<'launchd' | 'container'>,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): 'launchd' | 'container' {
  const host = hostKind(platform, env);
  if (host === null || !allowed.includes(host)) {
    throw new CliError(
      `The agent queue runs on macOS (launchd) or in the agent container (${HOST_ENV}=container)`,
      undefined,
      allowed.length === 1 && allowed[0] === 'launchd'
        ? 'This command needs macOS; the container is installed as an image'
        : undefined
    );
  }
  return host;
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

/** Whether the Linear key is in the container's env or the Keychain; the secret itself is never read */
export async function keyPresent(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<boolean> {
  const source = linearKeySource(hostKind(platform, env), env);
  if (source === 'env') return true;
  if (source === 'none') return false;
  try {
    await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE]);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the installed script would do now: its decision (the last line) and the
 * `attended:` verdict, `linear:` line, `queue-view:` and `suggest:` lines when it printed them. Undefined when it is not installed
 */
export async function checkRun(
  queue: QueuePaths,
  repo: string,
  env: NodeJS.ProcessEnv
): Promise<
  | {
      decision: string;
      attended?: string;
      linear?: string;
      queueView?: string;
      suggest?: string;
    }
  | undefined
> {
  if (!existsSync(queue.script)) return undefined;
  const { stdout } = await run('/bin/zsh', [queue.script, '--check'], {
    env: {
      ...env,
      // The installed settings win over the shell's, as they do for the job
      ...installedEnv(readText(queue.plist) ?? ''),
      AGENT_QUEUE_HOME: queue.home,
      AGENT_QUEUE_REPO: repo
    },
    // Three Linear reads of up to 20 s each (attended, the plan query, the suggest gate)
    timeout: 90_000
  });
  const lines = stdout.trim().split('\n');
  const attended = lines.filter((line) => line.startsWith('attended: ')).at(-1);
  const linear = lines.filter((line) => line.startsWith('linear: ')).at(-1);
  const queueView = lines
    .filter((line) => line.startsWith('queue-view: '))
    .at(-1);
  const suggest = lines.filter((line) => line.startsWith('suggest: ')).at(-1);
  return {
    decision: lines.at(-1) ?? '',
    ...(suggest === undefined
      ? {}
      : { suggest: suggest.slice('suggest: '.length) }),
    ...(attended === undefined
      ? {}
      : { attended: attended.slice('attended: '.length) }),
    ...(linear === undefined
      ? {}
      : { linear: linear.slice('linear: '.length) }),
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
  budget: number;
  last: ReturnType<typeof lastImplementRun>;
} {
  // The day implement.sh stamps: local date
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    spent: spendForDay(readText(queue.implementSpend), day),
    cap: implementCap(env['AGENT_QUEUE_IMPLEMENT_CAP_USD']),
    budget: implementBudget(env['AGENT_QUEUE_IMPLEMENT_BUDGET_USD']),
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

/**
 * Whether the agent checkout's copy of an env file still matches this checkout's; install
 * refreshes it. Undefined when this checkout has none to compare with
 */
export function envCopyDrift(
  root: string,
  worktree: string,
  file: string = ENV_FILE
): 'current' | 'stale' | 'missing' | undefined {
  const ours = readText(join(root, file));
  if (ours === undefined) return undefined;
  const theirs = readText(join(worktree, file));
  if (theirs === undefined) return 'missing';
  return ours === theirs ? 'current' : 'stale';
}

export type GithubAppCheck =
  { ok: true; bot: string; repos: string[] } | { ok: false; reason: string };

/**
 * The GitHub App a launched session acts as, through the script's own code path: the env
 * file, the key file and its mode, the token exchange, and the repositories that token reaches
 */
export async function githubAppCheck(
  root: string,
  env: NodeJS.ProcessEnv
): Promise<GithubAppCheck> {
  const script = join(root, QUEUE_SOURCE_DIR, 'github-app.sh');
  try {
    const { stdout } = await run(
      '/bin/zsh',
      [
        '-c',
        [
          'source "$1" && app_env "$2" && app_session || exit 1',
          `repos="$(gh api /installation/repositories --jq '[.repositories[].full_name]')" || exit 1`,
          `jq -nc --arg bot "$GIT_AUTHOR_NAME" --argjson repos "$repos" '{bot: $bot, repos: $repos}'`
        ].join('\n'),
        'zsh',
        script,
        join(root, ENV_FILE)
      ],
      { env, timeout: 30_000 }
    );
    return {
      ok: true,
      ...(JSON.parse(stdout) as { bot: string; repos: string[] })
    };
  } catch (error) {
    const text = error instanceof CommandError ? error.stderr : String(error);
    const reason = text
      .trim()
      .split('\n')
      .at(-1)
      ?.replace(/^github app: /, '');
    return { ok: false, reason: reason || 'the token check failed' };
  }
}
