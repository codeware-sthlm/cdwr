import {
  MAX_AGE_MS,
  createHandler,
  sign,
  toRow,
  verifySignature
} from './handler';

const SECRET = 'whsec-test';
const NOW = Date.parse('2026-10-28T22:00:00Z');
const AT = new Date(NOW);

const issueEvent = (extra: Record<string, unknown> = {}) => ({
  action: 'update',
  type: 'Issue',
  data: { id: 'uuid-1', identifier: 'COD-645', title: 'Secret title' },
  webhookTimestamp: NOW,
  ...extra
});

const setup = (
  options: { secret?: string; status?: number; fail?: boolean } = {}
) => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => {
      if (options.fail) throw new Error('offline');
      return new Response(null, { status: options.status ?? 201 });
    }
  );
  const log = vi.fn();
  const handle = createHandler({
    secret: 'secret' in options ? options.secret : SECRET,
    supabaseUrl: 'https://x.supabase.co/',
    serviceKey: 'service',
    fetch,
    now: () => NOW,
    log
  });
  return { fetch, log, handle };
};

const post = async (
  payload: unknown,
  {
    signature,
    method = 'POST'
  }: { signature?: string | null; method?: string } = {}
) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers = new Headers();
  const sig = signature === undefined ? await sign(SECRET, body) : signature;
  if (sig !== null) headers.set('Linear-Signature', sig);
  return new Request('https://x.supabase.co/functions/v1/linear-webhook', {
    method,
    headers,
    body: method === 'POST' ? body : undefined
  });
};

describe('verifySignature', () => {
  it('accepts the HMAC of the body, in either case', async () => {
    const sig = await sign(SECRET, 'body');
    expect(await verifySignature(SECRET, 'body', sig)).toBe(true);
    expect(await verifySignature(SECRET, 'body', sig.toUpperCase())).toBe(true);
  });

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['another secret', 'other']
  ])('refuses %s', async (_name, value) => {
    const signature = value === 'other' ? await sign('other', 'body') : value;
    expect(await verifySignature(SECRET, 'body', signature)).toBe(false);
  });

  it('refuses a body changed after signing', async () => {
    const sig = await sign(SECRET, 'body');
    expect(await verifySignature(SECRET, 'body ', sig)).toBe(false);
  });
});

describe('toRow', () => {
  it('maps an Issue event to its id and identifier', () => {
    expect(toRow(issueEvent(), AT)).toEqual({
      issue_id: 'uuid-1',
      identifier: 'COD-645',
      action: 'issue:update',
      updated_at: AT.toISOString()
    });
  });

  it('maps a Comment event to the issue it belongs to', () => {
    expect(
      toRow(
        {
          action: 'create',
          type: 'Comment',
          data: { id: 'c-1', issueId: 'uuid-1', body: 'private words' }
        },
        AT
      )
    ).toEqual({
      issue_id: 'uuid-1',
      identifier: null,
      action: 'comment:create',
      updated_at: AT.toISOString()
    });
  });

  it('takes the identifier from a Comment event when it carries one', () => {
    expect(
      toRow(
        {
          action: 'remove',
          type: 'Comment',
          data: { issueId: 'uuid-1', issue: { identifier: 'COD-645' } }
        },
        AT
      )?.identifier
    ).toBe('COD-645');
  });

  it.each([
    ['another type', { action: 'update', type: 'Project', data: { id: 'p' } }],
    ['no action', { type: 'Issue', data: { id: 'uuid-1' } }],
    ['no data', { action: 'update', type: 'Issue' }],
    ['an Issue without id', { action: 'update', type: 'Issue', data: {} }],
    [
      'a Comment without issueId',
      { action: 'create', type: 'Comment', data: { id: 'c' } }
    ]
  ])('ignores %s', (_name, payload) => {
    expect(toRow(payload, AT)).toBeNull();
  });
});

describe('createHandler', () => {
  it('upserts the row on issue_id with the service key, and nothing of the payload', async () => {
    const { handle, fetch } = setup();
    const res = await handle(await post(issueEvent()));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://x.supabase.co/rest/v1/issue_events?on_conflict=issue_id'
    );
    expect(init.headers).toMatchObject({
      apikey: 'service',
      Authorization: 'Bearer service',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    expect(String(init.body)).not.toContain('Secret title');
    expect(JSON.parse(String(init.body))).toEqual({
      issue_id: 'uuid-1',
      identifier: 'COD-645',
      action: 'issue:update',
      updated_at: AT.toISOString()
    });
  });

  it.each([
    ['a missing signature', null],
    ['a wrong signature', 'deadbeef']
  ])('answers 401 to %s and writes nothing', async (_name, signature) => {
    const { handle, fetch } = setup();
    const res = await handle(await post(issueEvent(), { signature }));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['older than the window', NOW - MAX_AGE_MS - 1],
    ['ahead of the window', NOW + MAX_AGE_MS + 1],
    ['missing', undefined]
  ])('answers 400 to a timestamp %s', async (_name, webhookTimestamp) => {
    const { handle, fetch } = setup();
    const res = await handle(await post(issueEvent({ webhookTimestamp })));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a timestamp at the edge of the window', async () => {
    const { handle } = setup();
    const res = await handle(
      await post(issueEvent({ webhookTimestamp: NOW - MAX_AGE_MS }))
    );
    expect(res.status).toBe(200);
  });

  it('answers 400 to a signed body that is not JSON', async () => {
    const { handle } = setup();
    expect((await handle(await post('not json'))).status).toBe(400);
  });

  it('answers 200 without writing for an event it does not store', async () => {
    const { handle, fetch } = setup();
    const res = await handle(
      await post({
        action: 'update',
        type: 'Project',
        data: { id: 'p' },
        webhookTimestamp: NOW
      })
    );
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['answers an error', { status: 500 }],
    ['cannot be reached', { fail: true }]
  ])(
    'answers 500 when the database %s, so Linear retries',
    async (_name, options) => {
      const { handle } = setup(options);
      expect((await handle(await post(issueEvent()))).status).toBe(500);
    }
  );

  it('refuses everything without a secret', async () => {
    const { handle, fetch } = setup({ secret: undefined });
    expect((await handle(await post(issueEvent()))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 405 to anything but POST', async () => {
    const { handle } = setup();
    expect((await handle(await post('', { method: 'GET' }))).status).toBe(405);
  });
});
