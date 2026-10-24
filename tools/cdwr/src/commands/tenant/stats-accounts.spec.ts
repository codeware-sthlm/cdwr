import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/database', () => ({
  resolveDatabaseUrl: vi.fn(async () => 'postgres://fake'),
  withDatabase: vi.fn((url: string, fn: (url: string) => unknown) => fn(url))
}));

vi.mock('../../services/tenant-rows', () => ({
  listTenantRows: vi.fn(async () => [
    row(1, 'acme', 't1'),
    row(2, 'beta', null)
  ])
}));

vi.mock('../../services/stats-accounts', () => ({
  listAccountUsers: vi.fn(async () => [
    {
      id: 1,
      email: 'ann@acme.se',
      umamiUserId: 'u-ann',
      tenants: [{ tenantId: 1, role: 'admin' }]
    },
    {
      id: 2,
      email: 'cat@acme.se',
      umamiUserId: 'u-cat',
      tenants: [{ tenantId: 1, role: 'admin' }]
    }
  ])
}));

vi.mock('../../services/infisical', () => ({}));

vi.mock('../../services/umami', () => ({
  readUmamiProvisioning: vi.fn(async () => ({
    status: 'ready',
    url: 'https://umami.test',
    apiKey: 'k',
    readApiKey: 'r',
    adminLogin: { username: 'admin', password: 'pw' }
  })),
  loginToken: vi.fn(async () => 'login-token'),
  whoAmI: vi.fn(),
  getTeam: vi.fn(async (_conn: unknown, id: string) => ({ id, name: id })),
  listTeamUsers: vi.fn(async () => [
    { userId: 'owner', role: 'team-owner' },
    { userId: 'reader', role: 'team-view-only' },
    { userId: 'u-ann', role: 'team-view-only' },
    { userId: 'u-bob', role: 'team-view-only' }
  ]),
  listUsers: vi.fn(async () => [
    { id: 'u-bob', username: 'bob@acme.se' },
    { id: 'u-ann', username: 'ann@acme.se' }
  ]),
  listTeams: vi.fn(async () => [{ id: 't1', name: 'cdwr-acme' }]),
  removeTeamUser: vi.fn(async () => undefined)
}));

function row(id: number, deployment: string, statsTeamId: string | null) {
  return {
    id,
    name: deployment,
    slug: deployment,
    status: 'active',
    deployment,
    apiKey: 'key',
    statsWebsiteId: 'w',
    statsShareId: null,
    statsTeamId,
    domains: []
  };
}

const run = async (extra: string[] = []) => {
  const command = (await import('./stats-accounts')).default;
  const ui = fakeUi([]);
  const history = vi.fn();
  const exit = await runCommand({
    name: 'tenant stats-accounts',
    command,
    argv: ['--env', 'production', '--yes', ...extra],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: true,
    ui,
    history,
    stdout: () => undefined
  });
  return { exit, ui, history };
};

describe('tenant stats-accounts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const umami = await import('../../services/umami');
    vi.mocked(umami.whoAmI).mockImplementation(async (conn) =>
      conn.apiKey === 'k'
        ? { id: 'owner', username: 'root', role: 'admin' }
        : { id: 'reader', username: 'reader', role: 'user' }
    );
  });

  it('refuses a key that is not an admin', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.whoAmI).mockResolvedValue({
      id: 'u',
      username: 'bob',
      role: 'user'
    });

    const { exit, ui } = await run();

    expect(exit).not.toBe(EXIT.ok);
    expect(ui.printed.error.join('\n')).toContain('needs an admin key');
  });

  it('reports stale and missing members and changes nothing', async () => {
    const umami = await import('../../services/umami');

    const { exit, ui, history } = await run();

    expect(exit).toBe(EXIT.ok);
    expect(ui.printed.note.join('\n')).toContain(
      'acme  1 ok · stale bob@acme.se · missing u-cat'
    );
    expect(ui.printed.note.join('\n')).not.toContain('beta');
    expect(umami.removeTeamUser).not.toHaveBeenCalled();
    expect(ui.printed.outro[0]).toContain('1 stale, 1 missing');
    expect(history).not.toHaveBeenCalled();
  });

  it('lists the users with the login token', async () => {
    const umami = await import('../../services/umami');

    await run();

    expect(umami.loginToken).toHaveBeenCalledWith(
      'https://umami.test',
      'admin',
      'pw'
    );
    expect(umami.listUsers).toHaveBeenCalledWith(
      expect.anything(),
      'login-token'
    );
  });

  it('skips the user list with one note when the login secrets are missing', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.readUmamiProvisioning).mockResolvedValueOnce({
      status: 'ready',
      url: 'https://umami.test',
      apiKey: 'k',
      readApiKey: 'r'
    });

    const { exit, ui } = await run();

    expect(exit).toBe(EXIT.ok);
    expect(umami.listUsers).not.toHaveBeenCalled();
    expect(
      ui.printed.info.filter((line) => line.includes('Skipping'))
    ).toHaveLength(1);
  });

  it('removes only the stale members with --prune', async () => {
    const umami = await import('../../services/umami');

    const { exit, ui, history } = await run(['--prune']);

    expect(exit).toBe(EXIT.ok);
    expect(umami.removeTeamUser).toHaveBeenCalledTimes(1);
    expect(umami.removeTeamUser).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      'u-bob'
    );
    expect(ui.printed.outro[0]).toContain('1 removed');
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('removes nothing on a dry run', async () => {
    const umami = await import('../../services/umami');

    const { exit } = await run(['--prune', '--dry-run']);

    expect(exit).toBe(EXIT.ok);
    expect(umami.removeTeamUser).not.toHaveBeenCalled();
  });

  it('exits non-zero when a removal fails and goes on', async () => {
    const umami = await import('../../services/umami');
    vi.mocked(umami.removeTeamUser).mockRejectedValueOnce(new Error('boom'));

    const { exit, ui } = await run(['--prune']);

    expect(exit).toBe(EXIT.failed);
    expect(ui.printed.warn.join('\n')).toContain('acme: boom');
  });
});
