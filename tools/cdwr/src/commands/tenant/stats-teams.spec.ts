import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/database', () => ({
  resolveDatabaseUrl: vi.fn(async () => 'postgres://fake'),
  withDatabase: vi.fn((url: string, fn: (url: string) => unknown) => fn(url)),
  runCmsScript: vi.fn(async () => ({ stdout: '', stderr: '' })),
  reported: vi.fn(() => JSON.stringify({ team: 'set' })),
  redactReported: (output: string) => output
}));

vi.mock('../../services/tenant-rows', () => ({
  listTenantRows: vi.fn(async () => [
    row('acme', 'w1'),
    row('beta', 'w2'),
    row('nosite', null)
  ])
}));

vi.mock('../../services/infisical', () => ({}));

vi.mock('../../services/umami', () => ({
  readUmamiProvisioning: vi.fn(async () => ({
    status: 'ready',
    url: 'https://umami.test',
    apiKey: 'k',
    readApiKey: 'r'
  })),
  whoAmI: vi.fn(),
  getWebsite: vi.fn(),
  listTeamUsers: vi.fn(async () => []),
  createTeam: vi.fn(),
  addTeamUser: vi.fn(async () => undefined),
  transferWebsite: vi.fn(async () => undefined)
}));

function row(deployment: string, statsWebsiteId: string | null) {
  return {
    id: deployment === 'acme' ? 1 : 2,
    name: deployment,
    slug: deployment,
    status: 'active',
    deployment,
    apiKey: 'key',
    statsWebsiteId,
    statsShareId: null,
    statsTeamId: null,
    domains: []
  };
}

const run = async (extra: string[] = []) => {
  const command = (await import('./stats-teams')).default;
  const ui = fakeUi([]);
  const out: string[] = [];
  const exit = await runCommand({
    name: 'tenant stats-teams',
    command,
    argv: ['--env', 'production', '--yes', ...extra],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: true,
    ui,
    history: () => undefined,
    stdout: (text: string) => {
      out.push(text);
    }
  });
  return { exit, ui, out: out.join('') };
};

describe('tenant stats-teams', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const umami = await import('../../services/umami');
    vi.mocked(umami.whoAmI).mockImplementation(async (conn) =>
      conn.apiKey === 'k'
        ? { id: 'u-prov', username: 'root', role: 'admin' }
        : { id: 'u-reader', username: 'reader', role: 'user' }
    );
    vi.mocked(umami.getWebsite).mockImplementation(async (_conn, id) => ({
      id,
      name: id,
      domain: `${id}.se`,
      teamId: 'shared'
    }));
    vi.mocked(umami.createTeam).mockImplementation(async (_conn, name) => ({
      id: `team-${name}`,
      name
    }));
  });

  it('refuses a key that is not an admin, also on a dry run', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.whoAmI).mockResolvedValue({
      id: 'u',
      username: 'bob',
      role: 'user'
    });

    const { exit, ui } = await run(['--dry-run']);

    expect(exit).not.toBe(EXIT.ok);
    expect(ui.printed.error.join('\n')).toContain('needs an admin key');
    expect(umami.createTeam).not.toHaveBeenCalled();
  });

  it('lists the steps per workspace and changes nothing on a dry run', async () => {
    const umami = await import('../../services/umami');

    const { exit, ui } = await run(['--dry-run']);

    expect(exit).toBe(EXIT.ok);
    const planned = ui.printed.note.join('\n');
    expect(planned).toContain('acme  create team · move website · add reader');
    expect(planned).not.toContain('nosite');
    expect(umami.createTeam).not.toHaveBeenCalled();
    expect(umami.transferWebsite).not.toHaveBeenCalled();
  });

  it('sets up every workspace and summarizes', async () => {
    const umami = await import('../../services/umami');

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.ok);
    expect(umami.createTeam).toHaveBeenCalledTimes(2);
    expect(umami.transferWebsite).toHaveBeenCalledWith(
      expect.anything(),
      'w1',
      'team-cdwr-acme'
    );
    expect(ui.printed.outro[0]).toContain('2 done, 0 ok, 0 failed');
  });

  it('reports a team that is gone and skips it on apply', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.listTeamUsers).mockImplementation(async (_conn, id) =>
      id === 'gone' ? null : []
    );
    const { listTenantRows } = await import('../../services/tenant-rows');
    vi.mocked(listTenantRows).mockResolvedValueOnce([
      { ...row('acme', 'w1'), statsTeamId: 'gone' },
      row('beta', 'w2')
    ] as never);

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.failed);
    expect(ui.printed.note.join('\n')).toContain(
      'acme  team gone is gone from Umami; clear "Statistics team ID" in the admin and run again'
    );
    expect(umami.createTeam).toHaveBeenCalledTimes(1);
    expect(ui.printed.outro[0]).toContain('1 done, 0 ok, 1 failed');
  });

  it('reports a workspace it could not read and still reads the next', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.getWebsite).mockImplementation(async (_conn, id) => {
      if (id === 'w1') throw new Error('Umami refused: 500');
      return { id, name: id, domain: `${id}.se`, teamId: 'shared' };
    });

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.failed);
    const planned = ui.printed.note.join('\n');
    expect(planned).toContain('acme  could not read: Umami refused: 500');
    expect(planned).toContain('beta  create team');
    expect(umami.createTeam).toHaveBeenCalledTimes(1);
    expect(ui.printed.outro[0]).toContain('1 done, 0 ok, 1 failed');
  });

  it('fails a workspace whose website is gone and goes on', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.getWebsite).mockImplementation(async (_conn, id) =>
      id === 'w1'
        ? null
        : { id, name: id, domain: `${id}.se`, teamId: 'shared' }
    );

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.failed);
    expect(ui.printed.note.join('\n')).toContain(
      'acme  could not read: website w1 is not in Umami; check "Statistics website ID" in the admin'
    );
    expect(umami.createTeam).toHaveBeenCalledTimes(1);
    expect(ui.printed.outro[0]).toContain('1 done, 0 ok, 1 failed');
  });

  it('continues past a failing workspace and exits non-zero', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.createTeam).mockRejectedValueOnce(new Error('boom'));

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.failed);
    expect(umami.createTeam).toHaveBeenCalledTimes(2);
    expect(ui.printed.warn.join('\n')).toContain('acme: boom');
    expect(ui.printed.outro[0]).toContain('1 done, 0 ok, 1 failed');
  });
});
