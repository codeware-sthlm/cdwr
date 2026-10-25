import { z } from 'zod';

import { UmamiError } from './errors';
import {
  type UmamiRequest,
  parseUmamiJson,
  umamiFetch,
  umamiRefused,
  umamiRoot
} from './umami-fetch';

export type UmamiLoginOptions = {
  url: string;
  /** An Umami admin user without 2FA: Umami refuses API keys on user routes */
  username: string;
  password: string;
  timeoutMs: number;
  /** Who needs a user without 2FA, named in the error for one that has it */
  consumer: string;
  fetchImpl?: typeof fetch;
};

const LoginSchema = z.object({
  token: z.string().optional(),
  requiresTwoFactor: z.boolean().optional()
});

/** Signs in and answers the login token; never logged, never in an error */
export const umamiLogin = async ({
  url,
  username,
  password,
  timeoutMs,
  consumer,
  fetchImpl
}: UmamiLoginOptions): Promise<string> => {
  const path = 'auth/login';
  const answer = await umamiFetch({
    url,
    path,
    method: 'POST',
    body: { username, password },
    timeoutMs,
    fetchImpl
  });
  if (!answer.ok) throw umamiRefused(path, answer);

  const parsed = LoginSchema.safeParse(parseUmamiJson(path, answer.text));
  if (parsed.success && parsed.data.requiresTwoFactor) {
    throw new UmamiError(
      `The Umami admin user has 2FA; ${consumer} needs a user without it`,
      'refused'
    );
  }
  if (!parsed.success || !parsed.data.token) {
    throw new UmamiError(`Umami ${path}: unexpected answer`, 'bad-answer');
  }
  return parsed.data.token;
};

/** How long a login token is reused before the next call signs in again */
const TOKEN_TTL_MS = 10 * 60 * 1000;

const tokens = new Map<string, { token: string; expires: number }>();

/** Forgets every cached login token */
export const clearUmamiTokens = (): void => tokens.clear();

/**
 * Requests made as an Umami user. The login token is cached per url and
 * username; a 401 signs in once more and retries the call once.
 */
export const createUmamiSession = (
  options: UmamiLoginOptions
): { request: UmamiRequest } => {
  const { url, username, timeoutMs, fetchImpl } = options;
  const cacheKey = `${umamiRoot(url)}\n${username}`;

  const login = async (fresh: boolean): Promise<string> => {
    const cached = tokens.get(cacheKey);
    if (!fresh && cached && cached.expires > Date.now()) {
      return cached.token;
    }
    const token = await umamiLogin(options);
    tokens.set(cacheKey, { token, expires: Date.now() + TOKEN_TTL_MS });
    return token;
  };

  const sendWith = (token: string, init: Parameters<UmamiRequest>[0]) =>
    umamiFetch({ ...init, url, auth: { token }, timeoutMs, fetchImpl });

  return {
    request: async (init) => {
      const answer = await sendWith(await login(false), init);
      if (answer.status !== 401) {
        return answer;
      }
      tokens.delete(cacheKey);
      return sendWith(await login(true), init);
    }
  };
};
