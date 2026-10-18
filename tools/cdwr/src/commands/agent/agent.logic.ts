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
export const KEYCHAIN_SERVICE = 'linear-agent-queue';
/** Env var the Linear key comes from in the container */
export const LINEAR_KEY_ENV = 'AGENT_QUEUE_LINEAR_KEY';
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
 * Where the Linear key would come from for the job on this host. Launchd never forwards a
 * shell-exported key (its plist sets the job's env), so there only the Keychain counts.
 */
export const linearKeySource = (
  host: 'launchd' | 'container' | null,
  env: NodeJS.ProcessEnv
): 'env' | 'keychain-possible' | 'none' =>
  host === 'container'
    ? env[LINEAR_KEY_ENV]
      ? 'env'
      : 'none'
    : host === 'launchd'
      ? 'keychain-possible'
      : 'none';
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
  'notify.sh'
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
  'notify.sh': fn('notify.sh')
});
/** What the queue scripts call; their directories make up the job's PATH */
export const QUEUE_BINARIES = ['node', 'claude', 'jq', 'git', 'gh', 'pnpm'];
/** Daily API-equivalent spend cap for implementing sessions, in USD */
export const IMPLEMENT_CAP_USD = 40;
/** Daily suggest session: budget in USD, the local hour it may start after, days between runs */
export const SUGGEST_BUDGET_USD = 5;
export const SUGGEST_HOUR = 6;
export const SUGGEST_DAYS = 1;

export interface SuggestSettings {
  budgetUsd: number;
  hour: number;
  days: number;
}

/** The suggest session's settings: the environment when set, the defaults otherwise */
export const suggestSettings = (env: NodeJS.ProcessEnv): SuggestSettings => {
  const read = (name: string, fallback: number, max?: number): number => {
    const value = env[name];
    if (value === undefined || value === '') return fallback;
    if (!/^\d+$/.test(value)) {
      throw new CliError(
        `${name} must be a non-negative integer, got ${value}`
      );
    }
    if (max !== undefined && Number(value) > max) {
      throw new CliError(`${name} must be at most ${max}, got ${value}`);
    }
    return Number(value);
  };
  return {
    budgetUsd: read('AGENT_QUEUE_SUGGEST_BUDGET_USD', SUGGEST_BUDGET_USD),
    hour: read('AGENT_QUEUE_SUGGEST_HOUR', SUGGEST_HOUR, 23),
    days: read('AGENT_QUEUE_SUGGEST_DAYS', SUGGEST_DAYS)
  };
};

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
    runs: join(home, 'runs.jsonl'),
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
  /** The dev checkout's Claude memory directory, where the suggest session may write */
  memoryDir: string;
  suggest: SuggestSettings;
}

export const renderPlist = ({
  script,
  home,
  repo,
  path,
  memoryDir,
  suggest
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

/** The daily cap: the env value when it is a positive number, else the default */
export const implementCap = (value: string | undefined): number => {
  const n = Number(value);
  return value?.trim() && Number.isFinite(n) && n > 0 ? n : IMPLEMENT_CAP_USD;
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
 * negative. Undefined when any line is unreadable: a bad line is not zero spend.
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
  return sum;
};

export const IMPLEMENT_OUTCOMES = [
  'launched',
  'implemented',
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
  last: ImplementRun | undefined
): string =>
  spent === undefined
    ? 'implement spend unreadable: implement-spend.jsonl has a bad line; no launch until it is fixed'
    : [
        `implement spend today $${spent.toFixed(2)} of $${cap}`,
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

  const segments = rest
    .split(/:| · /)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
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

const ticketSchema = z.string();
const prSchema = z.number().nullable();

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
        'parked wait resolved',
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
  // Older runs documents have no parked
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

export const formatParked = (view: QueueView): string =>
  view.parked
    .map(
      (p) =>
        `${p.ticket} ${p.wait} PR #${p.pr} since ${p.since.slice(11, 16)}Z` +
        (p.resolved ? ` (resolved: ${p.outcome})` : '')
    )
    .join(', ') || 'nothing';

export const formatTable = (view: QueueView): string => {
  const { before, after } = view.table;
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
      : undefined
  ].filter((part) => part !== undefined);
  return parts.join(' · ') || 'nothing';
};
