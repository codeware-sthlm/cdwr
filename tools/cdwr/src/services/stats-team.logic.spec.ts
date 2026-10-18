import {
  type TenantTeamInput,
  planTenantTeam,
  teamName
} from './stats-team.logic';

const base: TenantTeamInput = {
  statsTeamId: 'team',
  website: { id: 'w1', teamId: 'team' },
  reader: { id: 'r', role: 'user' },
  teamUserIds: ['r']
};

describe('teamName', () => {
  it('prefixes the deployment', () => {
    expect(teamName('acme')).toBe('cdwr-acme');
  });

  it('cuts to 50 characters', () => {
    expect(teamName('a'.repeat(80))).toHaveLength(50);
  });
});

describe('planTenantTeam', () => {
  it('has nothing to do when all is in place', () => {
    expect(planTenantTeam(base)).toEqual({ steps: [], needsAdmin: false });
  });

  it('reports a recorded team that is gone and plans nothing', () => {
    expect(
      planTenantTeam({ ...base, teamMissing: true, teamUserIds: [] })
    ).toEqual({ steps: [], needsAdmin: false, problem: 'team-missing' });
  });

  it('creates the team and adds the reader for a new tenant', () => {
    expect(
      planTenantTeam({
        ...base,
        statsTeamId: null,
        website: null,
        teamUserIds: []
      })
    ).toEqual({ steps: ['create-team', 'add-reader'], needsAdmin: false });
  });

  it('creates the team only when the new tenant reads as an admin', () => {
    expect(
      planTenantTeam({
        ...base,
        statsTeamId: null,
        website: null,
        reader: { id: 'r', role: 'admin' },
        teamUserIds: []
      }).steps
    ).toEqual(['create-team']);
  });

  it('moves a website out of the shared team into a new one', () => {
    expect(
      planTenantTeam({
        ...base,
        statsTeamId: null,
        website: { id: 'w1', teamId: 'shared' },
        teamUserIds: []
      })
    ).toEqual({
      steps: ['create-team', 'move-website', 'add-reader'],
      needsAdmin: true
    });
  });

  it('moves a website that belongs to a user into an existing team', () => {
    expect(
      planTenantTeam({ ...base, website: { id: 'w1', teamId: null } })
    ).toEqual({ steps: ['move-website'], needsAdmin: true });
  });

  it('adds a reader that is not a member', () => {
    expect(planTenantTeam({ ...base, teamUserIds: ['other'] })).toEqual({
      steps: ['add-reader'],
      needsAdmin: false
    });
  });

  it('adds no reader that is an admin', () => {
    expect(
      planTenantTeam({
        ...base,
        reader: { id: 'r', role: 'admin' },
        teamUserIds: []
      }).steps
    ).toEqual([]);
  });

  it('plans no move without a website', () => {
    expect(planTenantTeam({ ...base, website: null }).steps).toEqual([]);
  });
});
