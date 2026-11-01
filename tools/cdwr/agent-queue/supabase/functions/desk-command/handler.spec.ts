import {
  STALE_MS,
  createHandler,
  deviceFor,
  parseCommand,
  parseTokens,
  sha256
} from './handler';

const NOW = Date.parse('2026-11-02T10:00:00Z');
const AT = new Date(NOW).toISOString();
const TOKEN = 'mac-token';
const OTHER_TOKEN = 'phone-token';
const BASE = 'https://x.supabase.co/rest/v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

type Options = {
  tokens?: string | undefined;
  supabaseUrl?: string | undefined;
  serviceKey?: string | undefined;
  /** queue_state rows, or a status to fail the read with */
  queue?: unknown[] | number;
  insert?: number;
  patch?: unknown[] | number | 'throw';
  /** status of the desk_commands ack PATCH */
  ack?: number;
  activity?: number;
  fail?: boolean;
};

const setup = async (options: Options = {}) => {
  const tokens =
    'tokens' in options
      ? options.tokens
      : JSON.stringify({
          mac: await sha256(TOKEN),
          phone: await sha256(OTHER_TOKEN)
        });
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async (url, init) => {
      if (options.fail) throw new Error('offline');
      const path = url.slice(BASE.length + 1);
      const method = init.method;
      if (path.startsWith('queue_state?') && method === 'GET') {
        const queue = options.queue ?? [{ at: AT, view: {} }];
        return typeof queue === 'number' ? json([], queue) : json(queue);
      }
      if (path.startsWith('sessions?') && method === 'PATCH') {
        if (options.patch === 'throw') throw new Error('offline');
        const patch = options.patch ?? [{ id: 's1' }];
        return typeof patch === 'number' ? json([], patch) : json(patch);
      }
      if (path.startsWith('desk_commands?id=eq.') && method === 'PATCH')
        return new Response(null, { status: options.ack ?? 204 });
      if (path.startsWith('desk_commands') && method === 'POST')
        return options.insert && options.insert >= 400
          ? json({}, options.insert)
          : json([{ id: 7 }], 201);
      if (path.startsWith('activity') && method === 'POST')
        return new Response(null, { status: options.activity ?? 201 });
      return json({}, 404);
    }
  );
  const log = vi.fn();
  const handle = createHandler({
    tokens,
    supabaseUrl:
      'supabaseUrl' in options ? options.supabaseUrl : 'https://x.supabase.co/',
    serviceKey: 'serviceKey' in options ? options.serviceKey : 'service',
    fetch,
    now: () => NOW,
    log
  });
  return { fetch, log, handle };
};

const post = (
  payload: unknown,
  {
    token = TOKEN,
    authorization,
    method = 'POST'
  }: { token?: string; authorization?: string | null; method?: string } = {}
) => {
  const headers = new Headers();
  const auth = authorization === undefined ? `Bearer ${token}` : authorization;
  if (auth !== null) headers.set('Authorization', auth);
  return new Request('https://x.supabase.co/functions/v1/desk-command', {
    method,
    headers,
    body:
      method === 'POST'
        ? typeof payload === 'string'
          ? payload
          : JSON.stringify(payload)
        : undefined
  });
};

const callsTo = (
  fetch: { mock: { calls: [string, RequestInit][] } },
  fragment: string,
  method?: string
) =>
  fetch.mock.calls.filter(
    ([url, init]) =>
      url.includes(fragment) && (method === undefined || init.method === method)
  );

const bodyOf = (call: [string, RequestInit]) =>
  JSON.parse(call[1].body as string) as Record<string, unknown>;

const HEX = 'a'.repeat(64);

