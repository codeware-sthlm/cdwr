import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/session.sh', import.meta.url)
);

// The queue scripts run on macOS only; a CI runner without zsh skips them
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe.skipIf(!hasZsh)('session.sh id', () => {
  let dir: string;

  const run = () =>
    spawnSync('zsh', [SCRIPT, 'id'], {
      env: { ...process.env, AGENT_QUEUE_SESSIONS: dir },
      encoding: 'utf8'
    });
  const write = (id: string, over: Record<string, unknown> = {}) =>
    writeFileSync(
      join(dir, `${id}.json`),
      JSON.stringify({
        id,
        pid: process.pid,
        state: 'working',
        lastSeen: '2026-10-11T10:00:00Z',
        ...over
      })
    );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'session-sh-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints the id of the session whose pid is an ancestor', () => {
    write('mine');
    write('other', { pid: 1 });
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('mine\n');
  });

  it('skips an ended session', () => {
    write('gone', { state: 'ended' });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('exits 1 when none is registered', () => {
    write('other', { pid: 1 });
    expect(run()).toMatchObject({ status: 1, stdout: '' });
  });

  it('refuses an id with a character outside the id set', () => {
    write('bad id', { id: 'bad id' });
    expect(run()).toMatchObject({ status: 1, stdout: '' });
  });

  it('exits 1 without a sessions directory', () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    rmSync(dir, { recursive: true });
    expect(run()).toMatchObject({ status: 1, stdout: '' });
  });
});
