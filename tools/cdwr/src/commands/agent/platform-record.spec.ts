import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import { failed, ok } from './platform.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const collect = vi.hoisted(() => ({
  readDatabase: vi.fn(),
  readFly: vi.fn(),
  readSwitches: vi.fn()
}));

vi.mock('./platform.collect', () => ({
  DATABASE_URL_ENV: 'PLATFORM_DATABASE_URL',
  ...collect
}));

const KEY = 'sb_secret_abc';
const URL = 'https://x.supabase.co';
const DB_URL = 'postgres://user:pw@db.internal:5432/cms';
const env = {
  AGENT_SUPABASE_URL: URL,
  AGENT_SUPABASE_SERVICE_KEY: KEY,
  PLATFORM_DATABASE_URL: DB_URL
};

const database = ok({
  tenants: [
    {
      slug: 'acme',
      name: 'Acme',
      deployment: 'acme',
      status: 'active',
      domains: []
    }
  ],
  db: { sizeBytes: 1, sessions: 1, byApplication: { cms: 1 } }
});

describe('agent platform-record', () => {
  let ui: ReturnType<typeof fakeUi>;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    collect.readDatabase.mockReset().mockResolvedValue(database);
    collect.readFly.mockReset().mockResolvedValue(ok([]));
    collect.readSwitches.mockReset().mockResolvedValue(ok([]));
    ui = fakeUi([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function record(argv: string[], vars: Record<string, string>) {
    const command = (await import('./platform-record')).default;
    const exit = await runCommand({
      name: 'agent platform-record',
      command,
      argv,
      root: '/ws/codeware',
      env: vars,
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
    return { exit };
  }

  it('does nothing, saying which variables are missing, when they are not set', async () => {
    const { exit } = await record(['--yes'], {
      AGENT_SUPABASE_URL: URL,
      AGENT_SUPABASE_SERVICE_KEY: KEY
    });
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(collect.readDatabase).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain('PLATFORM_DATABASE_URL');
    expect(JSON.stringify(ui.printed)).not.toContain(KEY);
  });

  it('does nothing with no environment at all', async () => {
    const { exit } = await record(['--yes'], {});
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dry run reads, shows the rows and sends nothing', async () => {
    const { exit } = await record(['--dry-run'], env);
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain('acme');
  });

  it('upserts the tenant rows and the shared row, then deletes the vanished', async () => {
    const { exit } = await record(['--yes', '--json'], env);
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock.mock.calls.map((c) => c[1]?.method)).toEqual([
      'POST',
      'DELETE'
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${URL}/rest/v1/tenant_state?on_conflict=key`);
    expect(init?.headers).toMatchObject({
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    const rows = JSON.parse(String(init?.body)) as { key: string }[];
    expect(rows.map((r) => r.key)).toEqual(['acme', '_shared']);
    const [delUrl] = fetchMock.mock.calls[1] ?? [];
    expect(decodeURIComponent(String(delUrl))).toBe(
      `${URL}/rest/v1/tenant_state?key=not.in.("acme","_shared")`
    );
    expect(JSON.stringify([ui.printed, init?.body])).not.toContain(DB_URL);
  });

  it('records a failed tenants read and deletes nothing', async () => {
    collect.readDatabase.mockResolvedValue(failed('psql failed'));
    const { exit } = await record(['--yes', '--json'], env);
    expect(exit).toBe(EXIT.ok);
    expect(fetchMock.mock.calls.map((c) => c[1]?.method)).toEqual(['POST']);
    const rows = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      key: string;
      errors: Record<string, string>;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: '_shared',
      errors: { tenants: 'psql failed', db: 'psql failed' }
    });
  });

  it('fails, without printing the key, when Supabase refuses', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
    const { exit } = await record(['--yes'], env);
    expect(exit).toBe(EXIT.failed);
    expect(JSON.stringify(ui.printed)).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
