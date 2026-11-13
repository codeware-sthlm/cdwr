import { join } from 'node:path';

import { z } from 'zod';

import { CliError } from '../../cli/errors';

export const LABEL = 'se.codeware.agent-queue';
/**
 * Seconds between scheduled runs; launchd's StartInterval.
 * run.sh reads this line from origin/main to tell whether the install is current,
 * so keep the `export const RUN_INTERVAL_SECONDS = <n>;` shape.
 */
export const RUN_INTERVAL_SECONDS = 600;
/** Seconds between runs in the container while its listener is live; the image sets the same */
export const RUN_FALLBACK_SECONDS = 3600;
export const KEYCHAIN_SERVICE = 'linear-agent-queue';
/** Env var the personal Linear key (the fallback) comes from in the container */
export const LINEAR_KEY_ENV = 'AGENT_QUEUE_LINEAR_KEY';
/** Keychain service holding the queue's Linear app client id */
export const KEYCHAIN_CLIENT_ID_SERVICE = 'linear-agent-queue-client-id';
/** Keychain service holding the queue's Linear app client secret */
export const KEYCHAIN_CLIENT_SECRET_SERVICE =
  'linear-agent-queue-client-secret';
/** Env var the Linear app's client id comes from in the container */
export const LINEAR_CLIENT_ID_ENV = 'AGENT_QUEUE_LINEAR_CLIENT_ID';
/** Env var the Linear app's client secret comes from in the container */
export const LINEAR_CLIENT_SECRET_ENV = 'AGENT_QUEUE_LINEAR_CLIENT_SECRET';
/** Env var naming the file the container's Linear app client id and secret are written to */
export const LINEAR_APP_FILE_ENV = 'AGENT_QUEUE_LINEAR_APP_FILE';
/** Env var naming the file the container's fallback Linear key is written to */
export const LINEAR_KEY_FILE_ENV = 'AGENT_QUEUE_LINEAR_KEY_FILE';
/** Where the image puts the Linear app file, the default for `LINEAR_APP_FILE_ENV` */
export const CONTAINER_LINEAR_APP_FILE = '/run/agent/linear-app.env';
/** Where the image puts the Linear key file, the default for `LINEAR_KEY_FILE_ENV` */
export const CONTAINER_LINEAR_KEY_FILE = '/run/agent/linear.key';
/** Set to `container` where the queue runs in the agent container instead of launchd */
export const HOST_ENV = 'AGENT_QUEUE_HOST';

/** What runs the queue on this machine: launchd on a Mac, or the agent container */
export const hostKind = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): 'launchd' | 'container' | null =>
  env[HOST_ENV] === 'container'
    ? 'container'
    : platform === 'darwin'
      ? 'launchd'
      : null;

/**
 * Where the Linear credentials would come from for the job on this host. Launchd never
 * forwards a shell-exported value (its plist sets the job's env), so there only the Keychain counts.
 */
export const linearAuthSource = (
  host: 'launchd' | 'container' | null,
  env: NodeJS.ProcessEnv,
  files: { app: boolean; key: boolean } = { app: false, key: false }
):
  | 'app-env'
  | 'app-file'
  | 'key-env'
  | 'key-file'
  | 'keychain-possible'
  | 'none' =>
  host === 'container'
    ? env[LINEAR_CLIENT_ID_ENV] && env[LINEAR_CLIENT_SECRET_ENV]
      ? 'app-env'
      : files.app
        ? 'app-file'
        : env[LINEAR_KEY_ENV]
          ? 'key-env'
          : files.key
            ? 'key-file'
            : 'none'
    : host === 'launchd'
      ? 'keychain-possible'
      : 'none';

/** The files the container's Linear credentials are read from: the env's paths, else the image's */
export const linearCredentialFiles = (
  env: NodeJS.ProcessEnv
): { app: string; key: string } => ({
  app: env[LINEAR_APP_FILE_ENV] || CONTAINER_LINEAR_APP_FILE,
  key: env[LINEAR_KEY_FILE_ENV] || CONTAINER_LINEAR_KEY_FILE
});

/** A path as zsh's `${(q)…}` writes it, so the helper string matches lib.sh's own */
export const zshQuote = (path: string): string =>
  path.replace(/[^\w./-]/g, (char) => `\\${char}`);

/** The `agent_linear` MCP server attended sessions use: Linear's endpoint signed by the installed lib.sh */
export const attendedLinearServer = (
  libPath: string
): { type: 'http'; url: string; headersHelper: string } => ({
  type: 'http',
  url: 'https://mcp.linear.app/mcp',
  headersHelper: `zsh ${zshQuote(libPath)} header`
});

/** Whether a parsed `~/.claude.json` already holds the expected `agent_linear` server */
export const attendedLinearServerCurrent = (
  config: unknown,
  libPath: string
): boolean => {
  const servers =
    typeof config === 'object' && config !== null
      ? (config as { mcpServers?: unknown }).mcpServers
      : undefined;
  const server =
    typeof servers === 'object' && servers !== null
      ? (servers as Record<string, unknown>)['agent_linear']
      : undefined;
  const want = attendedLinearServer(libPath);
  return (
    typeof server === 'object' &&
    server !== null &&
    Object.entries(want).every(
      ([k, v]) => (server as Record<string, unknown>)[k] === v
    )
  );
};

/** The `agent_linear` server in a parsed `~/.claude.json`: absent, as expected, or another shape */
export const linearServerState = (
  config: unknown,
  libPath: string
): 'missing' | 'current' | 'stale' => {
  if (attendedLinearServerCurrent(config, libPath)) return 'current';
  const servers =
    typeof config === 'object' && config !== null
      ? (config as { mcpServers?: unknown }).mcpServers
      : undefined;
  return typeof servers === 'object' &&
    servers !== null &&
    'agent_linear' in servers
    ? 'stale'
    : 'missing';
};

