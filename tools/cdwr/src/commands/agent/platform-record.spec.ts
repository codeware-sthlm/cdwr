import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import { failed, ok } from './platform.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const collect = vi.hoisted(() => ({
  readDatabase: vi.fn(),
  readFly: vi.fn(),
  readSwitches: vi.fn(),
  readSentry: vi.fn(),
  readVisitors: vi.fn(),
  readDeploy: vi.fn(),
  readReleases: vi.fn(),
  readBackup: vi.fn(),
  readDbPeak: vi.fn(),
  writeDbPeak: vi.fn(),
  readPlatformAlerts: vi.fn(),
  writePlatformAlerts: vi.fn(),
  sendNotice: vi.fn()
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
      statsWebsiteId: null,
      domains: []
    }
  ],
  db: {
    sizeBytes: 1,
    sessions: 1,
    poolerSessions: 1,
    seesAllSessions: true,
    connections: 30,
    maxConnections: 60,
    reservedConnections: 3,
    sessionsOpened: 1040,
    byApplication: { Supavisor: 1, postgres: 29 }
  }
});

const lastPeak = {
  day: '2000-01-01',
  connections: 55,
  at: '2000-01-01T10:00:00.000Z',
  counted: true,
  sessionsOpened: 900
};

const withHome = { ...env, AGENT_QUEUE_HOME: '/queue' };
const DOWN_KEY = '_shared:down:cdwr-cms';
const DOWN_TEXT = 'Platform: cdwr-cms is down · Health check answered 502';

const downApp = (...names: string[]) =>
  ok(
    (names.length > 0 ? names : ['cdwr-cms']).map((name) => ({
      name,
      machines: ok([{ id: 'm', state: 'started', region: 'arn' }]),
      certs: ok([]),
      health: { ok: false, status: 502, ms: 5 }
    }))
  );

