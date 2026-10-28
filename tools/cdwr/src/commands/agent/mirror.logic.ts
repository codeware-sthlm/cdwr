/** Characters a mirror target may hold; it ends up in ssh and docker arguments, so no part may start like an option */
const TARGET_CHARS = /^[A-Za-z0-9._@/:][A-Za-z0-9._@/:-]*$/;

export const DEFAULT_CONTAINER = 'cdwr-agent';
export const DEFAULT_DIR = '/home/agent/.cdwr/agent-queue/sessions';

/** The first part that holds a character outside the allowed set, if any */
export const invalidPart = (
  parts: Record<string, string>
): string | undefined =>
  Object.keys(parts).find((name) => !TARGET_CHARS.test(parts[name] ?? ''));

export const mirrorTarget = (
  host: string,
  container: string,
  dir: string
): string => `${host}:docker:${container}:${dir}`;

/** The ssh arguments that check the target is reachable and writable in one round trip */
export const checkArgs = (
  host: string,
  container: string,
  dir: string
): string[] => [
  '-q',
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=5',
  host,
  'docker',
  'exec',
  container,
  'sh',
  '-c',
  // ssh joins its arguments into one remote command line, so the script is quoted for that shell;
  // a fresh volume has no sessions directory until the first copy makes one
  `'mkdir -p "$1" && test -w "$1"'`,
  '_',
  dir
];

/** What a failed check means: ssh itself exits 255, docker exec 125-127 or the container's own status */
export const checkFailure = (
  code: number | string | null,
  stderr: string,
  host: string,
  container: string,
  dir: string
): string => {
  if (code === 255 || code === 'ENOENT' || code === 'killed') {
    return `${host} is unreachable over ssh`;
  }
  if (/no such container|is not running/i.test(stderr)) {
    return `${container} is not a running container on ${host}`;
  }
  if (code === 1) return `${dir} is not writable in ${container}`;
  const detail = stderr.trim();
  return `The check failed (${code ?? 'no status'})${detail ? `: ${detail}` : ''}`;
};