/** Where the queue's files live in the repo, relative to the workspace root */
export const QUEUE_SOURCE_DIR = 'tools/cdwr/agent-queue';
/** The files install puts in the queue home; run.sh loads the rest from beside it */
export const QUEUE_FILES = [
  'run.sh',
  'implement.sh',
  'github-app.sh',
  'checkin.sh',
  'lib.sh',
  'waits.sh',
  'watch.jq',
  'notify.sh',
  'telemetry.sh'
] as const;
export type QueueFile = (typeof QUEUE_FILES)[number];

/** One value per queue file; the return type keeps it exhaustive */
export const byFile = <T>(
  fn: (file: QueueFile) => T
): Record<QueueFile, T> => ({
  'run.sh': fn('run.sh'),
  'implement.sh': fn('implement.sh'),
  'github-app.sh': fn('github-app.sh'),
  'checkin.sh': fn('checkin.sh'),
  'lib.sh': fn('lib.sh'),
  'waits.sh': fn('waits.sh'),
  'watch.jq': fn('watch.jq'),
  'notify.sh': fn('notify.sh'),
  'telemetry.sh': fn('telemetry.sh')
});
/** What the queue scripts call; their directories make up the job's PATH */
export const QUEUE_BINARIES = ['node', 'claude', 'jq', 'git', 'gh', 'pnpm'];
/** Daily API-equivalent spend cap for implementing sessions, in USD */
export const IMPLEMENT_CAP_USD = 40;
/** Per-run budget for an implementing session, in USD; implement.sh has the same default */
export const IMPLEMENT_BUDGET_USD = 15;
/** Daily suggest session: budget in USD, the local hour it may start after, days between runs */
export const SUGGEST_BUDGET_USD = 5;
export const SUGGEST_HOUR = 6;
export const SUGGEST_DAYS = 1;

export interface SuggestSettings {
  budgetUsd: number;
  hour: number;
  days: number;
}

const readNonNegativeInt = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  max?: number
): number => {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new CliError(`${name} must be a non-negative integer, got ${value}`);
  }
  if (max !== undefined && Number(value) > max) {
    throw new CliError(`${name} must be at most ${max}, got ${value}`);
  }
  return Number(value);
};

/** The suggest session's settings: the environment when set, the defaults otherwise */
export const suggestSettings = (env: NodeJS.ProcessEnv): SuggestSettings => ({
  budgetUsd: readNonNegativeInt(
    env,
    'AGENT_QUEUE_SUGGEST_BUDGET_USD',
    SUGGEST_BUDGET_USD
  ),
  hour: readNonNegativeInt(env, 'AGENT_QUEUE_SUGGEST_HOUR', SUGGEST_HOUR, 23),
  days: readNonNegativeInt(env, 'AGENT_QUEUE_SUGGEST_DAYS', SUGGEST_DAYS)
});

/** Weekly devlog session: budget in USD, days between runs; it starts after SUGGEST_HOUR */
export const DEVLOG_BUDGET_USD = 5;
export const DEVLOG_DAYS = 7;

export interface DevlogSettings {
  budgetUsd: number;
  days: number;
}

/** The devlog session's settings: the environment when set, the defaults otherwise */
export const devlogSettings = (env: NodeJS.ProcessEnv): DevlogSettings => ({
  budgetUsd: readNonNegativeInt(
    env,
    'AGENT_QUEUE_DEVLOG_BUDGET_USD',
    DEVLOG_BUDGET_USD
  ),
  days: readNonNegativeInt(env, 'AGENT_QUEUE_DEVLOG_DAYS', DEVLOG_DAYS)
});

/** Claude Code names a project's directory after its path, every character but letters and digits becoming `-` */
export const memoryDir = (userHome: string, repoRoot: string): string =>
  join(
    userHome,
    '.claude',
    'projects',
    repoRoot.replace(/[^A-Za-z0-9]/g, '-'),
    'memory'
  );

/** Files a worktree needs but git does not carry, relative to the workspace root */
export const ENV_COPIES = ['apps/cms/.env.local', 'tools/cdwr/.env'];
/** Pref holding the worktree the queue plans in */
export const WORKTREE_PREF = 'agentWorktree';

export interface QueuePaths {
  home: string;
  script: string;
  files: Record<QueueFile, string>;
  watchState: string;
  paused: string;
  notifyLevel: string;
  mirror: string;
  lock: string;
  implementLock: string;
  implementSpend: string;
  /** The PR limit the desk sets; absent means the default */
  limit: string;
  /** The daily implementing cap in dollars the desk sets; absent means the env or default */
  implementCap: string;
  /** The container loop's pid, which a SIGUSR1 wakes; written by the image's entrypoint */
  loopPid: string;
  runs: string;
  logs: string;
  schedulerLog: string;
  launchdLog: string;
  plist: string;
}

