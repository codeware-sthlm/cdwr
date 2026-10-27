import {
  type AttendState,
  attendPath,
  describeStep,
  planAttend,
  ready,
  startLine,
  upToDate
} from './attend.logic';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);

const state = (over: Partial<AttendState> = {}): AttendState => ({
  exists: true,
  ofThisClone: true,
  dirty: false,
  detached: true,
  head: OLD,
  main: NEW,
  lockfileChanged: false,
  hasNodeModules: true,
  ...over
});

describe('planAttend', () => {
  it.each([
    ['missing', { exists: false }, 'does not exist'],
    ['foreign', { ofThisClone: false }, 'not a worktree of this clone'],
    ['dirty', { dirty: true }, 'uncommitted changes'],
    ['on a branch', { detached: false }, 'on a branch']
  ] satisfies [string, Partial<AttendState>, string][])(
    'refuses when %s',
    (_name, over, why) => {
      expect(planAttend(state(over), '/w/q')).toEqual({
        refuse: expect.stringContaining(why)
      });
    }
  );

  it('checks the checkout before looking at the commits', () => {
    expect(planAttend(state({ exists: false, dirty: true }), '/w/q')).toEqual({
      refuse: '/w/q does not exist'
    });
  });

  it.each([
    ['behind', {}, ['switch']],
    [
      'behind with a new lockfile',
      { lockfileChanged: true },
      ['switch', 'install']
    ],
    [
      'behind without node_modules',
      { hasNodeModules: false },
      ['switch', 'install']
    ],
    ['current', { head: NEW }, []],
    [
      'current without node_modules',
      { head: NEW, hasNodeModules: false },
      ['install']
    ]
  ] satisfies [string, Partial<AttendState>, string[]][])(
    'steps when %s',
    (_name, over, steps) => {
      expect(planAttend(state(over), '/w/q')).toEqual({ steps, main: NEW });
    }
  );
});

describe('texts', () => {
  it('names the checkout beside the workspace', () => {
    expect(attendPath('/w/codeware-cod-1')).toBe('/w/codeware-queue');
  });

  it('prints the start line', () => {
    expect(startLine('/w/q')).toBe('cd /w/q && claude "/work-queue"');
  });

  it('shortens the sha', () => {
    expect(describeStep('switch', NEW)).toBe('Switch to origin/main bbbbbbbb');
    expect(describeStep('install', NEW)).toBe('Install dependencies');
    expect(ready(NEW)).toBe('The checkout is at origin/main bbbbbbbb');
    expect(upToDate(NEW)).toBe('Already at origin/main bbbbbbbb');
  });
});
