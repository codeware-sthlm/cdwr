import { UsageError } from '../../cli/errors';
import type { Deployed } from '../../services/environment';
import { REWRITE_PARTS } from '../agent/apply-list.logic';

export type RewriteState = 'absent' | 'same' | 'different';

export interface RewriteParts {
  host?: string | undefined;
  port?: string | undefined;
  user?: string | undefined;
}

export interface RewriteShape {
  host: { from: string; to: string };
  port: { from: string; to: string };
  userChanged: boolean;
  passwordKept: true;
}

export interface RewriteData {
  environment: Deployed;
  folder: string;
  key: string;
  state: RewriteState;
  shape: RewriteShape;
  /** Token for the value the plan read, kept in this process */
  read: string;
}

/** The parts a rewrite changes: those given and not blank */
export const givenParts = (parts: RewriteParts): RewriteParts =>
  Object.fromEntries(
    REWRITE_PARTS.flatMap((part) => {
      const value = parts[part]?.trim();
      return value ? [[part, value]] : [];
    })
  );

/** The given parts as the `part=value` arguments of an apply-list item */
export const partArgs = (parts: RewriteParts): string[] => {
  const given = givenParts(parts);
  return REWRITE_PARTS.flatMap((part) => {
    const value = given[part];
    return value === undefined ? [] : [`${part}=${value}`];
  });
};

export interface Rewritten {
  state: 'same' | 'different';
  /** The new value; never to be shown */
  next: string;
  shape: RewriteShape;
  userFrom: string;
  userTo: string;
  /** The password, raw and as written in the url, for scrubbing */
  secrets: string[];
}

/** Only the host, port and user of the url change; the rest stays as it was */
export function rewrite(
  current: string,
  parts: RewriteParts,
  folder: string,
  key: string
): Rewritten {
  const notUrl = new UsageError(
    `${key} at ${folder} is not a url with a password`
  );
  let original: URL;
  try {
    original = new URL(current);
  } catch {
    throw notUrl;
  }
  if (original.password === '') throw notUrl;
  if (current.includes('${')) {
    throw new UsageError(
      `${key} at ${folder} holds a secret reference; refused`
    );
  }
  const secrets = [current, original.password, safeDecode(original.password)];
  // The result is `href`, so a stored value must already be in that form
  if (original.href !== current) {
    throw new UsageError(
      `${key} at ${folder} is not in canonical url form; refused`
    );
  }

  const given = givenParts(parts);
  const url = new URL(original.href);
  if (given.host !== undefined) url.hostname = given.host;
  if (given.port !== undefined) url.port = given.port;
  if (given.user !== undefined) url.username = given.user;

  // A setter the url class rejects does nothing, which must not read as done
  const taken: Array<[string, string | undefined, string]> = [
    ['host', given.host, url.hostname],
    ['port', given.port, url.port],
    ['user', given.user, url.username]
  ];
  for (const [part, wanted, got] of taken) {
    if (wanted !== undefined && wanted !== got) {
      throw new UsageError(
        `${part} ${wanted} was not accepted for ${key} at ${folder}`
      );
    }
  }

  const same =
    url.hostname === original.hostname &&
    url.port === original.port &&
    url.username === original.username;
  // The result is written as a whole, so the password must survive a reparse too
  if (new URL(url.href).password !== original.password) {
    throw new UsageError(
      `Rewriting ${key} at ${folder} would change the password; refused`
    );
  }
  secrets.push(url.href);

  return {
    state: same ? 'same' : 'different',
    next: same ? current : url.href,
    shape: {
      host: { from: original.hostname, to: url.hostname },
      port: { from: original.port, to: url.port },
      userChanged: url.username !== original.username,
      passwordKept: true
    },
    userFrom: original.username,
    userTo: url.username,
    secrets
  };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The changed parts as lines, hosts, ports and user names only */
export const shapeLines = (shape: RewriteShape, user: [string, string]) => [
  ...(shape.host.from !== shape.host.to
    ? [`host ${shape.host.from} → ${shape.host.to}`]
    : []),
  ...(shape.port.from !== shape.port.to
    ? [`port ${shape.port.from} → ${shape.port.to}`]
    : []),
  ...(shape.userChanged ? [`user ${user[0]} → ${user[1]}`] : [])
];

export const rewriteOutcome = (
  data: RewriteData,
  user: [string, string]
): string =>
  `${data.key} at ${data.folder} (${data.environment}): ${shapeLines(data.shape, user).join(', ')}`;