export const queuePaths = (
  cdwrHomeDir: string,
  userHome: string
): QueuePaths => {
  const home = join(cdwrHomeDir, 'agent-queue');
  const logs = join(home, 'logs');
  return {
    home,
    script: join(home, 'run.sh'),
    files: byFile((file) => join(home, file)),
    watchState: join(home, 'watch.json'),
    paused: join(home, 'paused'),
    notifyLevel: join(home, 'notify-level'),
    mirror: join(home, 'mirror'),
    lock: join(home, 'lock'),
    implementLock: join(home, 'implement.lock'),
    implementSpend: join(home, 'implement-spend.jsonl'),
    limit: join(home, 'limit'),
    implementCap: join(home, 'implement-cap'),
    loopPid: join(home, 'loop.pid'),
    runs: join(home, 'runs.jsonl'),
    logs,
    schedulerLog: join(logs, 'scheduler.log'),
    launchdLog: join(logs, 'launchd.log'),
    plist: join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`)
  };
};

/** The container loop's pid from its `loop.pid`; undefined when absent or not a pid */
export const parseLoopPid = (text: string | undefined): number | undefined => {
  const pid = Number(text?.trim());
  // The entrypoint is often pid 1 in its container
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
};

export const NOTIFY_LEVELS = ['all', 'action'] as const;
export type NotifyLevel = (typeof NOTIFY_LEVELS)[number];

/** A missing or unreadable level file means all */
export const parseNotifyLevel = (text: string | undefined): NotifyLevel =>
  NOTIFY_LEVELS.find((level) => level === text?.trim()) ?? 'all';

/** A check holds the lock for seconds; older than this with no job running, nothing does */
export const STALE_LOCK_MS = 10 * 60_000;

export type LockState = 'free' | 'held' | 'stale';

/** Whether the runner's lock is free, held by a run or check, or left by one that died */
export const lockState = (
  ageMs: number | undefined,
  running: boolean
): LockState =>
  ageMs === undefined
    ? 'free'
    : running || ageMs < STALE_LOCK_MS
      ? 'held'
      : 'stale';

/**
 * Whether this machine runs the scheduler. Only a Mac with no job loaded and no plist left is
 * attended-only; a plist that is not loaded is a broken install and stays reported.
 */
export const schedulerHere = (
  host: 'launchd' | 'container',
  job: { loaded: boolean },
  plistExists: boolean
): boolean => host === 'container' || job.loaded || plistExists;

/** What `install` found on a Mac; the scheduler facts are only read when the scheduler is set up */
export interface InstallFacts {
  /** A job is loaded or its plist is left: `schedulerHere` on a Mac */
  schedulerHere: boolean;
  /** `--scheduler` was given */
  schedulerFlag: boolean;
  scripts: 'missing' | 'current' | 'stale';
  appCredentials: boolean;
  linearServerCurrent: boolean;
  scheduler: {
    worktreeExists: boolean;
    envCopies: string[];
    depsInstalled: boolean;
    plistCurrent: boolean;
    jobLoaded: boolean;
    /** The loaded job runs the installed `run.sh` */
    jobScriptCurrent: boolean;
  };
}

export interface InstallWork {
  /** The scheduler parts are set up: asked for, or already on this Mac */
  scheduler: boolean;
  worktree: boolean;
  envCopies: string[];
  deps: boolean;
  script: boolean;
  plist: boolean;
  reload: boolean;
  credentials: boolean;
  mcp: boolean;
}

/**
 * What `install` does on a Mac. The attended side (the script copies, the Linear app's
 * credentials, `agent_linear`) always; the scheduler's worktree, plist and load only when
 * `--scheduler` asks or a job is already here, so a plain install keeps an existing job current.
 */
export const installWork = (facts: InstallFacts): InstallWork => {
  const scheduler = facts.schedulerFlag || facts.schedulerHere;
  const s = facts.scheduler;
  const plist = scheduler && !s.plistCurrent;
  return {
    scheduler,
    worktree: scheduler && !s.worktreeExists,
    envCopies: scheduler ? s.envCopies : [],
    deps: scheduler && !s.depsInstalled,
    script: facts.scripts !== 'current',
    plist,
    reload: scheduler && (plist || !s.jobLoaded || !s.jobScriptCurrent),
    credentials: !facts.appCredentials,
    mcp: !facts.linearServerCurrent
  };
};

/**
 * How old a remote `queue_state` row may be before `status` calls its watch stale. Matches `STALE_MS`
 * in the desk-command function and is longer than the NUC's hourly fallback run.
 */
export const STALE_WATCH_MS = 2 * 60 * 60 * 1000;

/** Where `run.sh --check` took the watch state from */
export type WatchSource =
  | { kind: 'local' }
  | { kind: 'remote'; host: string; at: string; ageMs: number }
  | { kind: 'fallback' }
  | { kind: 'unknown' };

/** The check's `watch-source:` text: `local`, `<host> · <at ISO>` or `local, remote unreadable` */
export const parseWatchSource = (line: string, now: Date): WatchSource => {
  const text = line.trim();
  if (text === 'local') return { kind: 'local' };
  if (text === 'local, remote unreadable') return { kind: 'fallback' };
  const [host, at] = text.split(' · ');
  const time = at === undefined ? Number.NaN : Date.parse(at);
  if (!host || at === undefined || Number.isNaN(time)) {
    return { kind: 'unknown' };
  }
  return {
    kind: 'remote',
    host,
    at,
    ageMs: Math.max(0, now.getTime() - time)
  };
};

const formatAgo = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
};

/** The `watch` row's text for a source */
export const formatWatchSource = (source: WatchSource): string => {
  switch (source.kind) {
    case 'local':
      return 'local';
    case 'remote':
      return `${source.host}, ${formatAgo(source.ageMs)}`;
    case 'fallback':
      return "local (the NUC's row is unreadable)";
    case 'unknown':
      return 'unknown';
  }
};

export const serviceTarget = (uid: number): string => `gui/${uid}/${LABEL}`;
export const domainTarget = (uid: number): string => `gui/${uid}`;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export interface PlistInput {
  script: string;
  home: string;
  repo: string;
  path: string;
  /** The dev checkout's Claude memory directory, where the suggest session may write */
  memoryDir: string;
  suggest: SuggestSettings;
  devlog: DevlogSettings;
}

export const renderPlist = ({
  script,
  home,
  repo,
  path,
  memoryDir,
  suggest,
  devlog
}: PlistInput): string => {
  const e = escapeXml;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${e(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${e(script)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${e(path)}</string>
    <key>AGENT_QUEUE_HOME</key>
    <string>${e(home)}</string>
    <key>AGENT_QUEUE_REPO</key>
    <string>${e(repo)}</string>
    <key>AGENT_QUEUE_IMPLEMENT_CAP_USD</key>
    <string>${IMPLEMENT_CAP_USD}</string>
    <key>AGENT_QUEUE_SUGGEST_BUDGET_USD</key>
    <string>${suggest.budgetUsd}</string>
    <key>AGENT_QUEUE_SUGGEST_HOUR</key>
    <string>${suggest.hour}</string>
    <key>AGENT_QUEUE_SUGGEST_DAYS</key>
    <string>${suggest.days}</string>
    <key>AGENT_QUEUE_DEVLOG_BUDGET_USD</key>
    <string>${devlog.budgetUsd}</string>
    <key>AGENT_QUEUE_DEVLOG_DAYS</key>
    <string>${devlog.days}</string>
    <key>AGENT_QUEUE_MEMORY_DIR</key>
    <string>${e(memoryDir)}</string>
  </dict>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StartInterval</key>
  <integer>${RUN_INTERVAL_SECONDS}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${e(join(home, 'logs', 'launchd.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${e(join(home, 'logs', 'launchd.log'))}</string>
</dict>
</plist>
`;
};

export interface JobState {
  running: boolean;
  runs?: number;
  lastExitCode?: number;
  script?: string;
  intervalSeconds?: number;
}

/** Reads the top-level keys of `launchctl print`; nested blocks are ignored */
export const parseLaunchctlPrint = (text: string): JobState => {
  const state: JobState = { running: false };
  let inArguments = false;
  let lastArgument: string | undefined;

  for (const line of text.split('\n')) {
    if (inArguments) {
      if (line.startsWith('\t\t')) {
        lastArgument = line.trim();
        continue;
      }
      inArguments = false;
    }
    const match = /^\t([^\t].*)$/.exec(line);
    if (!match?.[1]) continue;
    const entry = match[1];
    if (entry === 'arguments = {') {
      inArguments = true;
      continue;
    }
    const pair = /^([^=]+?) = (.*)$/.exec(entry);
    if (!pair) continue;
    const [, key, value = ''] = pair;
    switch (key) {
      case 'state':
        state.running = value.trim() === 'running';
        break;
      case 'runs':
        if (/^\d+$/.test(value.trim())) state.runs = Number(value);
        break;
      case 'last exit code':
        if (/^-?\d+$/.test(value.trim())) state.lastExitCode = Number(value);
        break;
      case 'run interval': {
        const seconds = /^(\d+) seconds?$/.exec(value.trim());
        if (seconds?.[1]) state.intervalSeconds = Number(seconds[1]);
        break;
      }
    }
  }
  if (lastArgument) state.script = lastArgument;
  return state;
};

const RUN_LOG = /^\d{4}-\d{2}-\d{2}_\d{4}\.log$/;

/** The newest `YYYY-MM-DD_HHMM.log`, by name */
export const latestRunLog = (fileNames: string[]): string | undefined =>
  fileNames
    .filter((name) => RUN_LOG.test(name))
    .sort()
    .at(-1);

const nonEmptyLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop();
  return lines;
};

