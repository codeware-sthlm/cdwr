import { randomInt } from 'node:crypto';

import { isNotFound } from '@codeware/shared/feature/infisical';
import {
  type UmamiAnswer,
  UmamiError,
  type UmamiIdentity,
  type UmamiTeam,
  type UmamiTeamRole,
  type UmamiTeamUser,
  createUmamiCalls,
  isWaking,
  parseUmamiJson,
  umamiFetch,
  umamiLogin
} from '@codeware/shared/util/umami';
import { z } from 'zod';

import { type Environment, readSecrets } from './infisical';
import { sleep } from './shell';

/** Where to reach Umami and the key to do it with */
export interface UmamiConnection {
  url: string;
  apiKey: string;
  /** Called when Umami looks asleep, before a read is retried */
  onWaking?: () => void;
}

export type UmamiProvisioning =
  | ({
      status: 'ready';
      readApiKey: string;
      /** The admin user whose login lists users; Umami refuses API keys there */
      adminLogin?: { username: string; password: string };
    } & UmamiConnection)
  | { status: 'unconfigured'; missing: string[] };

export interface UmamiWebsite {
  id: string;
  name: string;
  domain: string;
  /** The team that owns the website, `null` while it belongs to a user */
  teamId: string | null;
}

export type TeamRole = UmamiTeamRole;

export type UmamiUser = UmamiIdentity;

export type { UmamiTeam, UmamiTeamUser };

const websiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().nullable().optional(),
  teamId: z.string().nullable().optional()
});

const pageSchema = z.object({
  data: z.array(websiteSchema),
  count: z.number()
});

const sharePageSchema = z.object({
  data: z.array(z.object({ slug: z.string() })),
  count: z.number()
});

const PAGE_SIZE = 100;
/** Umami refuses a longer team name */
const TEAM_NAME_MAX = 50;
const TIMEOUT_MS = 15_000;
/** How long a read keeps trying while Umami wakes up, and how often */
const WAKE_DEADLINE_MS = 60_000;
const WAKE_ATTEMPTS = 6;
const WAKE_PAUSE_MS = 2_000;

/** Secrets at a path, or none when the folder is not there */
async function readOptional(
  environment: Environment,
  path: string
): Promise<Record<string, string>> {
  try {
    return await readSecrets(environment, path);
  } catch (error) {
    if (isNotFound(error)) return {};
    throw error;
  }
}

/**
 * The credentials provisioning needs: the url from the cms folder, the
 * provisioning key and the cms read key from the integration folder. Names
 * the missing ones, never values.
 */
export async function readUmamiProvisioning(
  environment: Environment
): Promise<UmamiProvisioning> {
  const [cms, umami] = await Promise.all([
    readOptional(environment, '/apps/cms'),
    readOptional(environment, '/integrations/umami')
  ]);
  const url = cms['UMAMI_URL'];
  const apiKey = umami['PROVISION_API_KEY'];
  const readApiKey = umami['API_KEY'];
  const username = umami['UMAMI_ADMIN_USERNAME'];
  const password = umami['UMAMI_ADMIN_PASSWORD'];
  if (url && apiKey && readApiKey)
    return {
      status: 'ready',
      url,
      apiKey,
      readApiKey,
      ...(username && password ? { adminLogin: { username, password } } : {})
    };
  const missing = [
    ...(url ? [] : ['UMAMI_URL']),
    ...(apiKey ? [] : ['PROVISION_API_KEY']),
    ...(readApiKey ? [] : ['API_KEY'])
  ];
  return { status: 'unconfigured', missing };
}

/**
 * One request. A read keeps trying while Umami wakes up: after a cold boot the
 * gateway answers 502-504 or drops the connection for up to half a minute, and
 * a body that drops while it is read is a wake too. Only a read is retried: a
 * write that timed out may well have landed.
 */
