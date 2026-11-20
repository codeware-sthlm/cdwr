import type { Deployed } from '../../services/environment';

export type SetState = 'absent' | 'same' | 'different';

export interface SetData {
  environment: Deployed;
  folder: string;
  key: string;
  state: SetState;
  value: string;
  /** Token for the value the plan read, kept in this process */
  read: string;
}

export const setState = (
  current: string | undefined,
  value: string
): SetState =>
  current === undefined ? 'absent' : current === value ? 'same' : 'different';

export const setOutcome = (data: SetData): string =>
  `${data.key} at ${data.folder} (${data.environment}) = ${data.value}`;