export const lastSchedulerLine = (
  text: string
): { at: string; message: string } | undefined => {
  const last = nonEmptyLines(text).at(-1);
  const match = last
    ? /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (.*)$/.exec(last)
    : null;
  return match?.[1] ? { at: match[1], message: match[2] ?? '' } : undefined;
};

export const tailLines = (text: string, n: number): string[] => {
  const lines = nonEmptyLines(text);
  return n <= 0 ? [] : lines.slice(-n);
};

/** The agent container's name and its queue log folder, as `cdwr agent logs --host` reaches them */
export const REMOTE_CONTAINER = 'cdwr-agent';
export const REMOTE_LOGS = '/home/agent/.cdwr/agent-queue/logs';
const REMOTE_SCHEDULER_LOG = `${REMOTE_LOGS}/scheduler.log`;

/** ssh's arguments for a command in the agent container; each element is one argv entry, nothing is quoted */
export const remoteExec = (host: string, command: string[]): string[] => [
  host,
  'docker',
  'exec',
  REMOTE_CONTAINER,
  ...command
];

/** The checkout the queue plans in, inside the agent container */
export const REMOTE_CHECKOUT = '/work/codeware-agent';
/** Fetches the vault secrets, exports them and runs the command it is given */
export const REMOTE_SECRETS = '/opt/agent-host/secrets.sh';

/** ssh's arguments for `cdwr <args>` in the agent container on `host`, run in its checkout through `secrets.sh` */
export const remoteCdwr = (host: string, args: string[]): string[] => [
  host,
  'docker',
  'exec',
  '-w',
  REMOTE_CHECKOUT,
  REMOTE_CONTAINER,
  REMOTE_SECRETS,
  'node',
  'tools/cdwr/bin/cdwr.mjs',
  ...args
];

export const remoteListLogs = (host: string): string[] =>
  remoteExec(host, ['ls', '-1', REMOTE_LOGS]);

