import { randomUUID } from 'node:crypto';

import { UsageError, messageOf } from '../../cli/errors';

const REDACTED = '***';

/** The text with every given value replaced, longest first so a value inside another cannot survive */
export const scrub = (text: string, values: readonly string[]): string =>
  [...new Set(values)]
    .filter((value) => value !== '')
    .sort((a, b) => b.length - a.length)
    .reduce((out, value) => out.split(value).join(REDACTED), text);

/** The error with its message scrubbed; a usage error stays one */
export const scrubError = (
  error: unknown,
  values: readonly string[]
): Error => {
  const message = scrub(messageOf(error), values);
  return error instanceof UsageError
    ? new UsageError(message)
    : new Error(message);
};

/**
 * Runs `fn`; anything it throws leaves with every value in `known` scrubbed.
 * `known` may grow while `fn` runs, as values are read.
 */
export async function guard<T>(
  known: readonly string[],
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw scrubError(error, known);
  }
}

/** Raises a usage error for a vocabulary refusal */
export function refuse(problem: string | null): void {
  if (problem) throw new UsageError(problem);
}

/** Values the plan read, by token; held in this process only, so an apply cannot outlive its plan */
const planned = new Map<string, string | undefined>();

/** Keeps the value a plan read and returns a token for it; the token is not a value */
export function remember(value: string | undefined): string {
  const token = randomUUID();
  planned.set(token, value);
  return token;
}

/** Refuses an apply when the value is no longer the one the plan read */
export function refuseChanged(
  token: string,
  value: string | undefined,
  key: string,
  folder: string
): void {
  if (!planned.has(token) || planned.get(token) !== value) {
    throw new Error(
      `${key} at ${folder} changed since the plan; nothing written`
    );
  }
}
