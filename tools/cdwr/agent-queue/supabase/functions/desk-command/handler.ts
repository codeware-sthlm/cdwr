// Web APIs only, so the same file runs in Deno on Supabase and under vitest
import { sameText } from '../_shared/hmac.ts';

export const KINDS = [
  'pause',
  'resume',
  'run',
  'limit',
  'cap',
  'abandon',
  'snooze',
  'wake'
] as const;
export type Kind = (typeof KINDS)[number];

/** The Waiting on you row kinds a snooze may record, as the desk's WaitRow names them */
export const ROW_KINDS = [
  'review',
  'hand-offs',
  'question',
  'plan',
  'ready to label',
  'idea',
  'approved'
] as const;
export type RowKind = (typeof ROW_KINDS)[number];

const TICKET = /^COD-[0-9]{1,9}$/;
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/** The PR limit and the implement cap in dollars, as the steppers allow them */
export const RANGES = {
  limit: { min: 1, max: 20, integer: true },
  cap: { min: 0, max: 500, integer: false }
} as const satisfies Record<
  Extract<Kind, 'limit' | 'cap'>,
  { min: number; max: number; integer: boolean }
>;

/** A queue_state row older than this means no scheduler applies commands there any more */
export const STALE_MS = 2 * 60 * 60 * 1000;

/** The session states the launch guard treats as holding the queue */
const OPEN_STATES = ['alive', 'waiting'];

export type Command = {
  host: string;
  kind: Kind;
  /**
   * `value` for limit and cap; `session` for abandon, the session the desk showed; `ticket` for
   * snooze and wake, with the row's `kind` and newest gate event `eventAt` for snooze
   */
  args: {
    value?: number;
    session?: string;
    ticket?: string;
    kind?: RowKind;
    eventAt?: string | null;
  };
};

export type Status = 'pending' | 'applied' | 'refused';

export type CommandRow = Command & {
  at: string;
  actor: string;
  status: Status;
  applied_at: string | null;
  note: string | null;
};

export type HandlerOptions = {
  /** `{device: hex sha256 of its token}`, as JSON */
  tokens: string | undefined;
  supabaseUrl: string | undefined;
  serviceKey: string | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  log?: (line: Record<string, unknown>) => void;
};

const encoder = new TextEncoder();

/** The hex SHA-256 of the text */
export const sha256 = async (text: string): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The device table, or null when the secret is not a `{name: hex}` object */
export const parseTokens = (
  raw: string | undefined
): Record<string, string> | null => {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const entries = Object.entries(parsed);
  if (
    entries.length === 0 ||
    !entries.every(
      ([name, hash]) =>
        name !== '' &&
        typeof hash === 'string' &&
        /^[0-9a-f]{64}$/.test(hash.toLowerCase())
    )
  )
    return null;
  return Object.fromEntries(
    entries.map(([name, hash]) => [name, (hash as string).toLowerCase()])
  );
};

/** The device whose token this is; every entry is compared, so the time taken names none */
export const deviceFor = async (
  tokens: Record<string, string>,
  authorization: string | null
): Promise<string | null> => {
  const match = /^Bearer (.+)$/.exec(authorization?.trim() ?? '');
  if (!match) return null;
  const hash = await sha256(match[1]);
  let device: string | null = null;
  for (const [name, expected] of Object.entries(tokens))
    if (sameText(hash, expected) && device === null) device = name;
  return device;
};

const isKind = (value: unknown): value is Kind =>
  typeof value === 'string' && (KINDS as readonly string[]).includes(value);