/** The file to read: the scheduler log, or the newest run log among `fileNames` (undefined when none) */
export const remoteLogFile = (
  run: boolean,
  fileNames: string[]
): string | undefined => {
  if (!run) return REMOTE_SCHEDULER_LOG;
  const latest = latestRunLog(fileNames);
  return latest ? `${REMOTE_LOGS}/${latest}` : undefined;
};

/** `lines` from the end of `file`, or the whole file when `lines` is 0 */
export const remoteReadLog = (
  host: string,
  file: string,
  lines: number
): string[] =>
  remoteExec(
    host,
    lines > 0 ? ['tail', '-n', String(lines), file] : ['cat', file]
  );

const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/** PATH for the job: the given dirs first, then the system ones, no repeats */
export const launchPath = (binaryDirs: string[]): string =>
  [...new Set([...binaryDirs, ...SYSTEM_PATH])].join(':');

export type CapSource = 'file' | 'env' | 'default';

/**
 * The daily cap and where it came from: the desk's `implement-cap` file when it holds a
 * number of 0 or more (0 stops launching), else the env value when it is a positive
 * number, else the default
 */
export const implementCapSource = (
  value: string | undefined,
  file?: string
): { cap: number; source: CapSource } => {
  // The file in the form implement_cap() in run.sh accepts, so the two read it alike
  const text = file?.trim() ?? '';
  if (/^\d+(\.\d+)?$/.test(text)) return { cap: Number(text), source: 'file' };
  const n = Number(value);
  return value?.trim() && Number.isFinite(n) && n > 0
    ? { cap: n, source: 'env' }
    : { cap: IMPLEMENT_CAP_USD, source: 'default' };
};

/** The daily cap; see `implementCapSource` */
export const implementCap = (
  value: string | undefined,
  file?: string
): number => implementCapSource(value, file).cap;

export const DEFAULT_QUEUE_LIMIT = 5;

/** The PR limit and where it came from: the desk's `limit` file when it holds a whole number from 1 to 20, else the default */
export const queueLimit = (
  file: string | undefined
): { value: number; source: 'file' | 'default' } => {
  const text = file?.trim() ?? '';
  const n = Number(text);
  return /^\d+$/.test(text) && n >= 1 && n <= 20
    ? { value: n, source: 'file' }
    : { value: DEFAULT_QUEUE_LIMIT, source: 'default' };
};

/** The per-run budget: the env value when it is a positive number, else the default */
export const implementBudget = (value: string | undefined): number => {
  const n = Number(value);
  return value?.trim() && Number.isFinite(n) && n > 0
    ? n
    : IMPLEMENT_BUDGET_USD;
};

const jsonLines = (text: string | undefined): Record<string, unknown>[] =>
  (text ?? '').split('\n').flatMap((line) => {
    try {
      const row: unknown = JSON.parse(line);
      return typeof row === 'object' && row !== null && !Array.isArray(row)
        ? [row as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });

/**
 * Sum of the ledger's costs for one day (YYYY-MM-DD). Correction rows may be
 * negative, and a day that sums below zero reads 0, as run.sh's guard does.
 * Undefined when any line is unreadable: a bad line is not zero spend.
 */
export const spendForDay = (
  ledger: string | undefined,
  day: string
): number | undefined => {
  let sum = 0;
  for (const line of (ledger ?? '').split('\n')) {
    if (line.trim() === '') continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      return undefined;
    }
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return undefined;
    }
    const cost = (row as Record<string, unknown>)['cost'];
    if (typeof cost !== 'number' || !Number.isFinite(cost)) return undefined;
    if ((row as Record<string, unknown>)['day'] === day) sum += cost;
  }
  return Math.max(0, sum);
};

export const IMPLEMENT_OUTCOMES = [
  'launched',
  'implemented',
  'untried',
  'cap',
  'failed'
] as const;

export interface ImplementRun {
  when: string;
  outcome: (typeof IMPLEMENT_OUTCOMES)[number];
  ticket: string;
}

/** The last runs.jsonl row an implementing session wrote */
export const lastImplementRun = (
  runs: string | undefined
): ImplementRun | undefined => {
  const row = jsonLines(runs)
    // Planning runs write cap and failed rows too, without a ticket
    .filter(
      (r) =>
        IMPLEMENT_OUTCOMES.some((o) => o === r['outcome']) &&
        typeof r['ticket'] === 'string' &&
        r['ticket'] !== ''
    )
    .at(-1);
  if (!row) return undefined;
  return {
    when: String(row['when'] ?? ''),
    outcome: row['outcome'] as ImplementRun['outcome'],
    ticket: String(row['ticket'] ?? '')
  };
};

export const formatImplement = (
  spent: number | undefined,
  cap: number,
  last: ImplementRun | undefined,
  budget = IMPLEMENT_BUDGET_USD,
  capSource: CapSource = 'default'
): string =>
  spent === undefined
    ? 'implement spend unreadable: implement-spend.jsonl has a bad line; no launch until it is fixed'
    : [
        `implement spend today $${spent.toFixed(2)} of $${cap}${capSource === 'file' ? ' (desk)' : capSource === 'env' ? ' (env)' : ''}${spent >= cap ? ` (over; a run may overshoot by its $${budget} budget)` : ''}`,
        last
          ? `last ${last.outcome}${last.ticket ? ` ${last.ticket}` : ''}${last.when ? ` (${last.when})` : ''}`
          : 'no implementing session yet'
      ].join(', ');

