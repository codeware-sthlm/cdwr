// Sends desk commands to the desk-command Edge Function with the device token as the bearer

export type CommandKind =
  'pause' | 'resume' | 'run' | 'limit' | 'cap' | 'abandon';

export type CommandStatus = 'pending' | 'applied' | 'refused';

/** The function's answer to a stored command */
export type CommandReply = {
  id: number;
  status: CommandStatus;
  note: string | null;
};

export type CommandErrorCode =
  'unauthorized' | 'network' | 'bad_request' | 'server';

export class CommandError extends Error {
  readonly code: CommandErrorCode;

  constructor(code: CommandErrorCode, message: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

export type CommandTarget = {
  supabaseUrl: string;
  controlToken: string;
  fetch?: typeof fetch;
};

const endpoint = (supabaseUrl: string): string =>
  `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/desk-command`;

const post = async (
  { supabaseUrl, controlToken, fetch: send = fetch }: CommandTarget,
  body: string
): Promise<Response> => {
  try {
    return await send(endpoint(supabaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${controlToken}`,
        'Content-Type': 'application/json'
      },
      body
    });
  } catch (error) {
    throw new CommandError(
      'network',
      error instanceof Error ? error.message : String(error)
    );
  }
};

const errorText = async (res: Response): Promise<string> => {
  try {
    const body: unknown = await res.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { error?: unknown }).error === 'string'
    )
      return (body as { error: string }).error;
  } catch {
    // Not JSON; the status says enough
  }
  return `HTTP ${res.status}`;
};

/**
 * Checks the token without storing a command: the function reads the token before the
 * body, so a body that is not JSON answers 400 for a good token and 401 for a bad one.
 */
export const checkToken = async (target: CommandTarget): Promise<void> => {
  const res = await post(target, 'token check');
  if (res.status === 400) return;
  if (res.status === 401)
    throw new CommandError(
      'unauthorized',
      'The desk-command function rejected this token.'
    );
  throw new CommandError('server', await errorText(res));
};

const isStatus = (value: unknown): value is CommandStatus =>
  value === 'pending' || value === 'applied' || value === 'refused';

/** Sends one command; the reply says whether it waits for the scheduler, was applied or refused */
export const sendCommand = async (
  target: CommandTarget,
  host: string,
  kind: CommandKind,
  value?: number
): Promise<CommandReply> => {
  const res = await post(
    target,
    JSON.stringify({ host, kind, args: value === undefined ? {} : { value } })
  );
  if (res.status === 401)
    throw new CommandError('unauthorized', 'The control token was rejected.');
  if (res.status === 400)
    throw new CommandError('bad_request', await errorText(res));
  if (!res.ok) throw new CommandError('server', await errorText(res));
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new CommandError('server', 'The reply was not JSON.');
  }
  const { id, status, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof id !== 'number' || !isStatus(status))
    throw new CommandError('server', 'The reply did not name the command.');
  return { id, status, note: typeof note === 'string' ? note : null };
};

/** The controls the desk shows; pause and resume share one */
export type Control = 'pause' | 'run' | 'limit' | 'cap' | 'abandon';

const CONTROL: Record<CommandKind, Control> = {
  pause: 'pause',
  resume: 'pause',
  run: 'run',
  limit: 'limit',
  cap: 'cap',
  abandon: 'abandon'
};

/** The fields of a `desk_commands` row the state reads */
export type CommandRowLike = {
  id: number;
  at: string;
  host: string;
  kind: string;
  status: string;
  applied_at: string | null;
  note: string | null;
};

export type ControlState =
  | { state: 'idle' }
  | { state: 'pending'; kind: CommandKind }
  | { state: 'refused'; kind: CommandKind; note: string };

/** A pending row older than this is one the scheduler expires (its DESK_STALE_SECS) */
export const PENDING_MAX_MS = 2 * 60 * 60 * 1000;

/** How long a refusal note stays beside its control */
export const REFUSED_SHOW_MS = 15 * 60 * 1000;

const isKind = (value: string): value is CommandKind =>
  Object.hasOwn(CONTROL, value);

/**
 * Each control's state on one host from its newest command row. An applied row stays
 * pending until the host publishes `queue_state` at or after the ack (both whole seconds,
 * and the scheduler acks before it publishes); abandon is applied in place, so it is done
 * once applied. A refusal shows for REFUSED_SHOW_MS, a pending row for PENDING_MAX_MS.
 */
export const controlStates = (
  rows: readonly CommandRowLike[],
  host: string,
  queueAt: string | null,
  now: number
): Record<Control, ControlState> => {
  const states: Record<Control, ControlState> = {
    pause: { state: 'idle' },
    run: { state: 'idle' },
    limit: { state: 'idle' },
    cap: { state: 'idle' },
    abandon: { state: 'idle' }
  };
  const newest = new Map<Control, { row: CommandRowLike; kind: CommandKind }>();
  for (const row of rows) {
    if (row.host !== host || !isKind(row.kind)) continue;
    const control = CONTROL[row.kind];
    const seen = newest.get(control);
    if (!seen || row.id > seen.row.id)
      newest.set(control, { row, kind: row.kind });
  }
  const published = queueAt === null ? NaN : Date.parse(queueAt);
  for (const [control, { row, kind }] of newest) {
    const age = now - Date.parse(row.applied_at ?? row.at);
    if (row.status === 'pending') {
      if (age <= PENDING_MAX_MS) states[control] = { state: 'pending', kind };
    } else if (row.status === 'refused') {
      if (age <= REFUSED_SHOW_MS)
        states[control] = {
          state: 'refused',
          kind,
          note: row.note ?? 'refused'
        };
    } else if (
      row.status === 'applied' &&
      kind !== 'abandon' &&
      !(row.applied_at !== null && published >= Date.parse(row.applied_at)) &&
      age <= PENDING_MAX_MS
    )
      states[control] = { state: 'pending', kind };
  }
  return states;
};