describe('sha256', () => {
  it('matches the known vector', async () => {
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('parseTokens', () => {
  it('reads a device table and lowercases the hashes', () => {
    expect(
      parseTokens(JSON.stringify({ mac: HEX.toUpperCase(), phone: HEX }))
    ).toEqual({ mac: HEX, phone: HEX });
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['not JSON', '{nope'],
    ['an array', JSON.stringify([HEX])],
    ['an empty object', '{}'],
    ['a non-hex hash', JSON.stringify({ mac: 'z'.repeat(64) })],
    ['a short hash', JSON.stringify({ mac: 'abc' })],
    ['a non-string hash', JSON.stringify({ mac: 5 })],
    ['an empty device name', JSON.stringify({ '': HEX })]
  ])('refuses %s', (_name, raw) => {
    expect(parseTokens(raw)).toBeNull();
  });
});

describe('deviceFor', () => {
  const setupTokens = async () => ({
    mac: await sha256('one'),
    phone: await sha256('two'),
    tablet: await sha256('three')
  });

  it('matches the right device among several', async () => {
    const tokens = await setupTokens();
    expect(await deviceFor(tokens, 'Bearer one')).toBe('mac');
    expect(await deviceFor(tokens, 'Bearer two')).toBe('phone');
    expect(await deviceFor(tokens, 'Bearer three')).toBe('tablet');
  });

  it.each([
    ['a missing header', null],
    ['another scheme', 'Basic one'],
    ['a bare token', 'one'],
    ['an empty bearer', 'Bearer '],
    ['a wrong token', 'Bearer nope']
  ])('refuses %s', async (_name, header) => {
    expect(await deviceFor(await setupTokens(), header)).toBeNull();
  });
});

describe('parseCommand', () => {
  it.each(['pause', 'resume', 'run', 'abandon'])('accepts %s', (kind) => {
    expect(parseCommand({ host: 'nuc', kind })).toEqual({
      host: 'nuc',
      kind,
      args: {}
    });
  });

  it('accepts empty args on a kind that takes none', () => {
    expect(parseCommand({ host: 'nuc', kind: 'pause', args: {} })).toEqual({
      host: 'nuc',
      kind: 'pause',
      args: {}
    });
  });

  it('refuses args on a kind that takes none', () => {
    expect(
      parseCommand({ host: 'nuc', kind: 'pause', args: { value: 1 } })
    ).toBe('pause takes no args');
  });

  it.each([
    ['limit', 1],
    ['limit', 20],
    ['cap', 0],
    ['cap', 500],
    ['cap', 12.5]
  ])('accepts %s %s', (kind, value) => {
    expect(parseCommand({ host: 'nuc', kind, args: { value } })).toEqual({
      host: 'nuc',
      kind,
      args: { value }
    });
  });

  it.each([
    ['limit', 0],
    ['limit', 21],
    ['limit', 1.5],
    ['cap', -1],
    ['cap', 501],
    ['limit', '3'],
    ['cap', null],
    ['cap', true]
  ])('refuses %s %j', (kind, value) => {
    expect(typeof parseCommand({ host: 'nuc', kind, args: { value } })).toBe(
      'string'
    );
  });

  it.each([
    ['no args', undefined],
    ['no value', {}],
    ['args that are not an object', 3]
  ])('refuses a limit with %s', (_name, args) => {
    expect(parseCommand({ host: 'nuc', kind: 'limit', args })).toBe(
      'limit takes a value from 1 to 20'
    );
  });

  it.each([
    ['empty', ''],
    ['with spaces', 'a b'],
    ['with a slash', 'a/b'],
    ['too long', 'a'.repeat(65)],
    ['not a string', 5]
  ])('refuses a host that is %s', (_name, host) => {
    expect(parseCommand({ host, kind: 'pause' })).toBe('Bad host');
  });

  it('accepts a host of 64 characters', () => {
    expect(typeof parseCommand({ host: 'a'.repeat(64), kind: 'pause' })).toBe(
      'object'
    );
  });

  it.each([['reboot'], [5], [undefined]])('refuses kind %j', (kind) => {
    expect(parseCommand({ host: 'nuc', kind })).toBe('Bad kind');
  });

  it.each([
    ['a string', 'x'],
    ['null', null],
    ['an array', []]
  ])('refuses %s as the payload', (_name, payload) => {
    expect(parseCommand(payload)).toBe('Not an object');
  });
});

describe('createHandler', () => {
  const session = (state: string) => [
    { at: AT, view: { session: { state, id: 's1', ticket: 'COD-1' } } }
  ];
  const KNOWN = session('alive');
  const stale = (ms: number) => [
    { at: new Date(NOW - ms).toISOString(), view: {} }
  ];

  it('answers OPTIONS with CORS headers', async () => {
    const { handle, fetch } = await setup();
    const res = await handle(post(null, { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain(
      'authorization'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses GET', async () => {
    const { handle } = await setup();
    expect((await handle(post(null, { method: 'GET' }))).status).toBe(405);
  });

  it.each([
    ['no tokens', { tokens: undefined }],
    ['tokens that are not JSON', { tokens: '{nope' }],
    ['no url', { supabaseUrl: undefined }],
    ['no key', { serviceKey: undefined }]
  ])('answers 500 with %s', async (_name, options) => {
    const { handle, fetch, log } = await setup(options);
    const res = await handle(post({ host: 'nuc', kind: 'pause' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Not configured' });
    expect(log).toHaveBeenCalledWith({ event: 'not configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a bad token before reading anything', async () => {
    const { handle, fetch } = await setup();
    const res = await handle(
      post({ host: 'nuc', kind: 'pause' }, { token: 'nope' })
    );
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const { handle, fetch } = await setup();
    const res = await handle(post('{nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Not JSON' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a malformed command with the message', async () => {
    const { handle, fetch } = await setup();
    const res = await handle(post({ host: 'nuc', kind: 'reboot' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Bad kind' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores a pending command for a known host and writes no activity', async () => {
    const { handle, fetch } = await setup();
    const res = await handle(
      post({ host: 'nuc', kind: 'limit', args: { value: 3 } })
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: 7, status: 'pending', note: null });

    const [read] = callsTo(fetch, 'queue_state');
    expect(read[0]).toBe(`${BASE}/queue_state?host=eq.nuc&select=at,view`);
    expect((read[1].headers as Record<string, string>)['apikey']).toBe(
      'service'
    );
    expect((read[1].headers as Record<string, string>)['Authorization']).toBe(
      'Bearer service'
    );

    const [insert] = callsTo(fetch, 'desk_commands');
    expect(insert[0]).toBe(`${BASE}/desk_commands?select=id`);
    expect(insert[1].method).toBe('POST');
    expect(bodyOf(insert)).toEqual({
      host: 'nuc',
      kind: 'limit',
      args: { value: 3 },
      at: AT,
      actor: 'mac',
      status: 'pending',
      applied_at: null,
      note: null
    });
    expect(callsTo(fetch, 'activity')).toHaveLength(0);
  });

  it('refuses a command for a host nothing reports from, and logs activity', async () => {
    const { handle, fetch } = await setup({ queue: [] });
    const res = await handle(post({ host: 'ghost', kind: 'pause' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 7,
      status: 'refused',
      note: 'no scheduler reports from ghost'
    });

    expect(bodyOf(callsTo(fetch, 'desk_commands', 'POST')[0])).toMatchObject({
      status: 'refused',
      note: 'no scheduler reports from ghost',
      applied_at: null
    });
    const [activity] = callsTo(fetch, 'activity');
    expect(activity[0]).toBe(`${BASE}/activity?on_conflict=event_id`);
    expect(bodyOf(activity)).toEqual({
      event_id: 'desk:7',
      at: AT,
      ticket: null,
      actor: 'human',
      change:
        'pause refused from the desk (mac): no scheduler reports from ghost',
      host: 'ghost'
    });
  });

  it.each([
    ['no row', []],
    ['a row exactly STALE_MS old', stale(STALE_MS), true],
    ['a row STALE_MS + 1 old', stale(STALE_MS + 1)],
    ['a row with a non-string at', [{ at: 5, view: {} }]]
  ])('treats a host with %s', async (_name, queue, known = false) => {
    const { handle } = await setup({ queue });
    const res = await handle(post({ host: 'nuc', kind: 'pause' }));
    expect(await res.json()).toEqual(
      known
        ? { id: 7, status: 'pending', note: null }
        : { id: 7, status: 'refused', note: 'no scheduler reports from nuc' }
    );
  });

  it.each([['alive'], ['waiting']])(
    'abandons a %s session and records it as applied',
    async (state) => {
      const { handle, fetch } = await setup({ queue: session(state) });
      const res = await handle(post({ host: 'nuc', kind: 'abandon' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: 7,
        status: 'applied',
        note: null
      });

      expect(
        fetch.mock.calls.map(
          ([url, init]) =>
            `${init.method} ${url.slice(BASE.length + 1).split('?')[0]}`
        )
      ).toEqual([
        'GET queue_state',
        'POST desk_commands',
        'PATCH sessions',
        'PATCH desk_commands',
        'POST activity'
      ]);
      const [patch] = callsTo(fetch, 'sessions', 'PATCH');
      expect(patch[0]).toBe(`${BASE}/sessions?id=eq.s1&state=isdistinct.ended`);
      expect(bodyOf(patch)).toEqual({
        state: 'ended',
        detail: 'abandoned from the desk'
      });
      expect(bodyOf(callsTo(fetch, 'desk_commands', 'POST')[0])).toMatchObject({
        status: 'pending',
        applied_at: null,
        note: null
      });
      const [ack] = callsTo(fetch, 'desk_commands', 'PATCH');
      expect(ack[0]).toBe(`${BASE}/desk_commands?id=eq.7`);
      expect(bodyOf(ack)).toEqual({
        status: 'applied',
        applied_at: AT,
        note: null
      });
      expect(bodyOf(callsTo(fetch, 'activity')[0])).toMatchObject({
        event_id: 'desk:7',
        ticket: 'COD-1',
        actor: 'human',
        host: 'nuc',
        change: 'abandoned COD-1 on nuc from the desk (mac)'
      });
    }
  );

  it.each([
    ['the snapshot has no session', [{ at: AT, view: {} }], undefined],
    ['the session is not open', session('ended'), undefined],
    ['the PATCH matches nothing', KNOWN, []]
  ])('refuses abandon when %s', async (_name, queue, patch) => {
    const { handle, fetch } = await setup({ queue, patch });
    const res = await handle(post({ host: 'nuc', kind: 'abandon' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 7,
      status: 'refused',
      note: 'no open session to abandon'
    });
    expect(bodyOf(callsTo(fetch, 'desk_commands', 'PATCH')[0])).toEqual({
      status: 'refused',
      applied_at: null,
      note: 'no open session to abandon'
    });
    expect(callsTo(fetch, 'activity')).toHaveLength(1);
  });

  it.each([
    ['a failing sessions PATCH', 500],
    ['a throwing sessions PATCH', 'throw' as const]
  ])('acks abandon as refused on %s', async (_name, patch) => {
    const { handle, fetch } = await setup({ queue: KNOWN, patch });
    const res = await handle(post({ host: 'nuc', kind: 'abandon' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; note: string };
    expect(body.status).toBe('refused');
    expect(body.note).toMatch(/^could not end the session: /);
    expect(bodyOf(callsTo(fetch, 'desk_commands', 'PATCH')[0])).toEqual({
      status: 'refused',
      applied_at: null,
      note: body.note
    });
  });

  it.each([
    ['a failing queue_state read', { queue: 500 }],
    ['a failing ack PATCH', { queue: KNOWN, ack: 500 }],
    ['a failing insert', { insert: 500 }],
    ['fetch throwing', { fail: true }]
  ])('answers 500 on %s', async (_name, options) => {
    const { handle, log } = await setup(options);
    const res = await handle(post({ host: 'nuc', kind: 'abandon' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Write failed' });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'write failed' })
    );
  });

  it('still succeeds when the activity upsert fails, and logs it', async () => {
    const { handle, log } = await setup({ queue: [], activity: 500 });
    const res = await handle(post({ host: 'ghost', kind: 'pause' }));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith({
      event: 'activity failed',
      status: 500,
      id: 7
    });
  });
});
