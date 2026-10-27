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
  cacheWrite5m: 0,
  cacheWrite1h: 0
});

vi.mock('./usage.collect', () => ({
  DAY_MS: 86_400_000,
  findTranscripts: () => ({ base: '/b', dirs: [], transcripts: [] }),
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
  });

  it('upserts day, ticket, model and role rows with the service key', async () => {
    const { exit } = await record(['--yes', '--json'], {
      AGENT_SUPABASE_URL: `${URL}/`,
      AGENT_SUPABASE_SERVICE_KEY: KEY
    });
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
      input_tokens: 110,
      output_tokens: 5
    });
    expect(rows[0]?.['day']).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(rows[1]).toMatchObject({ ticket: null, input_tokens: 210 });
    expect(JSON.stringify(ui.printed)).not.toContain(KEY);
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
