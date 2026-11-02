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
