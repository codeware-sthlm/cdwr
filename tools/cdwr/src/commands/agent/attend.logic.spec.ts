import {
  type AttendState,
  attendPath,
  describeStart,
  describeStep,
  parseTicket,
  planAttend,
  ready,
  startLine,
  startPrompt,
  upToDate
} from './attend.logic';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);

const NO_START = { start: false };

const state = (over: Partial<AttendState> = {}): AttendState => ({
  exists: true,
  ofThisClone: true,
  dirty: false,
  detached: true,
  head: OLD,
  main: NEW,
  markerMatches: true,
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
      expect(planAttend(state(over), '/w/q', NO_START)).toEqual({
        refuse: expect.stringContaining(why)
      });
    }
  );

  it('checks the checkout before looking at the commits', () => {
    expect(
      planAttend(state({ exists: false, dirty: true }), '/w/q', NO_START)
    ).toEqual({
      refuse: '/w/q does not exist'
    });
  });

  it.each([
    ['behind', {}, ['switch', 'install']],
    [
      'behind, install not current',
      { markerMatches: false },
      ['switch', 'install']
    ],
    ['current', { head: NEW }, []],
    [
      'current, install not current',
      { head: NEW, markerMatches: false },
      ['install']
    ]
  ] satisfies [string, Partial<AttendState>, string[]][])(
    'steps when %s',
    (_name, over, steps) => {
      expect(planAttend(state(over), '/w/q', NO_START)).toEqual({
        steps,
        main: NEW
      });
    }
  );
});

describe('planAttend with start', () => {
  it.each([
    ['behind', {}, ['switch', 'install', 'start']],
    ['current', { head: NEW }, ['start']],
    [
      'current, install not current',
      { head: NEW, markerMatches: false },
      ['install', 'start']
    ]
  ] satisfies [string, Partial<AttendState>, string[]][])(
    'ends with the start when %s',
    (_name, over, steps) => {
      expect(planAttend(state(over), '/w/q', { start: true })).toEqual({
        steps,
        main: NEW
      });
    }
  );

  it('still refuses', () => {
    expect(planAttend(state({ dirty: true }), '/w/q', { start: true })).toEqual(
      { refuse: expect.stringContaining('uncommitted changes') }
    );
  });
});

describe('parseTicket', () => {
  it.each([
    ['COD-652', 'COD-652'],
    ['cod-7', 'COD-7'],
    [' Cod-12 ', 'COD-12']
  ])('accepts %j as %s', (value, ticket) => {
    expect(parseTicket(value)).toBe(ticket);
  });

  it.each(['COD-x', '123', '', 'COD-', 'ABC-1', 'COD-1 2'])(
    'refuses %j',
    (value) => {
      expect(parseTicket(value)).toBeUndefined();
    }
  );
});

describe('texts', () => {
  it('builds the prompt with and without a ticket', () => {
    expect(startPrompt()).toBe('/work-queue');
    expect(startPrompt('COD-7')).toBe('/work-queue COD-7');
  });

  it('puts the ticket in the start line', () => {
    expect(startLine('/w/q', 'COD-7')).toBe(
      'cd \'/w/q\' && claude "/work-queue COD-7"'
    );
  });

  it('describes the start', () => {
    expect(describeStart('/w/q')).toBe('Start /work-queue in /w/q');
    expect(describeStart('/w/q', 'COD-7')).toBe(
      'Start /work-queue COD-7 in /w/q'
    );
  });

  it('names the checkout beside the workspace', () => {
    expect(attendPath('/w/codeware-cod-1')).toBe('/w/codeware-queue');
  });

  it('prints the start line', () => {
    expect(startLine('/w/q')).toBe('cd \'/w/q\' && claude "/work-queue"');
  });

  it.each([
    ['a space', '/w/my q', `cd '/w/my q' && claude "/work-queue"`],
    ['an apostrophe', "/w/it's", `cd '/w/it'\\''s' && claude "/work-queue"`]
  ])('quotes a path with %s', (_name, path, line) => {
    expect(startLine(path)).toBe(line);
  });

  it('shortens the sha', () => {
    expect(describeStep('switch', NEW)).toBe('Switch to origin/main bbbbbbbb');
    expect(describeStep('install', NEW)).toBe(
      'Install dependencies when the lockfile changed'
    );
    expect(ready(NEW)).toBe('The checkout is at origin/main bbbbbbbb');
    expect(upToDate(NEW)).toBe('Already at origin/main bbbbbbbb');
  });
});
