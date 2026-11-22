import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { run } from './shell';

/**
 * API keys and SQL of a Supabase project, through the Management API with
 * your own `supabase login`. No key or token is ever logged or put in an
 * error; only the create call asks for a key's value.
 */

const API = 'https://api.supabase.com';
const TIMEOUT_MS = 15_000;
const TOKEN_ENV = 'SUPABASE_ACCESS_TOKEN';
/** The Keychain item `supabase login` writes on a Mac, one account per CLI profile */
const KEYCHAIN_SERVICE = 'Supabase CLI';
const PROFILE_ENV = 'SUPABASE_PROFILE';
const DEFAULT_PROFILE = 'supabase';
const LEGACY_ACCOUNT = 'access-token';
/** Where `supabase login` writes the token when no keyring is available */
const TOKEN_FILE = '.supabase/access-token';
/** go-keyring stores a value under this prefix, base64 encoded */
const KEYRING_PREFIX = 'go-keyring-base64:';

const apiKeySchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  type: z.string().nullish(),
  prefix: z.string().nullish(),
  description: z.string().nullish(),
  hash: z.string().nullish(),
  inserted_at: z.string().nullish()
});

export type ApiKey = z.infer<typeof apiKeySchema>;

/** The create answer is read for the value and the new id only */
const createSchema = z.object({ id: z.string(), api_key: z.string() });

export class SupabaseApiError extends Error {
  constructor(
    what: string,
    readonly status: number,
    reason?: string
  ) {
    super(`Supabase ${what} answered ${status}${reason ? `: ${reason}` : ''}`);
    this.name = 'SupabaseApiError';
  }
}

/** The project ref of a `https://<ref>.supabase.co` url */
export function projectRef(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('The Supabase url is not a url');
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(host);
  if (!match?.[1]) {
    throw new Error(`${host} is not a <ref>.supabase.co address`);
  }
  return match[1];
}

/** How the Management API identifies a key without revealing it: base64url sha256, no padding */
export const keyHash = (key: string): string =>
  createHash('sha256').update(key).digest('base64url');

/** A token as `security -w` prints it, with go-keyring's encoding undone */
export function decodeKeychain(raw: string): string {
  const value = raw.trim();
  if (!value.startsWith(KEYRING_PREFIX)) return value;
  return Buffer.from(value.slice(KEYRING_PREFIX.length), 'base64')
    .toString('utf8')
    .trim();
}

/**
 * The Keychain accounts `supabase login` may have stored the token under: the
 * CLI profile (SUPABASE_PROFILE, `supabase` by default), then the account
 * older CLIs used
 */
export const keychainAccounts = (env: NodeJS.ProcessEnv): string[] => [
  env[PROFILE_ENV]?.trim() || DEFAULT_PROFILE,
  LEGACY_ACCOUNT
];

/**
 * Your Management API token: SUPABASE_ACCESS_TOKEN, else what `supabase login`
 * stored, in the Keychain under the profile's account or in
 * ~/.supabase/access-token when no keyring was available
 */
export async function accessToken(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir()
): Promise<string> {
  const given = env[TOKEN_ENV]?.trim();
  if (given) return given;
  if (platform === 'darwin') {
    for (const account of keychainAccounts(env)) {
      const stored = await run('security', [
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        account,
        '-w'
      ]).then(
        ({ stdout }) => decodeKeychain(stdout),
        () => ''
      );
      if (stored) return stored;
    }
  }
  const file = await readFile(join(home, TOKEN_FILE), 'utf8').then(
    (text) => text.trim(),
    () => ''
  );
  if (file) return file;
  throw new Error(
    `No Supabase access token: run \`supabase login\`, or set ${TOKEN_ENV}`
  );
}

/** The API's own error message; never the body, which may echo the request */
const reasonOf = async (response: Response): Promise<string | undefined> => {
  try {
    const body: unknown = await response.json();
    const parsed = z.object({ message: z.string() }).safeParse(body);
    return parsed.success ? parsed.data.message.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
};

async function call<T>(
  what: string,
  schema: z.ZodType<T>,
  path: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; token: string; body?: unknown }
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${init.token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {})
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new SupabaseApiError(what, response.status, await reasonOf(response));
  }
  const parsed = schema.safeParse(
    response.status === 204 ? null : await response.json().catch(() => null)
  );
  if (!parsed.success) {
    throw new Error(`Supabase ${what} answered in an unknown shape`);
  }
  return parsed.data;
}

const keysPath = (ref: string) =>
  `/v1/projects/${encodeURIComponent(ref)}/api-keys`;

/** The project's keys, never revealed */
export const listApiKeys = async (
  token: string,
  ref: string
): Promise<ApiKey[]> =>
  call('api-key list', z.array(apiKeySchema), `${keysPath(ref)}?reveal=false`, {
    method: 'GET',
    token
  });

/** Creates a secret key with the service_role role; the value is returned once and never stored here */
export const createSecretKey = async (
  token: string,
  ref: string,
  { name, description }: { name: string; description: string }
): Promise<{ id: string; value: string }> => {
  const created = await call(
    'api-key create',
    createSchema,
    `${keysPath(ref)}?reveal=true`,
    {
      method: 'POST',
      token,
      body: {
        type: 'secret',
        name,
        description,
        secret_jwt_template: { role: 'service_role' }
      }
    }
  );
  return { id: created.id, value: created.api_key };
};

/**
 * Runs SQL on the project's database as `postgres`, one row object per row.
 * An error carries the API's message only, never the statement.
 */
export const runQuery = async (
  token: string,
  ref: string,
  query: string
): Promise<Record<string, unknown>[]> =>
  call(
    'database query',
    z.array(z.record(z.string(), z.unknown())),
    `/v1/projects/${encodeURIComponent(ref)}/database/query`,
    { method: 'POST', token, body: { query } }
  );

export const deleteApiKey = async (
  token: string,
  ref: string,
  id: string
): Promise<void> => {
  await call(
    'api-key delete',
    z.unknown(),
    `${keysPath(ref)}/${encodeURIComponent(id)}`,
    { method: 'DELETE', token }
  );
};
