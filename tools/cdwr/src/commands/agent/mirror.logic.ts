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

/** The host of a mirror target, its first `:`-segment */
export const mirrorHost = (target: string | null): string | null =>
  target?.split(':')[0]?.trim() || null;

/**
 * The ssh arguments that check the target in one round trip. Read only by default: the directory,
 * or the nearest part of it that exists, must be writable. With `create` the directory is made
 * first, since a fresh volume has none until the first copy.
 */
export const checkArgs = (
  host: string,
  container: string,
  dir: string,
  { create = false }: { create?: boolean } = {}
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
  // ssh joins its arguments into one remote command line, so the script is quoted for that shell
  create
    ? `'mkdir -p "$1" && test -w "$1"'`
    : `'d=$1; while [ ! -e "$d" ]; do d=$(dirname "$d"); done; test -d "$d" && test -w "$d"'`,
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
