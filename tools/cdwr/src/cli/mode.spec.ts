import { opensApp, wantsPrompts } from './mode';

describe('wantsPrompts', () => {
  it.each([
    [
      'a command path alone on a terminal',
      { tty: true, hasArgs: false, interactive: false, json: false },
      true
    ],
    [
      'arguments given',
      { tty: true, hasArgs: true, interactive: false, json: false },
      false
    ],
    [
      'arguments with --interactive',
      { tty: true, hasArgs: true, interactive: true, json: false },
      true
    ],
    [
      '--json, even with --interactive',
      { tty: true, hasArgs: true, interactive: true, json: true },
      false
    ],
    [
      'no terminal',
      { tty: false, hasArgs: false, interactive: true, json: false },
      false
    ]
  ])('%s', (_label, options, expected) => {
    expect(wantsPrompts(options)).toBe(expected);
  });
});

describe('opensApp', () => {
  it('opens for a bare cdwr on a terminal', () => {
    expect(opensApp([], true)).toBe(true);
  });

  it.each([[['db', 'backup']], [['--json']], [['-v']]])(
    'stays plain for %j',
    (argv) => {
      expect(opensApp(argv, true)).toBe(false);
    }
  );

  it('stays plain without a terminal', () => {
    expect(opensApp([], false)).toBe(false);
  });
});
