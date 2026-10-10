import { join } from 'node:path';

export const LABEL = 'se.codeware.agent-queue';
/**
 * Seconds between scheduled runs; launchd's StartInterval.
 * run.sh reads this line from origin/main to tell whether the install is current,
 * so keep the `export const RUN_INTERVAL_SECONDS = <n>;` shape.
 */
export const RUN_INTERVAL_SECONDS = 600;
export const KEYCHAIN_SERVICE = 'linear-agent-queue';
/** Where the queue's files live in the repo, relative to the workspace root */
export const QUEUE_SOURCE_DIR = 'tools/cdwr/agent-queue';
/** The files install puts in the queue home; run.sh loads the rest from beside it */
export const QUEUE_FILES = ['run.sh', 'watch.jq'] as const;
export type QueueFile = (typeof QUEUE_FILES)[number];

/** One value per queue file; the return type keeps it exhaustive */
export const byFile = <T>(
  fn: (file: QueueFile) => T
): Record<QueueFile, T> => ({
  'run.sh': fn('run.sh'),
  'watch.jq': fn('watch.jq')
});
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
  lock: string;
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
    lock: join(home, 'lock'),
    logs,
    schedulerLog: join(logs, 'scheduler.log'),
    launchdLog: join(logs, 'launchd.log'),
    plist: join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`)
  };
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
}

export const renderPlist = ({
  script,
  home,
  repo,
  path
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
  </dict>
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

const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/** PATH for the job: the given dirs first, then the system ones, no repeats */
export const launchPath = (binaryDirs: string[]): string =>
  [...new Set([...binaryDirs, ...SYSTEM_PATH])].join(':');

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

export const formatWatching = (entries: WatchEntry[]): string =>
  entries.map((e) => `${e.ticket} #${e.pr} ${e.state}`).join(', ');

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
