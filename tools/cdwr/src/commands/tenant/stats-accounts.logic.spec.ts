import {
  accountsLine,
  findingLines,
  hasFindings,
  planAccounts,
  summarizeAccounts
} from './stats-accounts.logic';

const user = (
  id: number,
  email: string,
  umamiUserId: string | null,
  tenants: Array<{ tenantId: number; role: string }>
) => ({ id, email, umamiUserId, tenants });

const base = {
  teams: [
    {
      deployment: 'acme',
      tenantId: 1,
      teamId: 't1',
      members: ['owner', 'reader', 'u-ann', 'u-bob']
    }
  ],
  users: [
    user(1, 'ann@acme.se', 'u-ann', [{ tenantId: 1, role: 'admin' }]),
    user(2, 'bob@acme.se', 'u-bob', [{ tenantId: 1, role: 'user' }]),
    user(3, 'cat@acme.se', 'u-cat', [{ tenantId: 1, role: 'admin' }])
  ],
  umamiUsers: [
    { id: 'u-ann', username: 'ann@acme.se' },
    { id: 'u-bob', username: 'bob@acme.se' },
    { id: 'u-cat', username: 'cat@acme.se' }
  ],
  umamiTeams: [{ id: 't1', name: 'cdwr-acme' }],
  ignored: ['owner', 'reader']
};

describe('planAccounts', () => {
  it('sorts members into ok, stale and missing, ignoring the keys users', () => {
    const [team] = planAccounts(base).teams;
    expect(team).toMatchObject({
      ok: ['u-ann'],
      stale: ['u-bob'],
      missing: ['u-cat'],
      gone: false
    });
  });

  it('does not count an admin of another workspace', () => {
    const report = planAccounts({
      ...base,
      users: [user(1, 'ann@acme.se', 'u-ann', [{ tenantId: 2, role: 'admin' }])]
    });
    expect(report.teams[0].stale).toEqual(['u-ann', 'u-bob']);
    expect(report.teams[0].missing).toEqual([]);
  });

  it('marks a team that is gone', () => {
    const report = planAccounts({
      ...base,
      teams: [{ ...base.teams[0], members: null }]
    });
    expect(report.teams[0]).toMatchObject({ gone: true, stale: [] });
  });

  it('reports teams no workspace records, only ours', () => {
    const report = planAccounts({
      ...base,
      umamiTeams: [
        ...base.umamiTeams,
        { id: 't9', name: 'cdwr-old' },
        { id: 't8', name: 'marketing' }
      ]
    });
    expect(report.orphans).toEqual([{ id: 't9', name: 'cdwr-old' }]);
  });

  it('reports a Umami user named like an admin with no stored id', () => {
    const report = planAccounts({
      ...base,
      users: [
        ...base.users,
        user(4, 'Dan@acme.se', null, [{ tenantId: 1, role: 'admin' }]),
        user(5, 'eve@acme.se', null, [{ tenantId: 1, role: 'user' }])
      ],
      umamiUsers: [
        ...base.umamiUsers,
        { id: 'u-dan', username: 'dan@acme.se' },
        { id: 'u-eve', username: 'eve@acme.se' }
      ]
    });
    expect(report.unlinked).toEqual([{ id: 'u-dan', username: 'dan@acme.se' }]);
  });
});

describe('lines and summary', () => {
  const report = planAccounts(base);
  const label = (id: string) => `<${id}>`;

  it('words a team line', () => {
    expect(accountsLine(report.teams[0], label)).toBe(
      'acme  1 ok · stale <u-bob> · missing <u-cat>'
    );
  });

  it('says ok for a team in order and gone for a missing one', () => {
    const ok = {
      deployment: 'a',
      teamId: 't',
      gone: false,
      ok: [],
      stale: [],
      missing: []
    };
    expect(accountsLine(ok, label)).toBe('a  ok');
    expect(accountsLine({ ...ok, gone: true }, label)).toBe(
      'a  team t is gone from Umami'
    );
  });

  it('lists the report-only findings', () => {
    expect(
      findingLines({
        teams: [],
        orphans: [{ id: 't9', name: 'cdwr-old' }],
        unlinked: [{ id: 'u', username: 'dan@acme.se' }]
      })
    ).toHaveLength(2);
  });

  it('has no findings when everything matches', () => {
    expect(
      hasFindings(
        planAccounts({
          ...base,
          users: [
            user(1, 'ann@acme.se', 'u-ann', [{ tenantId: 1, role: 'admin' }])
          ],
          teams: [{ ...base.teams[0], members: ['owner', 'u-ann'] }]
        })
      )
    ).toBe(false);
    expect(hasFindings(report)).toBe(true);
  });

  it('summarizes a read-only and a pruning run', () => {
    expect(summarizeAccounts(report, null)).toBe(
      '1 stale, 1 missing, 0 orphan team(s), 0 unlinked'
    );
    expect(
      summarizeAccounts(report, [
        { deployment: 'acme', teamId: 't1', removed: ['u-bob'] }
      ])
    ).toBe(
      '1 removed, 0 team(s) failed, 1 missing, 0 orphan team(s), 0 unlinked'
    );
  });
});