async function request(
  conn: UmamiConnection,
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    readBody?: boolean;
    token?: string;
  } = {}
): Promise<UmamiAnswer> {
  const send = () =>
    umamiFetch({
      url: conn.url,
      path,
      method: init.method,
      body: init.body,
      readBody: init.readBody,
      auth:
        init.token === undefined
          ? { apiKey: conn.apiKey }
          : { token: init.token },
      timeoutMs: TIMEOUT_MS
    });

  if ((init.method ?? 'GET') !== 'GET') return send();

  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    let asleep: unknown;
    try {
      return await send();
    } catch (error) {
      if (!isWaking(error)) throw error;
      asleep = error;
    }
    if (attempt >= WAKE_ATTEMPTS || Date.now() - started >= WAKE_DEADLINE_MS) {
      throw wakingError(asleep);
    }
    if (attempt === 1) conn.onWaking?.();
    await sleep(WAKE_PAUSE_MS);
  }
}

/** The user and team calls as the key of a connection, or as a login token */
const umami = (conn: UmamiConnection, token?: string) =>
  createUmamiCalls(({ path, method, body, readBody }) =>
    request(conn, path, { method, body, readBody, token })
  );

/** The error for a refused request; carries the status, never the key */
function refused(what: string, response: UmamiAnswer): Error {
  const detail = response.text.slice(0, 200);
  return new Error(
    `Umami refused ${what}: ${response.status}${detail ? ` ${detail}` : ''}`
  );
}

const toWebsite = (parsed: z.infer<typeof websiteSchema>): UmamiWebsite => ({
  id: parsed.id,
  name: parsed.name,
  domain: parsed.domain ?? '',
  teamId: parsed.teamId ?? null
});

/**
 * One website, or `null` when Umami does not know the id. Umami answers an id
 * outside the key's reach with 401 or 403, and an admin with an empty body, so
 * those count as unknown too.
 */
export async function getWebsite(
  conn: UmamiConnection,
  id: string
): Promise<UmamiWebsite | null> {
  const response = await request(conn, `/websites/${encodeURIComponent(id)}`);
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw refused('the website lookup', response);
  const body = parseUmamiJson('websites', response.text);
  return body === null ? null : toWebsite(websiteSchema.parse(body));
}

/** Every website of a team, read page by page */
export async function listTeamWebsites(
  conn: UmamiConnection,
  teamId: string
): Promise<UmamiWebsite[]> {
  const websites: UmamiWebsite[] = [];
  for (let page = 1; ; page++) {
    const response = await request(
      conn,
      `/teams/${encodeURIComponent(teamId)}/websites?page=${page}&pageSize=${PAGE_SIZE}`
    );
    if (!response.ok) throw refused('the website list', response);
    const { data, count } = pageSchema.parse(
      parseUmamiJson('websites', response.text)
    );
    websites.push(...data.map(toWebsite));
    if (!data.length || websites.length >= count) return websites;
  }
}

/** Create a website in the team */
export async function createWebsite(
  conn: UmamiConnection,
  site: { name: string; domain: string; teamId: string }
): Promise<UmamiWebsite> {
  const response = await worded(
    'the website creation',
    request(conn, '/websites', { method: 'POST', body: site })
  );
  if (!response.ok) throw refused('the website creation', response);
  return toWebsite(
    websiteSchema.parse(parseUmamiJson('websites', response.text))
  );
}

/** The slugs of a website's public shares, read page by page */
export async function listShares(
  conn: UmamiConnection,
  websiteId: string
): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; ; page++) {
    const response = await request(
      conn,
      `/websites/${encodeURIComponent(websiteId)}/shares?page=${page}&pageSize=${PAGE_SIZE}`
    );
    if (!response.ok) throw refused('the share list', response);
    const { data, count } = sharePageSchema.parse(
      parseUmamiJson('shares', response.text)
    );
    slugs.push(...data.map(({ slug }) => slug));
    if (!data.length || slugs.length >= count) return slugs;
  }
}

/** Give a website a public share with this slug; answers the slug Umami kept */
export async function setShare(
  conn: UmamiConnection,
  websiteId: string,
  slug: string
): Promise<string> {
  const response = await worded(
    'the share creation',
    request(conn, `/websites/${encodeURIComponent(websiteId)}`, {
      method: 'POST',
      body: { shareId: slug }
    })
  );
  if (!response.ok) throw refused('the share creation', response);
  const { shareId } = z
    .object({ shareId: z.string().nullable() })
    .parse(parseUmamiJson('websites', response.text));
  if (!shareId)
    throw new Error('Umami answered the share creation without a share');
  return shareId;
}

