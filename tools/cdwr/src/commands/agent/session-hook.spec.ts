import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/session-hook.sh', import.meta.url)
);

const REGISTER = {
  session_id: 'abc',
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'tools/cdwr/agent-queue/session.sh register' },
  cwd: '/work'
};

// The queue scripts run on macOS only; a CI runner without zsh skips them
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe.skipIf(!hasZsh)('session-hook.sh', () => {
  let dir: string;

  const run = (payload: unknown, sessions = dir) =>
    spawnSync('zsh', [SCRIPT], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      env: { ...process.env, AGENT_QUEUE_SESSIONS: sessions },
      encoding: 'utf8'
    });
  const read = () => JSON.parse(readFileSync(join(dir, 'abc.json'), 'utf8'));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'session-hook-'));
  });
  afterEach(() => {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates nothing for an unregistered session', () => {
    const result = run({
      session_id: 'abc',
      hook_event_name: 'PostToolUse',
      tool_name: 'Read'
    });
    expect(result.status).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('registers on the marker command', () => {
    expect(run(REGISTER).status).toBe(0);
    expect(read()).toMatchObject({
      id: 'abc',
      state: 'working',
      ticket: null,
      detail: null,
      cwd: '/work'
    });
    expect(read().startedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(typeof read().pid).toBe('number');
  });

  it.each([
    ["grep 'agent-queue/session.sh register' x"],
    ['echo tools/cdwr/agent-queue/session.sh register'],
    ['tools/cdwr/agent-queue/session.sh register && true']
  ])('does not register on %s', (command) => {
    run({ ...REGISTER, tool_input: { command } });
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each([
    ['./tools/cdwr/agent-queue/session.sh register'],
    ['/abs/path/tools/cdwr/agent-queue/session.sh register\n']
  ])('registers on %s', (command) => {
    run({ ...REGISTER, tool_input: { command } });
    expect(read()).toMatchObject({ id: 'abc', state: 'working' });
  });

  it.each([
    [
      'tools/cdwr/agent-queue/session.sh register; cat ~/.cdwr/agent-queue/notify-level || echo all',
      'registered work-queue session\nall\n'
    ],
    [
      'cd /work/codeware-cod-1 && tools/cdwr/agent-queue/session.sh register',
      'registered work-queue session\n'
    ]
  ])('registers on the printed line from %s', (command, stdout) => {
    run({ ...REGISTER, tool_input: { command }, tool_response: { stdout } });
    expect(read()).toMatchObject({ id: 'abc', state: 'working' });
  });

  it('does not register on output that only mentions the line', () => {
    run({
      ...REGISTER,
      tool_input: {
        command: 'grep -n registered tools/cdwr/agent-queue/session.sh'
      },
      tool_response: {
        stdout: '6:  register) print -r -- "registered work-queue session" ;;\n'
      }
    });
    expect(readdirSync(dir)).toEqual([]);
  });

  describe('once registered', () => {
    beforeEach(() => {
      run(REGISTER);
    });

    it('PostToolUse refreshes lastSeen and clears a waiting state', () => {
      run({
        session_id: 'abc',
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt'
      });
      const before = read();
      expect(before.state).toBe('waiting');
      run({
        session_id: 'abc',
        hook_event_name: 'PostToolUse',
        tool_name: 'Read'
      });
      expect(read()).toMatchObject({ state: 'working', detail: null });
      expect(read().lastSeen >= before.lastSeen).toBe(true);
    });

    it.each([
      ['permission_prompt', 'waiting', 'permission_prompt'],
      ['idle_prompt', 'working', null],
      ['elicitation_dialog', 'waiting', 'elicitation_dialog'],
      ['auth_success', 'working', null]
    ])('Notification %s -> %s', (type, state, detail) => {
      run({
        session_id: 'abc',
        hook_event_name: 'Notification',
        notification_type: type
      });
      expect(read()).toMatchObject({ state, detail });
    });

    it('Stop without a watcher stops', () => {
      run({ session_id: 'abc', hook_event_name: 'Stop' });
      expect(read().state).toBe('stopped');
    });

    it('Stop with a live watcher polls', () => {
      writeFileSync(join(dir, 'abc.watcher'), String(process.pid));
      run({ session_id: 'abc', hook_event_name: 'Stop' });
      expect(read().state).toBe('polling');
    });

    it('Stop with a dead watcher pid stops', () => {
      writeFileSync(join(dir, 'abc.watcher'), '999999999');
      run({ session_id: 'abc', hook_event_name: 'Stop' });
      expect(read().state).toBe('stopped');
      expect(existsSync(join(dir, 'abc.watcher'))).toBe(true);
    });

    const bash = (command: string, stdout?: string) =>
      run({
        ...REGISTER,
        tool_input: { command },
        ...(stdout === undefined ? {} : { tool_response: { stdout } })
      });

    it.each([
      [
        'tools/cdwr/agent-queue/session.sh ticket COD-7',
        'work-queue ticket COD-7\n'
      ],
      [
        'tools/cdwr/agent-queue/session.sh ticket COD-7 && git status --short',
        'work-queue ticket COD-7\n M a.ts\n'
      ],
      [
        'cd /work/codeware-cod-7 && tools/cdwr/agent-queue/session.sh ticket COD-7',
        'work-queue ticket COD-7\n'
      ],
      ['./tools/cdwr/agent-queue/session.sh ticket COD-7', undefined]
    ])('records the ticket from %s', (command, stdout) => {
      bash(command, stdout);
      expect(read()).toMatchObject({ ticket: 'COD-7', state: 'working' });
    });

    it('keeps the ticket across other tool calls and clears it on -', () => {
      bash(
        'tools/cdwr/agent-queue/session.sh ticket COD-7',
        'work-queue ticket COD-7\n'
      );
      bash('git log -1', 'abc123 fix\n');
      expect(read().ticket).toBe('COD-7');
      bash(
        'tools/cdwr/agent-queue/session.sh ticket -',
        'work-queue ticket -\n'
      );
      expect(read().ticket).toBeNull();
    });

    it('takes the last ticket line of a chained call', () => {
      bash(
        'session.sh ticket COD-7; session.sh ticket COD-8',
        'work-queue ticket COD-7\nwork-queue ticket COD-8\n'
      );
      expect(read().ticket).toBe('COD-8');
    });

    it.each([
      [
        'grep -n ticket tools/cdwr/agent-queue/session.sh',
        '10:      COD-<->|-) print -r -- "work-queue ticket $2" ;;\n'
      ],
      ['echo tools/cdwr/agent-queue/session.sh ticket COD-7', undefined],
      ['tools/cdwr/agent-queue/session.sh ticket COD-x', '']
    ])('records no ticket from %s', (command, stdout) => {
      bash(command, stdout);
      expect(read().ticket).toBeNull();
    });

    it('SessionEnd ends with the reason', () => {
      run({
        session_id: 'abc',
        hook_event_name: 'SessionEnd',
        reason: 'clear'
      });
      expect(read()).toMatchObject({ state: 'ended', detail: 'clear' });
    });
  });

  it('ignores a ticket line from an unregistered session', () => {
    run({
      ...REGISTER,
      tool_input: { command: 'tools/cdwr/agent-queue/session.sh ticket COD-7' },
      tool_response: { stdout: 'work-queue ticket COD-7\n' }
    });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('exits 0 silently on garbage', () => {
    const result = run('not json {{{');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('exits 0 silently when the directory is unwritable', () => {
    chmodSync(dir, 0o500);
    const result = run(REGISTER, join(dir, 'nested'));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(existsSync(join(dir, 'nested'))).toBe(false);
  });
});
