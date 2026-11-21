import { CliError } from '../../cli/errors';
import { shellQuote } from '../../services/shell';

import { type VaultKey, vaultLineScript } from './rotate-fly.logic';

/** Where the compose project lives on the host */
export const REMOTE_DIR = '/opt/cdwr-agent';
export const REMOTE_COMPOSE = `${REMOTE_DIR}/compose.yaml`;
export const REMOTE_IMAGE_ENV = `${REMOTE_DIR}/image.env`;
/** The files the host's self-deploy rolls back to are kept beside the live ones */
export const PREVIOUS_SUFFIX = '.previous';
/** Holds one tag: the newest build a deploy by hand saw; self-deploy waits for a newer one */
export const REMOTE_HOLD = `${REMOTE_DIR}/hold`;
/** flock(1) on it serializes a deploy by hand with the host's self-deploy timer */
export const REMOTE_LOCK = `${REMOTE_DIR}/deploy.lock`;
/** Printed by the remote side of deployLock once it holds the lock */
export const LOCKED = 'locked';
/** flock's exit code when the wait for the lock runs out */
export const LOCK_BUSY = 75;
export const CONTAINER = 'cdwr-agent';
/** Inside the container: records a deploy for the desk, reading a JSON object on stdin */
export const DEPLOY_GATE = '/opt/agent-queue/deploy-gate.sh';
/** The queue state inside the container */
export const QUEUE_DIR = '/home/agent/.cdwr/agent-queue';
export const PAUSED = `${QUEUE_DIR}/paused`;
/** Held by a run, which writes its pid inside; the entrypoint clears it at start */
export const RUN_LOCK = `${QUEUE_DIR}/lock`;
/** Held by an implementing session, which writes its pid inside */
export const IMPLEMENT_LOCK = `${QUEUE_DIR}/implement.lock`;
/** Held by the nightly backup, without a pid; run.sh clears one older than 20 minutes */
export const BACKUP_LOCK = `${QUEUE_DIR}/backup.lock`;
/** The repo's compose file, relative to the workspace root */
export const COMPOSE_SOURCE = 'apps/agent-host/compose.yaml';
export const IMAGE_WORKFLOW = 'agent-host-image.yml';
export const WAIT_INTERVAL_MS = 10_000;
export const DEFAULT_WAIT_MINUTES = 30;

/** One ssh invocation: the arguments after `ssh`, and what goes to stdin */
export interface Remote {
  args: string[];
  input?: string;
}

const TAG = /^(sha-[0-9a-f]{7}|main)$/;
const HOST = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

export const isTag = (value: string): boolean => TAG.test(value);
export const isHost = (value: string): boolean => HOST.test(value);

export const tagFromSha = (sha: string): string => {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new CliError(`Not a commit sha: ${sha}`);
  }
  return `sha-${sha.slice(0, 7).toLowerCase()}`;
};

/** Checks a tag from the command line; the image only carries `sha-<7 hex>` and `main` */
export const assertTag = (value: string): string => {
  if (!isTag(value)) {
    throw new CliError(
      `Not an image tag: ${value}`,
      undefined,
      'Use sha-<7 hex characters> or main'
    );
  }
  return value;
};

export const assertHost = (value: string): string => {
  if (!isHost(value)) throw new CliError(`Not a host name: ${value}`);
  return value;
};

/**
 * ssh joins its arguments into one string for the remote shell, so every word
 * below is shell-safe on its own: no spaces, quotes or metacharacters.
 */
const ssh = (host: string, ...command: string[]): Remote => ({
  args: ['-o', 'BatchMode=yes', host, ...command]
});

const compose = (...rest: string[]): string[] => [
  'docker',
  'compose',
  '--project-directory',
  REMOTE_DIR,
  '-f',
  REMOTE_COMPOSE,
  '--env-file',
  REMOTE_IMAGE_ENV,
  ...rest
];

/**
 * Holds the host's deploy lock for as long as this ssh runs: flock waits up to
 * `seconds` for it, prints LOCKED, then cat keeps it until stdin closes. A
 * dropped connection ends cat too, so a lock is never left behind. The one
 * call that goes through a remote shell; the quoted part is constant.
 */