const deployed = ok({
  runId: 7,
  sha: 'd'.repeat(40),
  conclusion: 'success',
  url: 'https://github.com/codeware-sthlm/cdwr/actions/runs/7',
  at: '2026-11-15T09:00:00Z'
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
    collect.readSentry
      .mockReset()
      .mockResolvedValue(
        ok({ org: 'cdwr', day: {}, week: {}, open: {}, tops: {}, fresh: {} })
      );
    collect.readVisitors.mockReset().mockResolvedValue({});
    collect.readDeploy.mockReset().mockResolvedValue(deployed);
    collect.readReleases
      .mockReset()
      .mockResolvedValue({ fetchError: null, projects: {} });
    collect.readBackup.mockReset().mockReturnValue(null);
    collect.readDbPeak.mockReset().mockReturnValue(lastPeak);
    collect.writeDbPeak.mockReset();
    collect.readPlatformAlerts.mockReset().mockReturnValue({});
    collect.writePlatformAlerts.mockReset();
    collect.sendNotice.mockReset().mockResolvedValue(true);
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
    expect(collect.writeDbPeak).not.toHaveBeenCalled();
  });

  it('records the connections against the usable limit, and keeps the peak once sent', async () => {
    const { exit } = await record(['--yes', '--json'], env);
    expect(exit).toBe(EXIT.ok);
    const rows = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      key: string;
      db: Record<string, unknown>;
    }[];
    const shared = rows.find((r) => r.key === '_shared');
    // The last peak is from another day, so this tick's sample starts the new one
    expect(shared?.db).toMatchObject({
      connections: 30,
      limit: 57,
      peak: { connections: 30 },
      opened: 140,
      byApplication: { Supavisor: 1, postgres: 29 }
    });
    expect(collect.writeDbPeak).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ connections: 30, sessionsOpened: 1040 })
    );
  });

  it('keeps the last peak when the database was not read', async () => {
    collect.readDatabase.mockResolvedValue(failed('psql failed'));
    await record(['--yes', '--json'], env);
    expect(collect.writeDbPeak).not.toHaveBeenCalled();
  });

  it('records no count or peak while the role sees only its own sessions, and says so', async () => {
    const read = database.ok ? database.value : null;
    if (!read) throw new Error('fixture');
    collect.readDatabase.mockResolvedValue(
      ok({ ...read, db: { ...read.db, seesAllSessions: false } })
    );
    await record(['--yes', '--json'], env);
    // The sessions opened are still counted, the peak is not
    expect(collect.writeDbPeak).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ connections: null, sessionsOpened: 1040 })
    );
    const rows = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      key: string;
      db: Record<string, unknown>;
      errors: Record<string, string>;
    }[];
    const shared = rows.find((r) => r.key === '_shared');
    expect(shared?.db).toMatchObject({
      sessions: 1,
      connections: null,
      peak: null,
      opened: 140,
      byApplication: {}
    });
    expect(shared?.errors['db']).toContain('pg_read_all_stats');
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
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    expect(init?.headers).not.toHaveProperty('Authorization');
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

  it('asks for the releases of the commits the machines run, and records the signals', async () => {
    const stale = 'a'.repeat(40);
    collect.readFly.mockResolvedValue(
      ok([
        {
          name: 'cdwr-cms',
          machines: ok([
            {
              id: 'm',
              state: 'started',
              region: 'arn',
              config: { env: { GIT_SHA: stale } }
            }
          ]),
          certs: ok([]),
          health: { ok: true, status: 200, ms: 1 }
        }
      ])
    );
    collect.readReleases.mockResolvedValue({
      fetchError: null,
      projects: {
        cms: ok({
          latest: 'cms-1.1.0',
          machines: { [stale]: ok({ version: 'cms-1.0.0', current: false }) }
        })
      }
    });
    collect.readSentry.mockResolvedValue(failed('not configured'));
    const { exit } = await record(['--yes', '--json'], env);
    expect(exit).toBe(EXIT.ok);
    expect(collect.readReleases).toHaveBeenCalledWith('/ws/codeware', {
      cms: [stale]
    });
    const rows = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      key: string;
      apps: { behind: boolean | null }[];
      deploy: { sha?: string };
      errors: Record<string, string>;
    }[];
    const shared = rows.find((r) => r.key === '_shared');
    expect(shared?.apps[0]?.behind).toBe(true);
    expect(shared?.deploy.sha).toBe('d'.repeat(40));
    expect(rows.every((r) => r.errors['sentry'] === 'not configured')).toBe(
      true
    );
  });

  it('asks for no commits when fly was not read', async () => {
    collect.readFly.mockResolvedValue(failed('fly down'));
    await record(['--yes', '--json'], env);
    expect(collect.readReleases).toHaveBeenCalledWith('/ws/codeware', {});
  });

  describe('urgent notices', () => {
    beforeEach(() => {
      collect.readFly.mockResolvedValue(downApp());
    });

    const pendingDown = { [DOWN_KEY]: { at: '2026-01-01', sent: false } };
    const toldDown = { [DOWN_KEY]: { at: '2026-01-01', sent: true } };

    it('waits a tick before a down notice, remembering the key as unsent', async () => {
      const { exit } = await record(['--yes', '--json'], withHome);
      expect(exit).toBe(EXIT.ok);
      expect(collect.sendNotice).not.toHaveBeenCalled();
      expect(collect.writePlatformAlerts).toHaveBeenCalledWith(withHome, {
        [DOWN_KEY]: { at: expect.any(String), sent: false }
      });
    });

    it('sends one urgent notice on the second tick, then remembers the key as sent', async () => {
      collect.readPlatformAlerts.mockReturnValue(pendingDown);
      const { exit } = await record(['--yes', '--json'], withHome);
      expect(exit).toBe(EXIT.ok);
      expect(collect.sendNotice).toHaveBeenCalledTimes(1);
      expect(collect.sendNotice).toHaveBeenCalledWith(withHome, DOWN_TEXT);
      expect(collect.writePlatformAlerts).toHaveBeenLastCalledWith(withHome, {
        [DOWN_KEY]: { at: '2026-01-01', sent: true }
      });
    });

    it('sends nothing for a key already told', async () => {
      collect.readPlatformAlerts.mockReturnValue(toldDown);
      await record(['--yes', '--json'], withHome);
      expect(collect.sendNotice).not.toHaveBeenCalled();
      expect(collect.writePlatformAlerts).toHaveBeenCalledWith(
        withHome,
        toldDown
      );
    });

    it('seeds the first run without sending', async () => {
      collect.readPlatformAlerts.mockReturnValue(null);
      await record(['--yes', '--json'], withHome);
      expect(collect.sendNotice).not.toHaveBeenCalled();
      expect(collect.writePlatformAlerts).toHaveBeenCalledWith(withHome, {
        [DOWN_KEY]: { at: expect.any(String), sent: true }
      });
    });

    it('keeps the key unsent when the notice did not go, so the next tick tries again', async () => {
      collect.readPlatformAlerts.mockReturnValue(pendingDown);
      collect.sendNotice.mockResolvedValue(false);
      await record(['--yes', '--json'], withHome);
      expect(collect.writePlatformAlerts).toHaveBeenLastCalledWith(
        withHome,
        pendingDown
      );
    });

    it('writes the state after each notice that went out, so a dying loop keeps them', async () => {
      collect.readFly.mockResolvedValue(downApp('cdwr-cms', 'cdwr-cms-two'));
      collect.readPlatformAlerts.mockReturnValue({
        [DOWN_KEY]: { at: '2026-01-01', sent: false },
        '_shared:down:cdwr-cms-two': { at: '2026-01-01', sent: false }
      });
      collect.sendNotice
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('boom'));
      await record(['--yes', '--json'], withHome);
      expect(collect.writePlatformAlerts).toHaveBeenCalledWith(withHome, {
        [DOWN_KEY]: { at: '2026-01-01', sent: true },
        '_shared:down:cdwr-cms-two': { at: '2026-01-01', sent: false }
      });
    });

    it('still sends the notices when the prune fails, then fails the command', async () => {
      collect.readPlatformAlerts.mockReturnValue(pendingDown);
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 201 }))
        .mockResolvedValueOnce(new Response('no', { status: 500 }));
      const { exit } = await record(['--yes', '--json'], withHome);
      expect(collect.sendNotice).toHaveBeenCalledTimes(1);
      expect(collect.writePlatformAlerts).toHaveBeenLastCalledWith(
        withHome,
        toldDown
      );
      expect(exit).toBe(EXIT.failed);
    });

    it('sends and writes nothing when the upsert fails', async () => {
      fetchMock.mockResolvedValue(new Response('no', { status: 500 }));
      const { exit } = await record(['--yes', '--json'], withHome);
      expect(exit).not.toBe(EXIT.ok);
      expect(collect.sendNotice).not.toHaveBeenCalled();
      expect(collect.writePlatformAlerts).not.toHaveBeenCalled();
    });

    it('lists the notice as a step on a dry run, sending and writing nothing', async () => {
      collect.readPlatformAlerts.mockReturnValue(pendingDown);
      const { exit } = await record(['--dry-run'], withHome);
      expect(exit).toBe(EXIT.ok);
      expect(JSON.stringify(ui.printed)).toContain(DOWN_TEXT);
      expect(collect.sendNotice).not.toHaveBeenCalled();
      expect(collect.writePlatformAlerts).not.toHaveBeenCalled();
    });

    it('raises no notice without a queue home', async () => {
      await record(['--yes', '--json'], env);
      expect(collect.readPlatformAlerts).not.toHaveBeenCalled();
      expect(collect.sendNotice).not.toHaveBeenCalled();
      expect(collect.writePlatformAlerts).not.toHaveBeenCalled();
    });
  });

  it('fails, without printing the key, when Supabase refuses', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
    const { exit } = await record(['--yes'], env);
    expect(exit).toBe(EXIT.failed);
    expect(JSON.stringify(ui.printed)).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(collect.writeDbPeak).not.toHaveBeenCalled();
  });
});
