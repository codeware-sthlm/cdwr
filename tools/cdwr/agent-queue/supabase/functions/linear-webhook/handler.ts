// Web APIs only, so the same file runs in Deno on Supabase and under vitest

export const MAX_AGE_MS = 60 * 1000;

export type IssueEventRow = {
  issue_id: string;
  identifier: string | null;
  action: string;
  updated_at: string;
};

export type HandlerOptions = {
  secret: string | undefined;
  supabaseUrl: string | undefined;
  serviceKey: string | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  log?: (line: Record<string, unknown>) => void;
};

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

/** Compares without returning early, so the time taken says nothing about the match */
const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const sign = async (secret: string, body: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
};

/** Linear sends the hex HMAC-SHA256 of the raw body in `Linear-Signature` */
export const verifySignature = async (
  secret: string,
  body: string,
  signature: string | null
): Promise<boolean> =>
  signature !== null &&
  sameText(await sign(secret, body), signature.trim().toLowerCase());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** The row for an Issue or Comment event, or null for anything else */
export const toRow = (
  payload: Record<string, unknown>,
  at: Date
): IssueEventRow | null => {
  const { type, action, data } = payload;
  const verb = text(action);
  if (!verb || !isRecord(data)) return null;

  if (type === 'Issue') {
    const id = text(data['id']);
    if (!id) return null;
    return {
      issue_id: id,
      identifier: text(data['identifier']),
      action: `issue:${verb}`,
      updated_at: at.toISOString()
    };
  }

  if (type === 'Comment') {
    const id = text(data['issueId']);
    if (!id) return null;
    const issue = isRecord(data['issue']) ? data['issue'] : {};
    return {
      issue_id: id,
      identifier: text(issue['identifier']),
      action: `comment:${verb}`,
      updated_at: at.toISOString()
    };
  }

  return null;
};

const reply = (status: number, message: string): Response =>
  new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });

export const createHandler = ({
  secret,
  supabaseUrl,
  serviceKey,
  fetch,
  now = () => Date.now(),
  log = (line) => console.log(JSON.stringify(line))
}: HandlerOptions) => {
  const upsert = async (row: IssueEventRow): Promise<Response> => {
    const url = `${(supabaseUrl ?? '').replace(/\/$/, '')}/rest/v1/issue_events?on_conflict=issue_id`;
    return fetch(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey ?? '',
        Authorization: `Bearer ${serviceKey ?? ''}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(row)
    });
  };

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, 'POST only');
    if (!secret || !supabaseUrl || !serviceKey) {
      log({ event: 'not configured' });
      return reply(500, 'Not configured');
    }

    const body = await request.text();
    if (
      !(await verifySignature(
        secret,
        body,
        request.headers.get('linear-signature')
      ))
    ) {
      log({ event: 'refused', reason: 'signature' });
      return reply(401, 'Bad signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return reply(400, 'Not JSON');
    }
    if (!isRecord(payload)) return reply(400, 'Not an object');

    const sent = payload['webhookTimestamp'];
    if (typeof sent !== 'number' || Math.abs(now() - sent) > MAX_AGE_MS) {
      log({ event: 'refused', reason: 'timestamp' });
      return reply(400, 'Stale or missing webhookTimestamp');
    }

    const row = toRow(payload, new Date(now()));
    if (!row) return reply(200, 'Ignored');

    let res: Response;
    try {
      res = await upsert(row);
    } catch (error) {
      log({
        event: 'write failed',
        reason: error instanceof Error ? error.message : String(error)
      });
      return reply(500, 'Write failed');
    }
    if (!res.ok) {
      log({ event: 'write failed', status: res.status });
      return reply(500, 'Write failed');
    }
    log({ event: 'stored', action: row.action, identifier: row.identifier });
    return reply(200, 'Stored');
  };
};