const SLUG_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A random 16-character alphanumeric slug, the shape Umami's own UI makes */
export function newShareSlug(): string {
  return Array.from(
    { length: 16 },
    () => SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)]
  ).join('');
}

/** What a read that never got an answer says: the status Umami kept answering, else the failure itself */
const wakingError = (error: unknown): unknown =>
  error instanceof UmamiError && error.status !== undefined
    ? new Error(`Umami answered ${error.status} while waking up`)
    : error;

/** A refusal worded as cdwr always has: what was asked, the status and the start of the body */
async function worded<T>(what: string, call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (
      error instanceof UmamiError &&
      (error.kind === 'refused' || error.kind === 'unavailable') &&
      error.status !== undefined
    ) {
      const detail = error.detail?.slice(0, 200);
      throw new Error(
        `Umami refused ${what}: ${error.status}${detail ? ` ${detail}` : ''}`
      );
    }
    throw error;
  }
}

/** The user the key belongs to; Umami may nest it under `user` */
export const whoAmI = (conn: UmamiConnection): Promise<UmamiUser> =>
  worded('the identity lookup', umami(conn).whoAmI());

/** Create a team; the creator becomes its owner */
export async function createTeam(
  conn: UmamiConnection,
  name: string
): Promise<UmamiTeam> {
  if (name.length > TEAM_NAME_MAX)
    throw new Error(
      `A team name is at most ${TEAM_NAME_MAX} characters, got ${name.length}`
    );
  return worded('the team creation', umami(conn).createTeam(name));
}

/** Add a user to a team with this role; a user who is a member counts as added */
export const addTeamUser = (
  conn: UmamiConnection,
  teamId: string,
  userId: string,
  role: TeamRole
): Promise<void> =>
  worded('the team member', umami(conn).addTeamUser(teamId, userId, role));

/** A team by id; `null` when Umami has no such team */
export const getTeam = (
  conn: UmamiConnection,
  teamId: string
): Promise<UmamiTeam | null> =>
  worded('the team lookup', umami(conn).getTeam(teamId));

/** Every member of a team, read page by page */
export const listTeamUsers = (
  conn: UmamiConnection,
  teamId: string
): Promise<UmamiTeamUser[]> =>
  worded('the team member list', umami(conn).listTeamUsers(teamId));

/** Move a website into a team */
export const transferWebsite = (
  conn: UmamiConnection,
  websiteId: string,
  teamId: string
): Promise<void> =>
  worded(
    'the website transfer',
    umami(conn).transferWebsite(websiteId, teamId)
  );

/** Take a user out of a team; a user who is not a member counts as removed */
export const removeTeamUser = (
  conn: UmamiConnection,
  teamId: string,
  userId: string
): Promise<void> =>
  worded('the team member removal', umami(conn).removeTeamUser(teamId, userId));

/**
 * A login token for an Umami user. Umami refuses API keys on its user routes,
 * so reading users takes a login. Throws without echoing the password, and
 * for a user with 2FA, whose login yields no usable token.
 */
export const loginToken = (
  url: string,
  username: string,
  password: string
): Promise<string> =>
  worded(
    'the login',
    umamiLogin({
      url,
      username,
      password,
      timeoutMs: TIMEOUT_MS,
      consumer: 'stats-accounts'
    })
  );

/** Every Umami user, read page by page; needs an admin user's login token */
export const listUsers = (
  conn: UmamiConnection,
  token: string
): Promise<Array<Pick<UmamiUser, 'id' | 'username'>>> =>
  worded('the user list', umami(conn, token).listUsers());

/** Every team the key is a member of, read page by page */
export const listTeams = (conn: UmamiConnection): Promise<UmamiTeam[]> =>
  worded('the team list', umami(conn).listTeams());
