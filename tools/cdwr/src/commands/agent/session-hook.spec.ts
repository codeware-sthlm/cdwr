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

describe('session-hook.sh', () => {
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

    it('SessionEnd ends with the reason', () => {
      run({
        session_id: 'abc',
        hook_event_name: 'SessionEnd',
        reason: 'clear'
      });
      expect(read()).toMatchObject({ state: 'ended', detail: 'clear' });
    });
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