/** The PATH in the installed job plist's EnvironmentVariables; undefined when absent or empty */
export const plistPath = (plist: string | undefined): string | undefined => {
  const value =
    /<key>EnvironmentVariables<\/key>\s*<dict>[\s\S]*?<key>PATH<\/key>\s*<string>([^<]*)<\/string>/.exec(
      plist ?? ''
    )?.[1];
  const path = value
    ?.replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
  return path ? path : undefined;
};

/** The `AGENT_QUEUE_*` entries in the installed job plist's EnvironmentVariables, as `renderPlist` wrote them */
export const installedEnv = (plistText: string): Record<string, string> => {
  const unescape = (value: string): string =>
    value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const entries = [
    ...plistText.matchAll(
      /<key>(AGENT_QUEUE_[A-Z0-9_]+)<\/key>\s*<string>([^<]*)<\/string>/g
    )
  ].flatMap(([, name, value]) =>
    name === undefined || value === undefined
      ? []
      : [[name, unescape(value)] as const]
  );
  return Object.fromEntries(entries);
};

/** The major version in `node --version` output, e.g. `v22.3.0` */
export const nodeMajor = (version: string): number | undefined => {
  const major = /^v?(\d+)\./.exec(version.trim())?.[1];
  return major === undefined ? undefined : Number(major);
};

export const drift = (
  installed: string | undefined,
  source: string
): 'missing' | 'current' | 'stale' =>
  installed === undefined
    ? 'missing'
    : installed === source
      ? 'current'
      : 'stale';

/** Missing if any file is missing, else stale if any differs */
export const filesDrift = (
  installed: Record<QueueFile, string | undefined>,
  source: Record<QueueFile, string>
): 'missing' | 'current' | 'stale' => {
  const each = QUEUE_FILES.map((file) => drift(installed[file], source[file]));
  return each.includes('missing')
    ? 'missing'
    : each.includes('stale')
      ? 'stale'
      : 'current';
};

export const WATCH_STATES = [
  'open',
  'queued',
  'failing',
  'merged',
  'closed'
] as const;
export type WatchState = (typeof WATCH_STATES)[number];

export interface WatchEntry {
  ticket: string;
  pr: number;
  state: WatchState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const watchStateOf = (value: unknown): WatchState | undefined =>
  WATCH_STATES.find((state) => state === value);

const ticketNumber = (ticket: string): number =>
  Number(/(\d+)$/.exec(ticket)?.[1] ?? 0);

/** The PRs the queue watches, from watch.json; anything unreadable is left out */
export const parseWatchState = (text: string | undefined): WatchEntry[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? '');
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  const entries: WatchEntry[] = [];
  for (const [ticket, value] of Object.entries(parsed)) {
    if (!isRecord(value)) continue;
    const { pr } = value;
    const state = watchStateOf(value['state']);
    if (typeof pr === 'number' && state) entries.push({ ticket, pr, state });
  }
  return entries.sort(
    (a, b) => ticketNumber(a.ticket) - ticketNumber(b.ticket)
  );
};

/** Counts per state; unfinished states are listed by ticket and PR */
export const formatWatching = (entries: WatchEntry[]): string => {
  if (entries.length === 0) return '';
  const groups = WATCH_STATES.flatMap((state) => {
    const of = entries.filter((e) => e.state === state);
    if (of.length === 0) return [];
    if (state === 'merged' || state === 'closed')
      return [`${of.length} ${state}`];
    const list = of.map((e) => `${e.ticket} #${e.pr}`).join(', ');
    return [`${of.length} ${state} (${list})`];
  });
  return `${entries.length} PR${entries.length === 1 ? '' : 's'}: ${groups.join(', ')}`;
};

const SUMMARY_MAX = 60;
const SCHEDULER_TICKET = /\bCOD-\d+\b/;
/** implement.sh's verdicts, which follow its `implement:` prefix */
const IMPLEMENT_VERDICTS = [
  'fail',
  'done',
  'untried',
  'busy',
  'launch',
  'cap',
  'skip',
  'warn'
];

const cutAt = (text: string): string =>
  text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;

/** Drops a closing parenthesis the segment never opened */
const withoutDanglingParen = (segment: string): string => {
  const count = (char: string) => segment.split(char).length - 1;
  return segment.endsWith(')') && count(')') > count('(')
    ? segment.slice(0, -1).trimEnd()
    : segment;
};

/** Cuts a ` (…` tail the segment never closes, as when a reason holding `:` was split */
const withoutOpenParen = (segment: string): string => {
  const count = (char: string) => segment.split(char).length - 1;
  return count('(') > count(')')
    ? withoutOpenParen(segment.slice(0, segment.lastIndexOf('(')).trimEnd())
    : segment;
};

/** The kind and the ticket (or first detail) of a scheduler line, short enough for a table cell */
export const summarizeSchedulerLine = (message: string): string => {
  const [kindPart = '', ...restParts] = message.split(':');
  let kind = kindPart.trim();
  let rest = restParts.join(':');

  if (kind === 'implement') {
    const verdict = /^\s*(\w+):/.exec(rest);
    if (verdict?.[1] && IMPLEMENT_VERDICTS.includes(verdict[1])) {
      kind = `implement ${verdict[1]}`;
      rest = rest.slice(verdict[0].length);
    }
  }

  const all = rest
    .split(/:| · /)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
  // A reason holding `:` was split; it ends the line, so it and what follows go
  const open = all.findIndex(
    (segment) => withoutOpenParen(segment) !== segment
  );
  const segments =
    open < 0
      ? all
      : [...all.slice(0, open), withoutOpenParen(all[open] ?? '')].filter(
          (segment) => segment !== ''
        );
  const at = segments.findIndex((segment) => SCHEDULER_TICKET.test(segment));
  const first = segments[0];
  let detail = first ?? '';
  if (at >= 0) {
    const outcome = segments[at + 1];
    const ticketSegment = segments[at] ?? '';
    const ticket = withoutDanglingParen(
      outcome ? `${ticketSegment}: ${outcome}` : ticketSegment
    );
    const joined = at > 0 && first ? `${first} · ${ticket}` : ticket;
    detail = joined.length <= SUMMARY_MAX ? joined : ticket;
  }
  const cut = cutAt(detail);
  return cut ? `${kind} · ${cut}` : kind;
};

