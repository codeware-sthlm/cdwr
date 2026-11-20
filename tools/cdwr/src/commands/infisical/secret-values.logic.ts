import { createHash } from 'node:crypto';

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

/** A short digest of a value read at plan time, to tell a change since; not a value */
export const digest = (value: string | undefined): string =>
  value === undefined
    ? ''
    : createHash('sha256').update(value).digest('hex').slice(0, 16);

/** Refuses an apply when the value is no longer the one the plan read */
export function refuseChanged(
  planned: string,
  value: string | undefined,
  key: string,
  folder: string
): void {
  if (digest(value) !== planned) {
    throw new Error(
      `${key} at ${folder} changed since the plan; nothing written`
    );
  }
}