export const deployLock = (host: string, seconds: number): Remote =>
  ssh(
    host,
    'flock',
    '-w',
    String(Math.max(0, Math.round(seconds))),
    '-E',
    String(LOCK_BUSY),
    REMOTE_LOCK,
    'sh',
    '-c',
    shellQuote(`echo ${LOCKED} && exec cat >/dev/null`)
  );

export const uploadCompose = (host: string, content: string): Remote => ({
  ...ssh(host, 'tee', REMOTE_COMPOSE),
  input: content
});

export const writeTag = (host: string, tag: string): Remote => ({
  ...ssh(host, 'tee', REMOTE_IMAGE_ENV),
  input: `AGENT_IMAGE_TAG=${assertTag(tag)}\n`
});

/** Prints image.env; exits 1 when it is absent, as before a first deploy */
export const readImageEnv = (host: string): Remote =>
  ssh(host, 'cat', REMOTE_IMAGE_ENV);

/** The tag image.env names, undefined when it names none */
export const parseImageEnv = (text: string): string | undefined => {
  const tag = /^AGENT_IMAGE_TAG=(\S+)\s*$/m.exec(text)?.[1];
  return tag && isTag(tag) ? tag : undefined;
};

/** Copies the live image.env and compose.yaml to `*.previous`, for the host's rollback */
export const keepPrevious = (host: string): Remote[] =>
  [REMOTE_IMAGE_ENV, REMOTE_COMPOSE].map((file) =>
    ssh(host, 'cp', '-f', file, `${file}${PREVIOUS_SUFFIX}`)
  );

export const writeHold = (host: string, tag: string): Remote => ({
  ...ssh(host, 'tee', REMOTE_HOLD),
  input: `${assertTag(tag)}\n`
});

export const clearHold = (host: string): Remote =>
  ssh(host, 'rm', '-f', REMOTE_HOLD);

/** What a deploy does with the hold */
export type HoldPlan =
  { kind: 'hold'; tag: string } | { kind: 'clear' } | { kind: 'none' };

/**
 * An older tag is held on the newest build; deploying the newest one (or leaving
 * `--tag` out) lifts a hold. Nothing is known about the newest build when it
 * could not be resolved, so the hold stays as it is.
 */
export const holdFor = (tag: string, newest: string | null): HoldPlan => {
  if (newest === null) return { kind: 'none' };
  return tag === newest ? { kind: 'clear' } : { kind: 'hold', tag: newest };
};

/** What the desk shows of the last deploy; mirrors deploy-gate.sh record */
export interface DeployRecord {
  tag: string;
  previous: string | null;
  at: string;
  by: string;
  phase: string;
  reason: string | null;
  failed: string | null;
}

/** Exits 0 when the file is executable in the container; older images have no deploy-gate.sh */
export const isExecutable = (host: string, path: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'test', '-x', path);

export const recordDeploy = (host: string, body: DeployRecord): Remote => ({
  ...ssh(host, 'docker', 'exec', '-i', CONTAINER, DEPLOY_GATE, 'record'),
  input: `${JSON.stringify(body)}\n`
});

/** Prints `true` or `false`; exits 1 when there is no container */
export const isRunning = (host: string): Remote =>
  ssh(host, 'docker', 'inspect', '-f', '{{.State.Running}}', CONTAINER);

export const pause = (host: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'touch', PAUSED);

export const unpause = (host: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'rm', '-f', PAUSED);

/** Creates a lock directory in the container; exits 1 when it is already there */
export const takeLockDir = (host: string, path: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'mkdir', path);

/** Removes a lock directory this side took */
export const dropLockDir = (host: string, path: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'rmdir', path);

/** Exits 0 when the path exists in the container, 1 when it is absent */
export const pathExists = (host: string, path: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'test', '-e', path);

/** Prints the sha256 of the key's value in the container's vault file; exits NOT_READY until it is there */
export const vaultHash = (host: string, key: VaultKey): Remote =>
  ssh(
    host,
    'docker',
    'exec',
    CONTAINER,
    'sh',
    '-c',
    shellQuote(vaultLineScript(key))
  );

