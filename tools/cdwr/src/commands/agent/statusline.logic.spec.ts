import {
  mainCheckout,
  planStatusline,
  settingsPath,
  statuslineCommand
} from './statusline.logic';

const COMMAND = `/bin/zsh '/repo/tools/cdwr/agent-queue/statusline.sh'`;

describe('settingsPath', () => {
  it.each([
    [{}, '/home/me/.claude/settings.json'],
    [{ CLAUDE_CONFIG_DIR: '' }, '/home/me/.claude/settings.json'],
    [{ CLAUDE_CONFIG_DIR: '/cfg' }, '/cfg/settings.json']
  ])('%j -> %s', (env, expected) => {
    expect(settingsPath(env, '/home/me')).toBe(expected);
  });
});

describe('mainCheckout', () => {
  it.each([
    ['/repo/.git', '/repo'],
    ['/repo/.git\n', '/repo'],
    ['/repo/.git/', '/repo']
  ])('%j -> %s', (commonDir, expected) => {
    expect(mainCheckout(commonDir)).toBe(expected);
  });
});

describe('statuslineCommand', () => {
  it('runs the script under zsh with the path single-quoted', () => {
    expect(statuslineCommand('/repo')).toBe(COMMAND);
  });

  it.each([["/it's/repo"], ['relative/repo']])('refuses %s', (root) => {
    expect(statuslineCommand(root)).toBeUndefined();
  });
});

describe('planStatusline', () => {
  it('installs into a missing file', () => {
    expect(planStatusline(undefined, COMMAND)).toEqual({
      kind: 'install',
      next: `${JSON.stringify({ statusLine: { type: 'command', command: COMMAND } }, null, 2)}\n`
    });
  });

  it('keeps every other key', () => {
    const plan = planStatusline('{"model":"opus","hooks":{"a":1}}', COMMAND);
    expect(plan.kind).toBe('install');
    if (plan.kind !== 'install') return;
    expect(JSON.parse(plan.next)).toEqual({
      model: 'opus',
      hooks: { a: 1 },
      statusLine: { type: 'command', command: COMMAND }
    });
    expect(plan.next.endsWith('\n')).toBe(true);
  });

  it('is current when the command is ours', () => {
    const text = JSON.stringify({
      statusLine: { type: 'command', command: COMMAND }
    });
    expect(planStatusline(text, COMMAND)).toEqual({ kind: 'current' });
  });

  it('moves our own status line from another checkout', () => {
    const old = `/bin/zsh '/elsewhere/wt/tools/cdwr/agent-queue/statusline.sh'`;
    const plan = planStatusline(
      JSON.stringify({
        model: 'opus',
        statusLine: { type: 'command', command: old }
      }),
      COMMAND
    );
    expect(plan.kind).toBe('install');
    if (plan.kind !== 'install') return;
    expect(plan.replaces).toBe(old);
    expect(JSON.parse(plan.next)).toEqual({
      model: 'opus',
      statusLine: { type: 'command', command: COMMAND }
    });
  });

  it.each([
    ["/bin/zsh '/x/tools/cdwr/agent-queue/statusline.sh' --extra"],
    ['/bin/zsh /x/tools/cdwr/agent-queue/statusline.sh'],
    ["/bin/bash '/x/tools/cdwr/agent-queue/statusline.sh'"]
  ])('leaves %s alone as another status line', (command) => {
    const current = { type: 'command', command };
    expect(
      planStatusline(JSON.stringify({ statusLine: current }), COMMAND)
    ).toEqual({ kind: 'taken', current });
  });

  it('never overwrites another status line', () => {
    const current = { type: 'command', command: 'ccstatusline' };
    expect(
      planStatusline(JSON.stringify({ statusLine: current }), COMMAND)
    ).toEqual({ kind: 'taken', current });
  });

  it.each([[''], ['{not json'], ['[]'], ['null'], ['"x"']])(
    'is invalid for %j',
    (text) => {
      expect(planStatusline(text, COMMAND)).toEqual({ kind: 'invalid' });
    }
  );
});
