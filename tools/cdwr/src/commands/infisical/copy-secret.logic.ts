import { UsageError, messageOf } from '../../cli/errors';
import type { Deployed } from '../../services/environment';

export type CopyState = 'absent' | 'same' | 'different';

export interface CopyData {
  environment: Deployed;
  folder: string;
  from: string;
  to: string;
  state: CopyState;
  /** Token for the value the plan read, kept in this process */
  read: string;
}

/** What a copy would do; throws when the source is missing or empty, or the target holds another value */
export function copyState(
  folder: string,
  from: string,
  to: string,
  source: string | undefined,
  target: string | undefined
): CopyState {
  if (source === undefined)
    throw new UsageError(`${from} not found at ${folder}`);
  if (source.includes('${')) {
    throw new UsageError(
      `${from} at ${folder} holds a secret reference; copy it in Infisical instead`
    );
  }
  if (source === '') {
    throw new UsageError(`${from} at ${folder} is empty; nothing to copy`);
  }
  if (target === undefined) return 'absent';
  if (target === source) return 'same';
  throw new UsageError(
    target === ''
      ? `${to} at ${folder} already exists (empty); secret-copy never overwrites`
      : `${to} at ${folder} already holds another value; secret-copy never overwrites`
  );
}

export const copyOutcome = (data: CopyData): string =>
  `${data.to} at ${data.folder} (${data.environment}) copied from ${data.from}`;

/** Whether Infisical refused a create because the key exists */
export const isAlreadyExists = (error: unknown): boolean =>
  /already exist|\[StatusCode=409\]/i.test(messageOf(error));
