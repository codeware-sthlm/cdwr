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
const WAITS = fileURLToPath(
  new URL('../../../agent-queue/waits.sh', import.meta.url)
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
// A ticket parked on `wait` since 11:00Z today
const parkedTicket = (identifier: string, wait: string, label: string) => ({
  ...ticket(identifier, 'started'),
  labels: { nodes: [{ name: label }] },
  description: `**Next:** Waiting: ${wait} · PR #12 · since ${new Date().toISOString().slice(0, 16)}Z`
});
const rollup = (state: string) =>
  JSON.stringify({
    data: {
      repository: {
        t0: {
          reviews: { nodes: [] },
          commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] }
        }
      }
    }
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
  const fake = (name: string, answers: string[]) => {
    const cmd = join(dir, `${name}.sh`);
    writeFileSync(join(dir, `${name}-counter`), '0');
    answers.forEach((a, i) =>
      writeFileSync(join(dir, `${name}-answer-${i}.json`), a)
    );
    writeFileSync(
      cmd,
      `#!/bin/sh
n=$(cat "${dir}/${name}-counter")
echo $((n + 1)) > "${dir}/${name}-counter"
[ "$n" -ge ${answers.length} ] && n=${answers.length - 1}
cat "${dir}/${name}-answer-$n.json"
`
    );
    chmodSync(cmd, 0o755);
    return cmd;
  };
  // gh answers[n] for call n, like the fake linear
  const run = (answers: string[], args: string[], gh: string[] = []) => {
    const cmd = fake('linear', answers);
    return spawnSync('zsh', [SCRIPT, ...args], {
      env: {
        ...process.env,
        HOME: dir,
        AGENT_QUEUE_SESSIONS: join(dir, 'sessions'),
        AGENT_QUEUE_LINEAR_CMD: cmd,
        ...(gh.length > 0 ? { AGENT_QUEUE_GH_CMD: fake('gh', gh) } : {})
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
    expect(readFileSync(join(dir, 'linear-counter'), 'utf8').trim()).toBe('3');
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

  it("wakes when a parked ticket's CI resolves between ticks", () => {
    const result = run(
      [response(parkedTicket('COD-1', 'CI', 'agent:review'))],
      ['--interval', '1', '--max', '20'],
      [rollup('PENDING'), rollup('SUCCESS')]
    );
    expect(result.stdout).toBe(
      'changed: run now: COD-1 parked wait resolved\n'
    );
  });

  it('keeps a parked ticket pending when gh fails', () => {
    const result = run(
      [response(parkedTicket('COD-1', 'CI', 'agent:review'))],
      ['--interval', '1', '--max', '2'],
      ['not json']
    );
    expect(result.stdout).toMatch(/^timeout: idle: /);
  });

  describe('--now', () => {
    it('prints the pick once without a prefix', () => {
      const result = run([response(ticket('COD-1', 'backlog'))], ['--now']);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('run now: COD-1 ready\n');
      expect(readFileSync(join(dir, 'linear-counter'), 'utf8').trim()).toBe(
        '1'
      );
    });

    it('says when Linear did not answer', () => {
      const result = run(['not json'], ['--now']);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('wait: Linear did not answer\n');
    });
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

describe.skipIf(!hasZsh)('parked_waits', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'waits-sh-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Pipes `input` through parked_waits with a gh stub that logs its query
  const parkedWaits = (input: string, ghBody: string) => {
    const gh = join(dir, 'gh.sh');
    writeFileSync(
      gh,
      `#!/bin/sh\nprintf '%s\\n' "$1" >> "${dir}/gh-calls"\n${ghBody}\n`
    );
    chmodSync(gh, 0o755);
    const res = spawnSync('zsh', ['-c', `source "${WAITS}"; parked_waits`], {
      input,
      env: { ...process.env, AGENT_QUEUE_GH_CMD: `${gh} "$1"` },
      encoding: 'utf8'
    });
    const calls = existsSync(join(dir, 'gh-calls'))
      ? readFileSync(join(dir, 'gh-calls'), 'utf8')
      : '';
    return { res, calls };
  };
  const answer = JSON.stringify({
    data: {
      repository: {
        t0: {
          reviews: {
            nodes: [{ author: { login: 'copilot-pull-request-reviewer' } }]
          },
          commits: { nodes: [{ commit: { statusCheckRollup: null } }] }
        },
        t1: {
          reviews: {
            nodes: [{ author: { login: 'someone' } }, { author: null }]
          },
          commits: {
            nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }]
          }
        }
      }
    }
  });

  it('prints {} without calling gh when nothing is parked', () => {
    const { res, calls } = parkedWaits(
      response(ticket('COD-1', 'backlog')),
      `echo '${answer}'`
    );
    expect(res.stdout.trim()).toBe('{}');
    expect(calls).toBe('');
  });

  it('reads each parked ticket with one query', () => {
    const { res, calls } = parkedWaits(
      response(
        parkedTicket('COD-1', 'copilot', 'agent:review'),
        parkedTicket('COD-2', 'ci', 'agent:working'),
        ticket('COD-3', 'started')
      ),
      `echo '${answer}'`
    );
    expect(JSON.parse(res.stdout)).toEqual({
      'COD-1': { reviewed: true, rollup: null, oid: null },
      'COD-2': { reviewed: false, rollup: 'FAILURE', oid: null }
    });
    expect(calls).toContain('commit { oid statusCheckRollup { state } }');
    expect(calls.trim().split('\n')).toHaveLength(1);
    expect(calls).toContain('t0: pullRequest(number: 12)');
    expect(calls).toContain('t1: pullRequest(number: 12)');
  });

  it('prints {} when gh fails or answers nonsense', () => {
    const input = response(parkedTicket('COD-1', 'ci', 'agent:review'));
    expect(parkedWaits(input, 'exit 1').res.stdout.trim()).toBe('{}');
    expect(parkedWaits(input, 'echo nonsense').res.stdout.trim()).toBe('{}');
    expect(parkedWaits(input, 'echo "{}"').res.stdout.trim()).toBe('{}');
  });
});