/** The command, or why it is malformed */
export const parseCommand = (payload: unknown): Command | string => {
  if (!isRecord(payload)) return 'Not an object';
  const { host, kind, args } = payload;
  if (typeof host !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(host))
    return 'Bad host';
  if (!isKind(kind)) return 'Bad kind';
  if (kind === 'abandon' && isRecord(args) && 'session' in args) {
    const session = args['session'];
    if (
      Object.keys(args).length !== 1 ||
      typeof session !== 'string' ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(session)
    )
      return 'abandon takes only a session id';
    return { host, kind, args: { session } };
  }
  if (kind === 'wake') {
    const ticket = isRecord(args) ? args['ticket'] : undefined;
    if (
      !isRecord(args) ||
      Object.keys(args).length !== 1 ||
      typeof ticket !== 'string' ||
      !TICKET.test(ticket)
    )
      return 'wake takes only a ticket';
    return { host, kind, args: { ticket } };
  }
  if (kind === 'snooze') {
    const message = 'snooze takes a ticket, a row kind and a gate time or null';
    if (!isRecord(args)) return message;
    const { ticket, kind: rowKind, eventAt = null } = args;
    if (
      Object.keys(args).some(
        (k) => !['ticket', 'kind', 'eventAt'].includes(k)
      ) ||
      typeof ticket !== 'string' ||
      !TICKET.test(ticket) ||
      typeof rowKind !== 'string' ||
      !(ROW_KINDS as readonly string[]).includes(rowKind) ||
      (eventAt !== null &&
        (typeof eventAt !== 'string' ||
          !ISO_TIME.test(eventAt) ||
          Number.isNaN(Date.parse(eventAt))))
    )
      return message;
    return {
      host,
      kind,
      args: {
        ticket,
        kind: rowKind as RowKind,
        eventAt: eventAt === null ? null : new Date(eventAt).toISOString()
      }
    };
  }
  if (kind !== 'limit' && kind !== 'cap') {
    if (
      args !== undefined &&
      !(isRecord(args) && Object.keys(args).length === 0)
    )
      return `${kind} takes no args`;
    return { host, kind, args: {} };
  }
  const value = isRecord(args) ? args['value'] : undefined;
  const range = RANGES[kind];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (range.integer && !Number.isInteger(value)) ||
    value < range.min ||
    value > range.max
  )
    return `${kind} takes a value from ${range.min} to ${range.max}`;
  return { host, kind, args: { value } };
};

/** The activity line for a command applied or refused here */
export const changeText = (
  command: Command,
  device: string,
  status: Exclude<Status, 'pending'>,
  note: string | null,
  ticket: string | null
): string =>
  status === 'refused'
    ? `${command.kind} refused from the desk (${device}): ${note ?? 'no reason'}`
    : command.kind === 'snooze'
      ? `snoozed ${ticket} from the desk (${device})`
      : command.kind === 'wake'
        ? `woke ${ticket} from the desk (${device})`
        : `abandoned ${ticket ?? 'the open session'} on ${command.host} from the desk (${device})`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
};

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' }
  });

type QueueSession = { id: string | null; ticket: string | null };

