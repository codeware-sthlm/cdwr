import {
  parseJsonOutput,
  runInfisical
} from '@codeware/shared/util/infisical-cli';
import { z } from 'zod';

/**
 * Universal-auth client secrets of a machine identity, through the Infisical
 * API. No secret value is ever logged or put in an error.
 */

const TIMEOUT_MS = 15_000;

/** The API base, following `INFISICAL_SITE` as `createClient` does */
export const siteUrl = (site = process.env['INFISICAL_SITE']): string =>
  site === 'eu' ? 'https://eu.infisical.com' : 'https://app.infisical.com';

const clientSecretSchema = z.object({
  id: z.string(),
  description: z.string(),
  clientSecretPrefix: z.string(),
  createdAt: z.string(),
  /** Seconds; 0 never expires */
  clientSecretTTL: z.number(),
  isClientSecretRevoked: z.boolean()
});

export type ClientSecret = z.infer<typeof clientSecretSchema>;

const loginSchema = z.object({ accessToken: z.string() });
const listSchema = z.object({ clientSecretData: z.array(clientSecretSchema) });
/** The create answer is read for the value and the new id only */
const createSchema = z.object({
  clientSecret: z.string(),
  clientSecretData: z.object({ id: z.string() })
});

export class InfisicalApiError extends Error {
  constructor(
    what: string,
    readonly status: number,
    reason?: string
  ) {
    super(`Infisical ${what} answered ${status}${reason ? `: ${reason}` : ''}`);
    this.name = 'InfisicalApiError';
  }
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
  init: { method: 'GET' | 'POST'; token?: string; body?: unknown }
): Promise<T> {
  const response = await fetch(`${siteUrl()}${path}`, {
    method: init.method,
    headers: {
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {})
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new InfisicalApiError(
      what,
      response.status,
      await reasonOf(response)
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Infisical ${what} answered in an unknown shape`);
  }
  return parsed.data;
}

/** A universal-auth login; returns the access token */
export const login = async (
  clientId: string,
  clientSecret: string
): Promise<string> =>
  (
    await call('login', loginSchema, '/api/v1/auth/universal-auth/login', {
      method: 'POST',
      body: { clientId, clientSecret }
    })
  ).accessToken;

/** The access token of your own `infisical login`; throws when there is none */
export function userToken(): string {
  let token: string;
  try {
    token = runInfisical(['user', 'get', 'token', '--plain', '--silent']);
  } catch {
    throw new Error('`infisical user get token` failed; run `infisical login`');
  }
  token = token.trim();
  if (token.split('.').length !== 3) {
    throw new Error('`infisical user get token` printed no token');
  }
  return token;
}

const secretsPath = (identityId: string) =>
  `/api/v1/auth/universal-auth/identities/${encodeURIComponent(identityId)}/client-secrets`;

export const listClientSecrets = async (
  token: string,
  identityId: string
): Promise<ClientSecret[]> =>
  (
    await call('client-secret list', listSchema, secretsPath(identityId), {
      method: 'GET',
      token
    })
  ).clientSecretData;

/** Creates a client secret; the value is returned once and never stored here */
export const createClientSecret = async (
  token: string,
  identityId: string,
  { description, ttl }: { description: string; ttl: number }
): Promise<{ value: string; id: string }> => {
  const created = await call(
    'client-secret create',
    createSchema,
    secretsPath(identityId),
    {
      method: 'POST',
      token,
      body: { description, ttl, numUsesLimit: 0 }
    }
  );
  return { value: created.clientSecret, id: created.clientSecretData.id };
};

export const revokeClientSecret = async (
  token: string,
  identityId: string,
  id: string
): Promise<void> => {
  await call(
    'client-secret revoke',
    z.unknown(),
    `${secretsPath(identityId)}/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', token }
  );
};

/** The values of some keys at one agent-host path; an error never carries the CLI's output */
export function readVaultValues<K extends string>(
  keys: readonly K[],
  { path, environment, projectId }: VaultPath
): Partial<Record<K, string>> {
  let output: string;
  try {
    output = runInfisical([
      'export',
      `--env=${environment}`,
      `--path=${path}`,
      '--format=json',
      '--silent',
      '--include-imports=false',
      `--projectId=${projectId}`
    ]);
  } catch {
    throw new Error(`infisical export failed for ${path} (${environment})`);
  }
  const exported = z
    .array(z.object({ key: z.string(), value: z.string(), type: z.string() }))
    .safeParse(parseJsonOutput(output, `export of ${path} (${environment})`));
  if (!exported.success) {
    throw new Error(
      `infisical export of ${path} came back in an unknown shape`
    );
  }
  const values: Partial<Record<K, string>> = {};
  for (const entry of exported.data) {
    const key = keys.find((k) => k === entry.key);
    if (key && entry.type === 'shared') values[key] = entry.value;
  }
  return values;
}

export interface VaultPath {
  path: string;
  environment: string;
  projectId: string;
}
