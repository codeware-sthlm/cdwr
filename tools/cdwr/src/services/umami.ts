import { randomInt } from 'node:crypto';

import { isNotFound } from '@codeware/shared/feature/infisical';
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
  | ({ status: 'ready'; readApiKey: string } & UmamiConnection)
  | { status: 'unconfigured'; missing: string[] };

export interface UmamiWebsite {
  id: string;
  name: string;
  domain: string;
  /** The team that owns the website, `null` while it belongs to a user */
  teamId: string | null;
}

export type TeamRole = 'team-member' | 'team-view-only' | 'team-manager';

export interface UmamiUser {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'view-only';
}

export interface UmamiTeam {
  id: string;
  name: string;
}

export interface UmamiTeamUser {
  userId: string;
  role: string;
}

const websiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().nullable().optional(),
  teamId: z.string().nullable().optional()
});

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.enum(['admin', 'user', 'view-only'])
});

const teamSchema = z.object({ id: z.string(), name: z.string() });

const teamUserPageSchema = z.object({
  data: z.array(z.object({ userId: z.string(), role: z.string() })),
  count: z.number()
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
  if (url && apiKey && readApiKey)
    return { status: 'ready', url, apiKey, readApiKey };
  const missing = [
    ...(url ? [] : ['UMAMI_URL']),
    ...(apiKey ? [] : ['PROVISION_API_KEY']),
    ...(readApiKey ? [] : ['API_KEY'])
  ];
  return { status: 'unconfigured', missing };
}

const endpoint = ({ url }: UmamiConnection, path: string) =>
  `${url.replace(/\/+$/, '')}/api${path}`;

/** A suspended Umami times out, or the connection drops while it resumes */
const looksAsleep = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    error instanceof TypeError);

/** What Fly's proxy answers while the machine is not reachable */
const WAKING_STATUSES: ReadonlyArray<number> = [502, 503, 504];

async function request(
  conn: UmamiConnection,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const send = (timeoutMs: number) =>
    fetch(endpoint(conn, path), {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${conn.apiKey}`,
        Accept: 'application/json',
        ...(init.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' })
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(timeoutMs)
    });

  // Only a read is retried: a write that timed out may well have landed
  if ((init.method ?? 'GET') !== 'GET') return send(TIMEOUT_MS);

  // A read keeps trying while Umami wakes up: after a cold boot the gateway
  // answers 502-504 or drops the connection for up to half a minute. The body
  // is read inside the loop, since a drop while reading is a wake too.
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    let asleep: unknown;
    try {
      const response = await send(TIMEOUT_MS);
      if (!WAKING_STATUSES.includes(response.status)) {
        const text = await response.text();
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
      asleep = new Error(`Umami answered ${response.status} while waking up`);
      await response.body?.cancel();
    } catch (error) {
      if (!looksAsleep(error)) throw error;
      asleep = error;
    }
    if (attempt >= WAKE_ATTEMPTS || Date.now() - started >= WAKE_DEADLINE_MS) {
      throw asleep;
    }
    if (attempt === 1) conn.onWaking?.();
    await sleep(WAKE_PAUSE_MS);
  }
}

/** The error for a refused request; carries the status, never the key */
async function refused(what: string, response: Response): Promise<Error> {
  const detail = (await response.text().catch(() => '')).slice(0, 200);
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
  if (!response.ok) throw await refused('the website lookup', response);
  const body: unknown = await response.json();
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
    if (!response.ok) throw await refused('the website list', response);
    const { data, count } = pageSchema.parse(await response.json());
    websites.push(...data.map(toWebsite));
    if (!data.length || websites.length >= count) return websites;
  }
}

/** Create a website in the team */
export async function createWebsite(
  conn: UmamiConnection,
  site: { name: string; domain: string; teamId: string }
): Promise<UmamiWebsite> {
  const response = await request(conn, '/websites', {
    method: 'POST',
    body: site
  });
  if (!response.ok) throw await refused('the website creation', response);
  return toWebsite(websiteSchema.parse(await response.json()));
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
    if (!response.ok) throw await refused('the share list', response);
    const { data, count } = sharePageSchema.parse(await response.json());
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
  const response = await request(
    conn,
    `/websites/${encodeURIComponent(websiteId)}`,
    { method: 'POST', body: { shareId: slug } }
  );
  if (!response.ok) throw await refused('the share creation', response);
  const { shareId } = z
    .object({ shareId: z.string().nullable() })
    .parse(await response.json());
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

/** The user the key belongs to; Umami may nest it under `user` */
export async function whoAmI(conn: UmamiConnection): Promise<UmamiUser> {
  const response = await request(conn, '/me');
  if (!response.ok) throw await refused('the identity lookup', response);
  const body = z
    .object({ user: userSchema.optional() })
    .passthrough()
    .parse(await response.json());
  return body.user ?? userSchema.parse(body);
}

/** Create a team; the creator becomes its owner */
export async function createTeam(
  conn: UmamiConnection,
  name: string
): Promise<UmamiTeam> {
  if (name.length > TEAM_NAME_MAX)
    throw new Error(
      `A team name is at most ${TEAM_NAME_MAX} characters, got ${name.length}`
    );
  const response = await request(conn, '/teams', {
    method: 'POST',
    body: { name }
  });
  if (!response.ok) throw await refused('the team creation', response);
  return teamSchema.parse(await response.json());
}

/** Add a user to a team with this role */
export async function addTeamUser(
  conn: UmamiConnection,
  teamId: string,
  userId: string,
  role: TeamRole
): Promise<void> {
  const response = await request(
    conn,
    `/teams/${encodeURIComponent(teamId)}/users`,
    { method: 'POST', body: { userId, role } }
  );
  if (!response.ok) throw await refused('the team member', response);
}

/** Every member of a team, read page by page */
export async function listTeamUsers(
  conn: UmamiConnection,
  teamId: string
): Promise<UmamiTeamUser[]> {
  const users: UmamiTeamUser[] = [];
  for (let page = 1; ; page++) {
    const response = await request(
      conn,
      `/teams/${encodeURIComponent(teamId)}/users?page=${page}&pageSize=${PAGE_SIZE}`
    );
    if (!response.ok) throw await refused('the team member list', response);
    const { data, count } = teamUserPageSchema.parse(await response.json());
    users.push(...data.map(({ userId, role }) => ({ userId, role })));
    if (!data.length || users.length >= count) return users;
  }
}

/** Move a website into a team */
export async function transferWebsite(
  conn: UmamiConnection,
  websiteId: string,
  teamId: string
): Promise<void> {
  const response = await request(
    conn,
    `/websites/${encodeURIComponent(websiteId)}/transfer`,
    { method: 'POST', body: { teamId } }
  );
  if (!response.ok) throw await refused('the website transfer', response);
}