export const createHandler = ({
  tokens,
  supabaseUrl,
  serviceKey,
  fetch,
  now = () => Date.now(),
  log = (line) => console.log(JSON.stringify(line))
}: HandlerOptions) => {
  const base = `${(supabaseUrl ?? '').replace(/\/$/, '')}/rest/v1`;
  const rest = (
    path: string,
    init: { method: string; body?: unknown; prefer?: string }
  ): Promise<Response> =>
    fetch(`${base}/${path}`, {
      method: init.method,
      headers: {
        apikey: serviceKey ?? '',
        Authorization: `Bearer ${serviceKey ?? ''}`,
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {})
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });

  const read = async <T>(path: string): Promise<T[]> => {
    const res = await rest(path, { method: 'GET' });
    if (!res.ok) throw new Error(`read ${res.status}`);
    const rows: unknown = await res.json();
    return Array.isArray(rows) ? (rows as T[]) : [];
  };

  /**
   * The host's queue_state row: unknown when absent or older than STALE_MS. Abandon takes a
   * stale row too, since a silent host is the one whose session needs ending.
   */
  const queueSession = async (
    host: string,
    stale: boolean
  ): Promise<{ known: boolean; session: QueueSession | null }> => {
    const rows = await read<{ at: unknown; view: unknown }>(
      `queue_state?host=eq.${encodeURIComponent(host)}&select=at,view`
    );
    const at = typeof rows[0]?.at === 'string' ? Date.parse(rows[0].at) : NaN;
    if (!(now() - at <= (stale ? Infinity : STALE_MS)))
      return { known: false, session: null };
    const view = rows[0].view;
    const session =
      isRecord(view) && isRecord(view['session']) ? view['session'] : null;
    if (!session || !OPEN_STATES.includes(String(session['state'])))
      return { known: true, session: null };
    const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
    return {
      known: true,
      session: { id: text(session['id']), ticket: text(session['ticket']) }
    };
  };

  /**
   * Applies a command and stores its row in one transaction: `desk_abandon` ends the session,
   * `desk_snooze` and `desk_wake` set and remove the ticket's snooze
   */
  const rpc = async (
    name: 'desk_abandon' | 'desk_snooze' | 'desk_wake',
    body: Record<string, unknown>
  ): Promise<{ id: number; status: Status; note: string | null }> => {
    const res = await rest(`rpc/${name}`, { method: 'POST', body });
    if (!res.ok) throw new Error(`${name} ${res.status}`);
    const [row] = (await res.json()) as {
      id: number;
      status: Status;
      note: string | null;
    }[];
    if (typeof row?.id !== 'number') throw new Error(`${name} returned no id`);
    return row;
  };

  /** Stores a command as it is, returning its id */
  const insert = async (row: CommandRow): Promise<number> => {
    const res = await rest('desk_commands?select=id', {
      method: 'POST',
      body: row,
      prefer: 'return=representation'
    });
    if (!res.ok) throw new Error(`desk_commands ${res.status}`);
    const [stored] = (await res.json()) as { id: number }[];
    if (typeof stored?.id !== 'number')
      throw new Error('desk_commands returned no id');
    return stored.id;
  };

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return reply(405, { error: 'POST only' });

    const table = parseTokens(tokens);
    if (!table || !supabaseUrl || !serviceKey) {
      log({ event: 'not configured' });
      return reply(500, { error: 'Not configured' });
    }

    const device = await deviceFor(table, request.headers.get('authorization'));
    if (!device) {
      log({ event: 'refused', reason: 'token' });
      return reply(401, { error: 'Bad token' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await request.text());
    } catch {
      return reply(400, { error: 'Not JSON' });
    }
    const command = parseCommand(payload);
    if (typeof command === 'string') {
      log({ event: 'refused', reason: 'malformed', device });
      return reply(400, { error: command });
    }

    const at = new Date(now()).toISOString();
    let status: Status = 'pending';
    let note: string | null = null;
    let ticket: string | null = null;
    try {
      let id: number;
      if (command.kind === 'snooze' || command.kind === 'wake') {
        // A snooze belongs to a ticket, not a host: no scheduler applies it, so a silent host
        // doesn't refuse it
        ticket = command.args.ticket ?? null;
        const params = {
          p_host: command.host,
          p_actor: device,
          p_at: at,
          p_ticket: ticket
        };
        ({ id, status, note } =
          command.kind === 'snooze'
            ? await rpc('desk_snooze', {
                ...params,
                p_kind: command.args.kind,
                p_event_at: command.args.eventAt ?? null
              })
            : await rpc('desk_wake', params));
      } else {
        const { known, session } = await queueSession(
          command.host,
          command.kind === 'abandon'
        );
        if (!known) {
          status = 'refused';
          note = `no scheduler reports from ${command.host}`;
        }

        // The desk names the session it showed; one the host has since replaced is not abandoned
        const expected = command.args.session;
        if (
          known &&
          command.kind === 'abandon' &&
          expected !== undefined &&
          session?.id !== expected
        ) {
          status = 'refused';
          note = 'the session changed; check the host again';
        }

        if (known && command.kind === 'abandon' && status === 'pending') {
          ticket = session?.ticket ?? null;
          ({ id, status, note } = await rpc('desk_abandon', {
            p_host: command.host,
            p_actor: device,
            p_at: at,
            p_session: session?.id ?? null
          }));
        } else
          id = await insert({
            ...command,
            at,
            actor: device,
            status,
            applied_at: null,
            note
          });
      }

      // The command is stored either way; a missing activity row is only logged
      if (status !== 'pending')
        try {
          const activity = await rest('activity?on_conflict=event_id', {
            method: 'POST',
            body: {
              event_id: `desk:${id}`,
              at,
              ticket,
              actor: 'human',
              change: changeText(command, device, status, note, ticket),
              host: command.host
            },
            prefer: 'resolution=merge-duplicates,return=minimal'
          });
          if (!activity.ok)
            log({ event: 'activity failed', status: activity.status, id });
        } catch (error) {
          log({
            event: 'activity failed',
            reason: error instanceof Error ? error.message : String(error),
            id
          });
        }

      log({
        event: status,
        kind: command.kind,
        host: command.host,
        device,
        id
      });
      return reply(status === 'pending' ? 202 : 200, { id, status, note });
    } catch (error) {
      log({
        event: 'write failed',
        reason: error instanceof Error ? error.message : String(error)
      });
      return reply(500, { error: 'Write failed' });
    }
  };
};