export interface QueueCheck {
  kind: 'idle' | 'ready' | 'busy' | 'skip' | 'unknown';
  tickets: string[];
  text: string;
}

/** Reads the decision line `run.sh --check` prints last */
export const parseCheck = (line: string): QueueCheck => {
  const text = line.trim();
  const tickets = text.match(/[A-Z][A-Z0-9]*-\d+/g) ?? [];
  if (text.startsWith('idle:')) return { kind: 'idle', tickets: [], text };
  if (text.startsWith('would plan one of:'))
    return { kind: 'ready', tickets, text };
  if (text.startsWith('busy:')) return { kind: 'busy', tickets: [], text };
  if (text.startsWith('skip:')) return { kind: 'skip', tickets: [], text };
  return { kind: 'unknown', tickets: [], text };
};

export interface AttendedCheck {
  kind: 'running' | 'run' | 'idle' | 'unknown';
  ticket?: string;
  text: string;
}

/** Reads the text after `attended: ` in the `run.sh --check` output */
export const parseAttended = (line: string): AttendedCheck => {
  const text = line.trim();
  const ticket = text.match(/[A-Z][A-Z0-9]*-\d+/)?.[0];
  if (text.startsWith('running:')) return { kind: 'running', ticket, text };
  if (text.startsWith('run now:')) return { kind: 'run', ticket, text };
  if (text.startsWith('idle:')) return { kind: 'idle', text };
  return { kind: 'unknown', text };
};

export interface LinearCheck {
  kind: 'ok' | 'missing' | 'unknown';
  text: string;
}

/** Reads the text after `linear: ` in the `run.sh --check` output */
export const parseLinear = (line: string): LinearCheck => {
  const text = line.trim();
  const ok = /^ok \((key|connector)\)$/.exec(text);
  if (ok) return { kind: 'ok', text: `ok, ${ok[1]} mode` };
  const missing = /^missing \((.+)\)$/.exec(text);
  if (missing) return { kind: 'missing', text: missing[1] };
  return { kind: 'unknown', text };
};

export interface SuggestCheck {
  kind: 'due' | 'done' | 'early' | 'skipped' | 'off' | 'unknown';
  focus?: string;
  ticket?: string;
  text: string;
}

/** Reads the text after `suggest: ` in the `run.sh --check` output */
export const parseSuggest = (line: string): SuggestCheck => {
  const text = line.trim();
  if (text === 'off') return { kind: 'off', text };
  if (text === 'done today') return { kind: 'done', text };
  if (text.startsWith('not before ')) return { kind: 'early', text };
  const due = /^due \(focus (\S+)\)$/.exec(text);
  if (due) return { kind: 'due', focus: due[1], text };
  const skipped = /^skipped, ([A-Z][A-Z0-9]*-\d+) is open$/.exec(text);
  if (skipped) return { kind: 'skipped', ticket: skipped[1], text };
  return { kind: 'unknown', text };
};

export interface DevlogCheck {
  kind: 'due' | 'done' | 'early' | 'off' | 'unknown';
  text: string;
}

/** Reads the text after `devlog: ` in the `run.sh --check` output */
export const parseDevlog = (line: string): DevlogCheck => {
  const text = line.trim();
  if (text === 'off') return { kind: 'off', text };
  if (text.startsWith('done')) return { kind: 'done', text };
  if (text.startsWith('not before ')) return { kind: 'early', text };
  if (text === 'due') return { kind: 'due', text };
  return { kind: 'unknown', text };
};

const ticketSchema = z.string();
const prSchema = z.number().nullable();

/** A sub-issue ready to label; the parent may be unknown */
const labelEntrySchema = z.object({
  ticket: ticketSchema,
  parent: ticketSchema.nullable(),
  blockers: z.array(ticketSchema)
});

/** A gap the audit found: a ticket state only a person or a session can resolve */
const gapSchema = z.object({
  id: z.string(),
  ticket: ticketSchema,
  kind: z.string(),
  what: z.string(),
  fix: z.string()
});

const treeLeafSchema = z.object({
  ticket: ticketSchema,
  title: z.string().nullable(),
  state: z.string().nullable(),
  label: z.string().nullable(),
  pr: prSchema,
  blockers: z.array(ticketSchema),
  gaps: z.array(z.string())
});

/** A parent or an agent ticket with its sub-issues */
const treeRootSchema = treeLeafSchema.extend({
  children: z.array(treeLeafSchema.extend({ children: z.array(z.unknown()) }))
});

/** The entries that parse; a malformed one drops alone */
const tolerant = <T extends z.ZodType>(entry: T) =>
  z
    .array(z.unknown())
    .default([])
    .transform((entries) =>
      entries.flatMap((e) => {
        const result = entry.safeParse(e);
        return result.success ? [result.data] : [];
      })
    );

