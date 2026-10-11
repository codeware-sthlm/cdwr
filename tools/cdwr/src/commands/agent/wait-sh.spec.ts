import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/wait.sh', import.meta.url)
);

// The fields ATTENDED_QUERY selects, as far as watch.jq `attended` reads them
const ticket = (identifier: string, state: string) => ({
  identifier,
  priority: 2,
  createdAt: '2026-10-01T00:00:00Z',
  completedAt: null,
  description: '',
  state: { type: state },
  labels: { nodes: [{ name: 'agent:ready' }] },
  comments: { nodes: [] },
  inverseRelations: { nodes: [] }
});
const session = (id: string, state: string, lastSeen: string) => ({
  id,
  pid: process.pid,
  state,
  lastSeen,
  startedAt: lastSeen
});
const response = (...nodes: ReturnType<typeof ticket>[]) =>
  JSON.stringify({ data: { issues: { nodes } } });

// The queue scripts run on macOS only; a CI runner without zsh skips them
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe.skipIf(!hasZsh)('wait.sh', () => {
  let dir: string;

  // A fake linear: answers[n] for call n (the last one repeats)
  const run = (answers: string[], args: string[]) => {
    const cmd = join(dir, 'linear.sh');
    writeFileSync(join(dir, 'counter'), '0');
    answers.forEach((a, i) => writeFileSync(join(dir, `answer-${i}.json`), a));
    writeFileSync(
      cmd,
      `#!/bin/sh
n=$(cat "${dir}/counter")
echo $((n + 1)) > "${dir}/counter"
[ "$n" -ge ${answers.length} ] && n=${answers.length - 1}
cat "${dir}/answer-$n.json"
`
    );
    chmodSync(cmd, 0o755);
    return spawnSync('zsh', [SCRIPT, ...args], {
      env: {
        ...process.env,
        HOME: dir,
        AGENT_QUEUE_SESSIONS: join(dir, 'sessions'),
        AGENT_QUEUE_LINEAR_CMD: cmd
      },
      encoding: 'utf8',
      timeout: 30_000
    });
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wait-sh-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits on a changed pick', () => {
    const result = run(
      [
        response(ticket('COD-1', 'backlog')),
        response(ticket('COD-2', 'started'))
      ],
      ['--interval', '1', '--max', '20']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('changed: run now: COD-2 ready\n');
  });

  it('counts an error as unchanged and tries again', () => {
    const result = run(
      [
        response(ticket('COD-1', 'backlog')),
        'not json',
        response(ticket('COD-2', 'started'))
      ],
      ['--interval', '1', '--max', '20']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('changed: run now: COD-2 ready\n');
    expect(readFileSync(join(dir, 'counter'), 'utf8').trim()).toBe('3');
  });

  it('times out on a constant pick', () => {
    const result = run(
      [response(ticket('COD-1', 'backlog'))],
      ['--interval', '1', '--max', '2']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('timeout: run now: COD-1 ready\n');
  });

  it('wakes when only the waiting set changes', () => {
    const waiting = (...ids: string[]) =>
      response(
        ...ids.map((id) => ({
          ...ticket(id, 'started'),
          labels: { nodes: [{ name: 'agent:needs-input' }] }
        }))
      );
    const result = run(
      [waiting('COD-1'), waiting('COD-1', 'COD-2')],
      ['--interval', '1', '--max', '20']
    );
    expect(result.stdout).toMatch(/^changed: /);
  });

  describe('watcher file', () => {
    const sessions = () => join(dir, 'sessions');

    it('is written while running and removed on exit', async () => {
      mkdirSync(sessions());
      writeFileSync(
        join(sessions(), 'old.json'),
        JSON.stringify(session('old', 'ended', '2026-10-11T12:00:00Z'))
      );
      writeFileSync(
        join(sessions(), 'cur.json'),
        JSON.stringify(session('cur', 'stopped', '2026-10-11T10:00:00Z'))
      );
      const cmd = join(dir, 'linear.sh');
      writeFileSync(
        cmd,
        `#!/bin/sh\ncat <<'EOF'\n${response(ticket('COD-1', 'backlog'))}\nEOF\n`
      );
      chmodSync(cmd, 0o755);
      const child = spawn('zsh', [SCRIPT, '--interval', '1', '--max', '3'], {
        env: {
          ...process.env,
          HOME: dir,
          AGENT_QUEUE_SESSIONS: sessions(),
          AGENT_QUEUE_LINEAR_CMD: cmd
        },
        stdio: 'ignore'
      });
      const watcher = join(sessions(), 'cur.watcher');
      for (let i = 0; i < 40 && !existsSync(watcher); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(readFileSync(watcher, 'utf8').trim()).toBe(String(child.pid));
      expect(existsSync(join(sessions(), 'old.watcher'))).toBe(false);
      await new Promise((r) => child.once('exit', r));
      expect(existsSync(watcher)).toBe(false);
    });
  });
});
