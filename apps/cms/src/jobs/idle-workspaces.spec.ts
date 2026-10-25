import {
  type IdleDecision,
  type IdleWorkspaceInput,
  decideIdleWorkspace
} from './idle-workspaces';

const NOW = new Date('2026-10-25T03:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const IDLE_DAYS = 30;

const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * DAY).toISOString();

const tenant = (
  overrides: Partial<IdleWorkspaceInput> = {}
): IdleWorkspaceInput => ({
  id: 1,
  name: 'Moon',
  status: 'pending',
  createdAt: daysAgo(0),
  hasPages: false,
  ...overrides
});

describe('decideIdleWorkspace', () => {
  const cases: Array<[string, IdleWorkspaceInput, IdleDecision]> = [
    [
      'active tenant',
      tenant({ status: 'active', createdAt: daysAgo(90) }),
      { action: 'none' }
    ],
    [
      'has pages',
      tenant({ hasPages: true, createdAt: daysAgo(90) }),
      { action: 'none' }
    ],
    [
      'younger than the warning window',
      tenant({ createdAt: daysAgo(22) }),
      { action: 'none' }
    ],
    [
      'exactly at the warning window',
      tenant({ createdAt: daysAgo(23) }),
      { action: 'warn', deleteOn: new Date(NOW.getTime() + 7 * DAY) }
    ],
    [
      'warning window, deletion later than a week away',
      tenant({ createdAt: daysAgo(25) }),
      { action: 'warn', deleteOn: new Date(NOW.getTime() + 7 * DAY) }
    ],
    [
      'warned a week ago but not yet idle long enough',
      tenant({ createdAt: daysAgo(29), idleWarnedAt: daysAgo(7) }),
      { action: 'none' }
    ],
    [
      'warned and idle long enough',
      tenant({ createdAt: daysAgo(30), idleWarnedAt: daysAgo(7) }),
      { action: 'delete' }
    ],
    [
      'warned long ago and far past the limit',
      tenant({ createdAt: daysAgo(60), idleWarnedAt: daysAgo(30) }),
      { action: 'delete' }
    ],
    [
      'warned six days ago',
      tenant({ createdAt: daysAgo(40), idleWarnedAt: daysAgo(6) }),
      { action: 'none' }
    ],
    [
      'setting turned on late: unwarned and long overdue is warned, not deleted',
      tenant({ createdAt: daysAgo(90) }),
      { action: 'warn', deleteOn: new Date(NOW.getTime() + 7 * DAY) }
    ],
    [
      'setting turned on late: warned today is not deleted yet',
      tenant({ createdAt: daysAgo(90), idleWarnedAt: daysAgo(0) }),
      { action: 'none' }
    ],
    [
      'provisioned with a team',
      tenant({ createdAt: daysAgo(40), statsTeamId: 'team' }),
      { action: 'report', reason: 'provisioned' }
    ],
    [
      'provisioned with a website, already reported',
      tenant({
        createdAt: daysAgo(40),
        idleReportedAt: daysAgo(10),
        statsWebsiteId: 'site'
      }),
      { action: 'none' }
    ],
    [
      'provisioned and warned but never reported',
      tenant({
        createdAt: daysAgo(40),
        idleWarnedAt: daysAgo(10),
        statsTeamId: 'team'
      }),
      { action: 'report', reason: 'provisioned' }
    ],
    [
      'warned a week minus a few seconds ago still deletes',
      tenant({
        createdAt: daysAgo(40),
        idleWarnedAt: new Date(NOW.getTime() - 7 * DAY + 30_000).toISOString()
      }),
      { action: 'delete' }
    ],
    [
      'idle period reached a few seconds early still deletes',
      tenant({
        createdAt: new Date(NOW.getTime() - 30 * DAY + 30_000).toISOString(),
        idleWarnedAt: daysAgo(8)
      }),
      { action: 'delete' }
    ],
    [
      'warned well short of a week does not delete',
      tenant({
        createdAt: daysAgo(40),
        idleWarnedAt: new Date(NOW.getTime() - 6 * DAY).toISOString()
      }),
      { action: 'none' }
    ],
    [
      'provisioned but young',
      tenant({ createdAt: daysAgo(5), statsTeamId: 'team' }),
      { action: 'none' }
    ]
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    expect(decideIdleWorkspace(input, IDLE_DAYS, NOW)).toEqual(expected);
  });
});
