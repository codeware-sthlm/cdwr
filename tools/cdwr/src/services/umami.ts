import { isNotFound } from '@codeware/shared/feature/infisical';
import { z } from 'zod';

import { type Environment, readSecrets } from './infisical';

/** Where to reach Umami and the key to do it with */
export interface UmamiConnection {
  url: string;
  apiKey: string;
}

export type UmamiProvisioning =
  | ({ status: 'ready'; teamId: string } & UmamiConnection)
  | { status: 'unconfigured'; missing: string[] };

export interface UmamiWebsite {
  id: string;
  name: string;
  domain: string;
}

const websiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().nullable().optional()
});

const pageSchema = z.object({
  data: z.array(websiteSchema),
  count: z.number()
});

const PAGE_SIZE = 100;
const TIMEOUT_MS = 15_000;

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
 * The credentials provisioning needs: the url from the cms folder, the key
 * and team from the integration folder. Names the missing ones, never values.
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
  const teamId = umami['TEAM_ID'];
  if (url && apiKey && teamId) return { status: 'ready', url, apiKey, teamId };
  const missing = [
    ...(url ? [] : ['UMAMI_URL']),
    ...(apiKey ? [] : ['PROVISION_API_KEY']),
    ...(teamId ? [] : ['TEAM_ID'])
  ];
  return { status: 'unconfigured', missing };
}

const endpoint = ({ url }: UmamiConnection, path: string) =>
  `${url.replace(/\/+$/, '')}/api${path}`;

async function request(
  conn: UmamiConnection,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  return fetch(endpoint(conn, path), {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${conn.apiKey}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
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
  domain: parsed.domain ?? ''
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