/** Prints a file inside a lock directory (`pid`, `key`, `waiting`); exits 1 when it is absent */
export const lockFile = (host: string, lock: string, name: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'cat', `${lock}/${name}`);

/** Prints the pid the lock's owner wrote into its lock directory; exits 1 without one */
export const lockPid = (host: string, lock: string): Remote =>
  lockFile(host, lock, 'pid');

/**
 * Exits 0 when the process's command line names wait.sh, 1 when it does not,
 * 2 when the process is gone; the pid must be digits
 */
export const pidIsWait = (host: string, pid: string): Remote => {
  if (!isPid(pid)) throw new CliError(`Not a pid: ${pid}`);
  return ssh(
    host,
    'docker',
    'exec',
    CONTAINER,
    'grep',
    '-qa',
    'wait.sh',
    `/proc/${pid}/cmdline`
  );
};

/** The ticket a launch key starts with, such as `COD-752` out of `COD-752 answered` */
export const ticketOfKey = (key: string): string | undefined => {
  const first = key.trim().split(/\s+/)[0] ?? '';
  return /^COD-[0-9]+$/.test(first) ? first : undefined;
};

/**
 * What an implementing session is doing: nothing, polling in wait.sh (safe to
 * interrupt, the next tick resumes it) or working
 */
export type SessionState = 'none' | 'waiting' | 'working';

export const sessionState = (s: {
  locked: boolean;
  alive: boolean;
  waitingAlive: boolean;
  waitingIsWait: boolean;
}): SessionState => {
  if (!s.locked || !s.alive) return 'none';
  return s.waitingAlive && s.waitingIsWait ? 'waiting' : 'working';
};

/** Exits 0 when the process runs in the container, 1 when it is gone; the pid must be digits */
export const pidAlive = (host: string, pid: string): Remote => {
  if (!isPid(pid)) throw new CliError(`Not a pid: ${pid}`);
  return ssh(host, 'docker', 'exec', CONTAINER, 'test', '-d', `/proc/${pid}`);
};

/** Prints the lock directory when it is more than a minute old, nothing otherwise */
export const lockOld = (host: string, lock: string): Remote =>
  ssh(
    host,
    'docker',
    'exec',
    CONTAINER,
    'find',
    lock,
    '-maxdepth',
    '0',
    '-mmin',
    '+1'
  );

export const isPid = (value: string): boolean => /^[0-9]+$/.test(value);

export const pull = (host: string): Remote => ssh(host, ...compose('pull'));

export const up = (host: string): Remote => ssh(host, ...compose('up', '-d'));

/** Restarts the agent service in place, so it rereads its environment */
export const restart = (host: string): Remote =>
  ssh(host, ...compose('restart', 'agent'));

/** Prints `<image id>=<state>`; no space, which the remote shell would split */
export const report = (host: string): Remote =>
  ssh(
    host,
    'docker',
    'inspect',
    '-f',
    '{{.Image}}={{.State.Status}}',
    CONTAINER
  );

export const parseReport = (
  stdout: string
): { image: string; state: string } => {
  const text = stdout.trim();
  const at = text.lastIndexOf('=');
  return at < 0
    ? { image: text, state: 'unknown' }
    : { image: text.slice(0, at), state: text.slice(at + 1) };
};

/** `docker inspect` prints the bool of `.State.Running` */
export const parseRunning = (stdout: string): boolean =>
  stdout.trim() === 'true';

/** Polling plan: a check now, then one every interval until the minutes are used */
export const waitPlan = (
  minutes: number
): { intervalMs: number; checks: number } => ({
  intervalMs: WAIT_INTERVAL_MS,
  checks: Math.floor((Math.max(0, minutes) * 60_000) / WAIT_INTERVAL_MS) + 1
});

/** The newest run's head sha out of the `gh api` workflow runs answer */
export const headShaOf = (stdout: string): string | undefined => {
  const sha = stdout.trim();
  return sha && sha !== 'null' ? sha : undefined;
};
