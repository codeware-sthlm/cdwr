import { CliError } from '../../cli/errors';

/** Where the compose project lives on the host */
export const REMOTE_DIR = '/opt/cdwr-agent';
export const REMOTE_COMPOSE = `${REMOTE_DIR}/compose.yaml`;
export const REMOTE_IMAGE_ENV = `${REMOTE_DIR}/image.env`;
export const CONTAINER = 'cdwr-agent';
/** The queue state inside the container */
export const QUEUE_DIR = '/home/agent/.cdwr/agent-queue';
export const PAUSED = `${QUEUE_DIR}/paused`;
/** Held by a run; the entrypoint clears it at start */
export const RUN_LOCK = `${QUEUE_DIR}/lock`;
/** Held by an implementing session, which writes its pid inside */
export const IMPLEMENT_LOCK = `${QUEUE_DIR}/implement.lock`;
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

export const uploadCompose = (host: string, content: string): Remote => ({
  ...ssh(host, 'tee', REMOTE_COMPOSE),
  input: content
});

export const writeTag = (host: string, tag: string): Remote => ({
  ...ssh(host, 'tee', REMOTE_IMAGE_ENV),
  input: `AGENT_IMAGE_TAG=${assertTag(tag)}\n`
});

/** Prints `true` or `false`; exits 1 when there is no container */
export const isRunning = (host: string): Remote =>
  ssh(host, 'docker', 'inspect', '-f', '{{.State.Running}}', CONTAINER);

export const pause = (host: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'touch', PAUSED);

export const unpause = (host: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'rm', '-f', PAUSED);

/** Exits 0 when the path exists in the container, 1 when it is absent */
export const pathExists = (host: string, path: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'test', '-e', path);

/** Prints the pid the implementing session wrote into its lock directory; exits 1 without one */
export const lockPid = (host: string, lock: string): Remote =>
  ssh(host, 'docker', 'exec', CONTAINER, 'cat', `${lock}/pid`);

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
