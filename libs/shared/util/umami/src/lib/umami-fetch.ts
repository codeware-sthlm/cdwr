import { UmamiError, WAKING_STATUSES } from './errors';

const DETAIL_MAX = 300;

/** An API key or a login token; Umami takes both as a bearer */
export type UmamiAuth = { apiKey: string } | { token: string };

/** The answer of one request, its body already read */
export type UmamiAnswer = { status: number; ok: boolean; text: string };

/** One request to Umami; `path` is relative to `/api` */
export type UmamiRequestInit = {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Read the body of a good answer, true by default; leave it for a write whose reply is ignored */
  readBody?: boolean;
};

/** Sends a request to Umami with the auth and url it was made for */
export type UmamiRequest = (init: UmamiRequestInit) => Promise<UmamiAnswer>;

export type UmamiFetchOptions = UmamiRequestInit & {
  url: string;
  /** Left out for the login itself */
  auth?: UmamiAuth;
  timeoutMs: number;
  /** Names the call in error messages, the path by default */
  label?: string;
  fetchImpl?: typeof fetch;
};

/** The base url without trailing slashes */
export const umamiRoot = (baseUrl: string): string =>
  baseUrl.replace(/\/+$/, '');

const timedOut = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * One request to Umami. Failing to reach it, a timeout, a waking status (502
 * to 504) and a body that drops while it is read are all an `UmamiError`;
 * any other status is returned for the caller to judge.
 */
export const umamiFetch = async ({
  url,
  path,
  method = 'GET',
  body,
  auth,
  timeoutMs,
  label,
  readBody = true,
  fetchImpl
}: UmamiFetchOptions): Promise<UmamiAnswer> => {
  const apiPath = path.replace(/^\/+/, '');
  const name = label ?? apiPath;
  const secret = auth && ('apiKey' in auth ? auth.apiKey : auth.token);

  let response: Response;
  try {
    response = await (fetchImpl ?? fetch)(`${umamiRoot(url)}/api/${apiPath}`, {
      method,
      headers: {
        ...(secret === undefined ? {} : { authorization: `Bearer ${secret}` }),
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new UmamiError(
        `Umami ${name}: timed out after ${timeoutMs} ms`,
        'timeout'
      );
    }
    // A dropped connection is what a resuming machine does, not a refusal
    throw new UmamiError(`Umami ${name}: request failed`, 'unavailable');
  }

  if (WAKING_STATUSES.includes(response.status)) {
    const detail = await response.text().catch(() => '');
    throw new UmamiError(
      `Umami ${name}: status ${response.status}`,
      'unavailable',
      response.status,
      detail.slice(0, DETAIL_MAX)
    );
  }

  // A good answer nobody reads is never lost to a body that drops
  if (response.ok && !readBody) {
    void response.body?.cancel().catch(() => undefined);
    return { status: response.status, ok: true, text: '' };
  }

  let text = '';
  try {
    text = await response.text();
  } catch (error) {
    // The body of a refusal is only a hint; a good answer without one is lost
    if (response.ok) {
      throw new UmamiError(
        `Umami ${name}: ${timedOut(error) ? 'timed out' : 'dropped'} while reading the answer`,
        timedOut(error) ? 'timeout' : 'unavailable'
      );
    }
  }

  return { status: response.status, ok: response.ok, text };
};

/** The JSON of an answer; anything else is a bad answer */
export const parseUmamiJson = (name: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new UmamiError(`Umami ${name}: answer is not JSON`, 'bad-answer');
  }
};

/** The error for a status the caller does not accept; carries the status and the start of the body, never the key */
export const umamiRefused = (name: string, answer: UmamiAnswer): UmamiError =>
  new UmamiError(
    `Umami ${name}: status ${answer.status}`,
    'refused',
    answer.status,
    answer.text.slice(0, DETAIL_MAX)
  );
