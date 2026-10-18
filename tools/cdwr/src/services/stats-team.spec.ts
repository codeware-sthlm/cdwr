import { applyTenantTeam, gatherTenantTeam, requireAdmin } from './stats-team';
import type { TenantTeamInput } from './stats-team.logic';

vi.mock('./database', () => ({
  reported: vi.fn(),
  runCmsScript: vi.fn(),
  withDatabase: vi.fn()
}));

vi.mock('./umami', () => ({
  whoAmI: vi.fn(),
  getWebsite: vi.fn(),
  getTeam: vi.fn(),
  listTeamUsers: vi.fn(),
  createTeam: vi.fn(async () => ({ id: 'team-new', name: 'cdwr-acme' })),
  addTeamUser: vi.fn(async () => undefined),
  transferWebsite: vi.fn(async () => undefined)
}));

const conn = { url: 'https://umami.test', apiKey: 'k' };

const input: TenantTeamInput = {
  statsTeamId: null,
  website: { id: 'w1', teamId: 'shared' },
  reader: { id: 'r', role: 'user' },
  teamUserIds: []
};

describe('requireAdmin', () => {
  it('accepts an admin', async () => {
    const { whoAmI } = await import('./umami');
    vi.mocked(whoAmI).mockResolvedValue({
      id: 'u',
      username: 'root',
      role: 'admin'
    });
    await expect(requireAdmin(conn)).resolves.toBeUndefined();
  });

  it('names the user and the role otherwise', async () => {
    const { whoAmI } = await import('./umami');
    vi.mocked(whoAmI).mockResolvedValue({
      id: 'u',
      username: 'bob',
      role: 'user'
    });
    await expect(requireAdmin(conn)).rejects.toThrow(
      'belongs to "bob" (user); moving websites needs an admin key'
    );
  });
});

describe('applyTenantTeam', () => {
  it('creates the team, stores its id, adds the reader, then moves the website', async () => {
    const calls: string[] = [];
    const { createTeam, addTeamUser, transferWebsite } =
      await import('./umami');
    vi.mocked(createTeam).mockImplementation(async () => {
      calls.push('create');
      return { id: 'team-new', name: 'cdwr-acme' };
    });
    vi.mocked(addTeamUser).mockImplementation(async () => {
      calls.push('add');
    });
    vi.mocked(transferWebsite).mockImplementation(async () => {
      calls.push('move');
    });

    const result = await applyTenantTeam(
      conn,
      { deployment: 'acme' },
      {
        steps: ['create-team', 'move-website', 'add-reader'],
        needsAdmin: true
      },
      input,
      async (id) => {
        calls.push(`write ${id}`);
      }
    );

    expect(calls).toEqual(['create', 'write team-new', 'add', 'move']);
    expect(addTeamUser).toHaveBeenCalledWith(
      conn,
      'team-new',
      'r',
      'team-view-only'
    );
    expect(transferWebsite).toHaveBeenCalledWith(conn, 'w1', 'team-new');
    expect(result).toEqual({
      teamId: 'team-new',
      done: ['create-team', 'add-reader', 'move-website']
    });
  });

  it('stops after storing the id when a later step fails', async () => {
    const { addTeamUser, transferWebsite } = await import('./umami');
    vi.mocked(addTeamUser).mockRejectedValue(new Error('no'));
    vi.mocked(transferWebsite).mockClear();
    const write = vi.fn(async () => undefined);

    await expect(
      applyTenantTeam(
        conn,
        { deployment: 'acme' },
        {
          steps: ['create-team', 'move-website', 'add-reader'],
          needsAdmin: true
        },
        input,
        write
      )
    ).rejects.toThrow('no');
    expect(write).toHaveBeenCalledWith('team-new');
    expect(transferWebsite).not.toHaveBeenCalled();
  });
});

describe('gatherTenantTeam', () => {
  const tenant = { statsWebsiteId: 'w1', statsTeamId: 'team' };

  const setup = async () => {
    const umami = await import('./umami');
    vi.mocked(umami.whoAmI).mockResolvedValue({
      id: 'r',
      username: 'reader',
      role: 'user'
    });
    vi.mocked(umami.getWebsite).mockResolvedValue({
      id: 'w1',
      name: 'Acme',
      domain: 'acme.se',
      teamId: 'team'
    });
    return umami;
  };

  it('lists the members of an existing team', async () => {
    const umami = await setup();
    vi.mocked(umami.getTeam).mockResolvedValue({ id: 'team', name: 'n' });
    vi.mocked(umami.listTeamUsers).mockResolvedValue([
      { userId: 'r', role: 'team-view-only' }
    ]);

    const result = await gatherTenantTeam(conn, conn, tenant);

    expect(result.teamMissing).toBeUndefined();
    expect(result.teamUserIds).toEqual(['r']);
  });

  it('marks a team Umami answers 404 for as missing, without listing members', async () => {
    const umami = await setup();
    vi.mocked(umami.getTeam).mockResolvedValue(null);
    vi.mocked(umami.listTeamUsers).mockClear();

    const result = await gatherTenantTeam(conn, conn, tenant);

    expect(result.teamMissing).toBe(true);
    expect(umami.listTeamUsers).not.toHaveBeenCalled();
  });

  it('finds a deleted team although its member list is an empty 200', async () => {
    const umami = await setup();
    vi.mocked(umami.getTeam).mockResolvedValue(null);
    vi.mocked(umami.listTeamUsers).mockResolvedValue([]);

    expect((await gatherTenantTeam(conn, conn, tenant)).teamMissing).toBe(true);
  });

  it('fails when the recorded website is not in Umami', async () => {
    const umami = await setup();
    vi.mocked(umami.getWebsite).mockResolvedValue(null);

    await expect(gatherTenantTeam(conn, conn, tenant)).rejects.toThrow(
      'website w1 is not in Umami; check "Statistics website ID" in the admin'
    );
  });
});
