import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const NOW = '2026-10-27T10:00:00.000Z';
const tokens = (input: number, output: number) => ({
  input,
  output,
  cacheRead: 10,
  cacheWrite5m: 4,
  cacheWrite1h: 1
});

const findCalls: unknown[] = [];

vi.mock('./usage.collect', () => ({
  DAY_MS: 86_400_000,
  findTranscripts: (_root: string, _days: number, options?: unknown) => {
    findCalls.push(options);
    return { base: '/b', dirs: [], transcripts: [] };
  },
  readReplies: () => ({
    skippedLines: 0,
    records: [
      {
        id: 'a',
        output: 5,
        timestamp: '2026-10-27T09:00:00.000Z',
        role: 'orchestrating',
        ticket: 'COD-1',
        model: 'claude-opus-4-7',
        tokens: tokens(100, 5)
      },
      {
        id: 'b',
        output: 7,
        timestamp: '2026-10-27T09:30:00.000Z',
        role: 'orchestrating',
        ticket: 'unattributed',
        model: 'claude-opus-4-7',
        tokens: tokens(200, 7)
      },
      {
        id: 'c',
        output: 3,
        timestamp: '2026-10-27T09:45:00.000Z',
        role: 'other',
        ticket: 'unattributed',
        model: 'claude-opus-4-7',
        tokens: tokens(50, 3)
      }
    ]
  })
}));

const KEY = 'sb_secret_abc';
const URL = 'https://x.supabase.co';

describe('agent usage-record', () => {
  let ui: ReturnType<typeof fakeUi>;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    findCalls.length = 0;
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    ui = fakeUi([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function record(argv: string[], env: Record<string, string>) {
    const command = (await import('./usage-record')).default;
    const out: string[] = [];
    const exit = await runCommand({
      name: 'agent usage-record',
      command,
      argv,
      root: '/ws/codeware',
      env,
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (line) => out.push(line)
    });
    return { exit, out };
  }

  it('does nothing, saying why, when the env is not set', async () => {
    const { exit } = await record(['--yes'], {});
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain('AGENT_SUPABASE_URL');
  });

  it('dry run shows the rows and sends nothing', async () => {
    const { exit } = await record(['--dry-run'], {
      AGENT_SUPABASE_URL: URL,
      AGENT_SUPABASE_SERVICE_KEY: KEY
    });
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain('COD-1');
    expect(JSON.stringify(ui.printed)).toContain('2026-10-27T09:00:00.000Z');
  });

  it('upserts day, ticket, model and role rows with the service key', async () => {
    const { exit } = await record(['--yes', '--json'], {
      AGENT_SUPABASE_URL: `${URL}/`,
      AGENT_SUPABASE_SERVICE_KEY: KEY
    });
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      `${URL}/rest/v1/usage?on_conflict=day,ticket,model,role,host`
    );
    expect(init?.headers).toMatchObject({
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    const rows = JSON.parse(String(init?.body)) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ticket: 'COD-1',
      model: 'claude-opus-4-7',
      role: 'orchestrating',
      input_tokens: 115,
      output_tokens: 5,
      cache_read_tokens: 10,
      cache_write_tokens: 5
    });
    expect(rows[0]?.['day']).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(rows[1]).toMatchObject({ ticket: null, input_tokens: 215 });
    expect(JSON.stringify(ui.printed)).not.toContain(KEY);
  });

  const env = { AGENT_SUPABASE_URL: URL, AGENT_SUPABASE_SERVICE_KEY: KEY };

  it('sends hour rows of every project and prunes this host with --kind hour', async () => {
    const { exit } = await record(['--yes', '--json', '--kind', 'hour'], env);
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(findCalls).toHaveLength(1);
    expect(findCalls[0]).toMatchObject({ allProjects: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      `${URL}/rest/v1/usage_hours?on_conflict=hour,model,role,host`
    );
    const rows = JSON.parse(String(init?.body)) as Record<string, unknown>[];
    expect(rows.map((r) => r['role'])).toEqual(['orchestrating', 'other']);
    expect(rows[0]).toMatchObject({
      hour: '2026-10-27T09:00:00.000Z',
      input_tokens: 330
    });
    const [delUrl, delInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(delUrl)).toMatch(
      /^https:\/\/x\.supabase\.co\/rest\/v1\/usage_hours\?host=eq\.[^&]+&hour=lt\.2026-10-13T10%3A00%3A00\.000Z$/
    );
    expect(delInit).toMatchObject({
      method: 'DELETE',
      headers: { apikey: KEY, Prefer: 'return=minimal' }
    });
  });

  it('sends only day rows with --kind day', async () => {
    const { exit } = await record(['--yes', '--json', '--kind', 'day'], env);
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/rest/v1/usage?');
    expect(findCalls[0]).toBeUndefined();
  });

  it('sends day rows, hour rows and the cleanup by default', async () => {
    await record(['--yes', '--json'], env);
    expect(fetchMock.mock.calls.map((c) => c[1]?.method)).toEqual([
      'POST',
      'POST',
      'DELETE'
    ]);
  });

  it('fails when Supabase refuses, without printing the key', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
    const { exit } = await record(['--yes'], {
      AGENT_SUPABASE_URL: URL,
      AGENT_SUPABASE_SERVICE_KEY: KEY
    });
    expect(exit).toBe(EXIT.failed);
    expect(JSON.stringify(ui.printed)).not.toContain(KEY);
  });
});