export const queueViewSchema = z.object({
  at: z.string(),
  limit: z.object({ used: z.number(), max: z.number() }),
  session: z
    .object({
      state: z.enum(['alive', 'waiting', 'stopped', 'none']),
      detail: z.string().nullable(),
      id: z.string().nullable(),
      ticket: z.string().nullable(),
      lastSeen: z.string().nullable()
    })
    .nullable(),
  next: z.array(
    z.object({
      ticket: ticketSchema,
      reason: z.enum([
        'resume',
        'take over',
        'answered',
        'review feedback',
        'conflicts with main',
        'merged comment',
        'parked wait resolved',
        'renovate',
        'ready'
      ]),
      detail: z.string().nullable()
    })
  ),
  held: z.object({
    tickets: z.array(ticketSchema),
    free: z.array(
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('review'),
          ticket: ticketSchema,
          pr: prSchema
        }),
        z.object({
          action: z.literal('wait'),
          ticket: ticketSchema,
          pr: z.number()
        }),
        z.object({ action: z.literal('limit'), value: z.number() })
      ])
    )
  }),
  // Older queue views have no blocked
  blocked: z
    .array(z.object({ ticket: ticketSchema, blockers: z.array(ticketSchema) }))
    .default([]),
  // Older queue views have no refused
  refused: z
    .array(z.object({ ticket: ticketSchema, reason: z.string() }))
    .default([]),
  // Older queue views have no parked
  parked: z
    .array(
      z.object({
        ticket: ticketSchema,
        wait: z.enum(['copilot', 'ci']),
        pr: z.number(),
        since: z.string(),
        resolved: z.boolean(),
        outcome: z.string().nullable()
      })
    )
    .default([]),
  // Older queue views have no renovate
  renovate: z
    .array(
      z.object({
        pr: z.number(),
        title: z.string(),
        state: z.enum(['failing', 'conflicting', 'tended']),
        ticket: ticketSchema.nullable()
      })
    )
    .default([]),
  // Older queue views have no audit or tree
  audit: tolerant(gapSchema),
  tree: tolerant(treeRootSchema),
  table: z.object({
    before: z.array(
      z.object({ ticket: ticketSchema, kind: z.enum(['plan', 'question']) })
    ),
    after: z.array(
      z.discriminatedUnion('kind', [
        z.object({ ticket: ticketSchema, kind: z.literal('pr'), pr: prSchema }),
        z.object({
          ticket: ticketSchema,
          kind: z.literal('handoffs'),
          items: z.array(z.string())
        })
      ])
    ),
    // Older queue views have no label; a malformed entry drops alone, as in the desk
    label: z
      .array(z.unknown())
      .default([])
      .transform((entries) =>
        entries.flatMap((entry) => {
          const result = labelEntrySchema.safeParse(entry);
          return result.success ? [result.data] : [];
        })
      )
  })
});

export type QueueView = z.infer<typeof queueViewSchema>;

/** Reads the text after `queue-view: ` in the `run.sh --check` output; never throws */
export const parseQueueView = (text: string): QueueView | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const result = queueViewSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
};

export const formatNext = (view: QueueView): string =>
  view.next
    .map((n) => `${n.ticket} ${n.reason}${n.detail ? ` (${n.detail})` : ''}`)
    .join(', ') || 'nothing';

export const formatHeld = (view: QueueView): string => {
  const { tickets, free } = view.held;
  const slots = free.map((f) =>
    f.action === 'review'
      ? `review ${f.ticket}${f.pr === null ? '' : ` (#${f.pr})`}`
      : f.action === 'wait'
        ? `wait ${f.ticket} (#${f.pr})`
        : `limit=${f.value}`
  );
  const held = tickets.join(', ');
  return held === ''
    ? 'nothing'
    : slots.length > 0
      ? `${held}; free a slot: ${slots.join(', ')}`
      : held;
};

export const formatBlocked = (view: QueueView): string =>
  view.blocked
    .map((b) => `${b.ticket} after ${b.blockers.join(', ')}`)
    .join('; ') || 'nothing';

export const formatRefused = (view: QueueView): string =>
  view.refused.map((r) => `${r.ticket} (${r.reason})`).join(', ') || 'nothing';

export const formatParked = (view: QueueView): string =>
  view.parked
    .map(
      (p) =>
        `${p.ticket} ${p.wait} PR #${p.pr} since ${p.since.slice(11, 16)}Z` +
        (p.resolved ? ` (resolved: ${p.outcome})` : '')
    )
    .join(', ') || 'nothing';

export const formatRenovate = (view: QueueView): string =>
  view.renovate
    .map(
      (r) =>
        `PR #${r.pr} ${r.state === 'tended' && r.ticket ? `tended by ${r.ticket}` : r.state} · ${r.title}`
    )
    .join('; ') || 'nothing';

/** One line per gap of the audit, for the Gaps section of `status` */
export const formatGaps = (view: QueueView): string[] =>
  view.audit.map((g) => `${g.ticket} ${g.kind}: ${g.what}. ${g.fix}`);

export const formatTable = (view: QueueView): string => {
  const { before, after, label } = view.table;
  const parts = [
    before.length > 0
      ? `before: ${before.map((b) => `${b.ticket} ${b.kind}`).join(', ')}`
      : undefined,
    after.length > 0
      ? `after: ${after
          .map((a) =>
            a.kind === 'pr'
              ? `${a.ticket} PR${a.pr === null ? '' : ` #${a.pr}`}`
              : `${a.ticket} hand-offs (${a.items.length})`
          )
          .join(', ')}`
      : undefined,
    label.length > 0
      ? `label: ${label.map((l) => (l.parent ? `${l.ticket} (${l.parent})` : l.ticket)).join(', ')}`
      : undefined
  ].filter((part) => part !== undefined);
  return parts.join(' · ') || 'nothing';
};
