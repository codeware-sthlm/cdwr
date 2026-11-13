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
import { dirname, join } from 'node:path';
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
  updatedAt: '2026-10-01T00:00:00Z',
  description: '',
  state: { type: state },
  labels: { nodes: [{ name: 'agent:ready' }] },
  comments: { nodes: [] as Array<{ body: string; createdAt: string }> },
  inverseRelations: { nodes: [] as unknown[] }
});
// A ticket parked on `wait` since 11:00Z today
const parkedTicket = (identifier: string, wait: string, label: string) => ({
  ...ticket(identifier, 'started'),
  labels: { nodes: [{ name: label }] },
  description: `**Next:** Waiting: ${wait} · PR #12${wait.toLowerCase() === 'ci' ? ' @ abc1234' : ''} · since ${new Date().toISOString().slice(0, 16)}Z`
});
const rollup = (state: string) =>
  JSON.stringify({
    data: {
      repository: {
        t0: {
          reviews: { nodes: [] },
          commits: {
            nodes: [
              { commit: { oid: 'abc1234def', statusCheckRollup: { state } } }
            ]
          }
        }
      }
    }
  });
const session = (
  id: string,
  state: string,
  lastSeen: string,
  ticket?: string
) => ({
  id,
  pid: process.pid,
  state,
  lastSeen,
  startedAt: lastSeen,
  ...(ticket ? { ticket } : {})
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
  // A listener stub, run as `<stub> <pid to wake> <state file>`
  const stub = (name: string, body: string) => {
    const cmd = join(dir, `${name}.sh`);
    writeFileSync(cmd, `#!/bin/sh\n${body}\n`);
    chmodSync(cmd, 0o755);
    return cmd;
  };
  // Writes a live state file with a fresh beat (atomically, wait.sh reads it concurrently)
  const BEAT = `beat() {
  printf '{"state":"live","since":"2026-10-01T00:00:00Z","lastBeat":"%s","lastEvent":null,"pid":%s}\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" $$ > "$2.tmp"
  mv "$2.tmp" "$2"
}`;
  // gh answers[n] for call n, like the fake linear; `listener` defaults to a stub that does nothing
  const run = (
    answers: string[],
    args: string[],
    gh: string[] = [],
    listener?: string
  ) => {
    const cmd = fake('linear', answers);
    return spawnSync('zsh', [SCRIPT, ...args], {
      env: {
        ...process.env,
        HOME: dir,
        AGENT_QUEUE_SESSIONS: join(dir, 'sessions'),
        AGENT_QUEUE_LINEAR_CMD: cmd,
        AGENT_QUEUE_LISTEN_CMD: listener ?? stub('no-listener', 'exit 0'),
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
      [response(), response(ticket('COD-2', 'started'))],
      ['--interval', '1', '--max', '20']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('changed: run now: COD-2 ready\n');
  });

  it('counts an error as unchanged and tries again', () => {
    const result = run(
      [response(), 'not json', response(ticket('COD-2', 'started'))],
      ['--interval', '1', '--max', '20']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('changed: run now: COD-2 ready\n');
    expect(readFileSync(join(dir, 'linear-counter'), 'utf8').trim()).toBe('3');
  });

  it('times out on a constant idle pick', () => {
    const result = run([response()], ['--interval', '1', '--max', '2']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^timeout: idle/);
  });

  it('holds an answered plan until its blocker closes', () => {
    const answered = (blocker: string) => ({
      ...ticket('COD-702', 'started'),
      labels: { nodes: [{ name: 'agent:needs-input' }] },
      description:
        '| Step | What | Status |\n| -- | -- | -- |\n| 1 | a | Planned |',
      comments: {
        nodes: [{ body: 'go ahead', createdAt: '2026-10-02T00:00:00Z' }]
      },
      inverseRelations: {
        nodes: [
          {
            type: 'blocks',
            issue: { identifier: 'COD-701', state: { type: blocker } }
          }
        ]
      }
    });
    const held = run([response(answered('started'))], ['--now']);
    expect(held.stdout).toMatch(/^idle/);
    const result = run(
      [response(answered('started')), response(answered('completed'))],
      ['--interval', '1', '--max', '20']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('changed: run now: COD-702 answered\n');
  });

  describe('the listener', { timeout: 20_000 }, () => {
    const idle = response();
    const changed = response(ticket('COD-2', 'started'));
    const calls = () =>
      readFileSync(join(dir, 'linear-counter'), 'utf8').trim();

    it('a wake re-picks before the interval and exits on a changed pick', () => {
      const listener = stub(
        'wake',
        `${BEAT}
beat "$1" "$2"
sleep 1
kill -USR1 "$1"
while true; do sleep 1; beat "$1" "$2"; done`
      );
      const result = run(
        [idle, changed],
        ['--interval', '30', '--fallback', '600', '--max', '20'],
        [],
        listener
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('changed: run now: COD-2 ready\n');
      expect(calls()).toBe('2');
    });

    it('with a live listener the clock re-picks only every --fallback', () => {
      const listener = stub(
        'live',
        `${BEAT}
while true; do beat "$1" "$2"; sleep 1; done`
      );
      const first = run(
        [idle, changed],
        ['--interval', '1', '--fallback', '3', '--max', '10'],
        [],
        listener
      );
      expect(first.stdout).toMatch(/^changed: /);
      expect(calls()).toBe('2');

      // Only the start pick and the one when --max ends the wait; per-interval polling would be 4
      const second = run(
        [idle],
        ['--interval', '1', '--fallback', '100', '--max', '3'],
        [],
        listener
      );
      expect(second.stdout).toMatch(/^timeout: idle/);
      expect(calls()).toBe('2');
    });

    it('without a live state file it re-picks every --interval', () => {
      const result = run(
        [idle, idle, changed],
        ['--interval', '1', '--max', '10']
      );
      expect(result.stdout).toMatch(/^changed: /);
      expect(calls()).toBe('3');
    });

    it('a stale state file counts as down', () => {
      const listener = stub(
        'stale',
        `printf '{"state":"live","since":"2026-10-01T00:00:00Z","lastBeat":"%s","lastEvent":null,"pid":1}\\n' "$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" > "$2"`
      );
      const result = run(
        [idle, changed],
        ['--interval', '1', '--fallback', '100', '--max', '10'],
        [],
        listener
      );
      expect(result.stdout).toMatch(/^changed: /);
      expect(calls()).toBe('2');
    });

    // A dead listener's file lapses after 120 s by the beat rule; the test does not wait for
    // that and relies on the fallback re-pick instead
    it('a listener that exits mid-wait still ends in a re-pick', () => {
      const listener = stub(
        'dies',
        `${BEAT}
beat "$1" "$2"
sleep 2
exit 1`
      );
      const result = run(
        [idle, changed],
        ['--interval', '1', '--fallback', '4', '--max', '15'],
        [],
        listener
      );
      expect(result.stdout).toMatch(/^changed: /);
      expect(calls()).toBe('2');
    });

    // cdwr.mjs runs the CLI with spawnSync and forwards no signal, so the kill has to reach the
    // process under it: a shim-like stub, node around a shell that records its own pid
    it('kills the listener under a shim that forwards no signal', async () => {
      const inner = stub(
        'inner',
        `echo $$ > "${dir}/inner-pid"
while true; do sleep 1; done`
      );
      const listener = stub(
        'shim',
        `${BEAT}
beat "$1" "$2"
exec node -e "require('node:child_process').spawnSync('${inner}', [], { stdio: 'inherit' })"`
      );
      const result = run(
        [idle, changed],
        ['--interval', '1', '--fallback', '2', '--max', '10'],
        [],
        listener
      );
      expect(result.stdout).toMatch(/^changed: /);
      const pid = Number(readFileSync(join(dir, 'inner-pid'), 'utf8'));
      const alive = () => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      for (let i = 0; i < 20 && alive(); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(alive()).toBe(false);
    });

    it('polls without a listener when the Supabase env is missing', () => {
      const result = spawnSync(
        'zsh',
        [SCRIPT, '--interval', '1', '--max', '3'],
        {
          env: {
            ...process.env,
            HOME: dir,
            AGENT_QUEUE_SESSIONS: join(dir, 'sessions'),
            AGENT_QUEUE_LINEAR_CMD: fake('linear', [idle]),
            AGENT_QUEUE_LISTEN_CMD: '',
            AGENT_SUPABASE_URL: '',
            AGENT_SUPABASE_ANON_KEY: '',
            // Not the developer's checkout env file, which may hold both
            AGENT_QUEUE_ENV_FILE: join(dir, 'no-env')
          },
          encoding: 'utf8',
          timeout: 30_000
        }
      );
      expect(result.stdout).toMatch(/^timeout: idle/);
      expect(result.stderr).toMatch(
        /^wait: no AGENT_SUPABASE_URL or AGENT_SUPABASE_ANON_KEY for .*, polling every 1s$/m
      );
      expect(Number(calls())).toBeGreaterThanOrEqual(3);
    });

    it('the listener is gone after wait.sh exits', async () => {
      const listener = stub(
        'gone',
        `${BEAT}
echo $$ > "${dir}/listener-pid"
echo "$2" > "${dir}/listener-file"
while true; do beat "$1" "$2"; sleep 1; done`
      );
      const result = run(
        [idle, changed],
        ['--interval', '1', '--fallback', '2', '--max', '10'],
        [],
        listener
      );
      expect(result.stdout).toMatch(/^changed: /);
      const pid = Number(readFileSync(join(dir, 'listener-pid'), 'utf8'));
      const stateFile = readFileSync(join(dir, 'listener-file'), 'utf8').trim();
      const alive = () => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      for (let i = 0; i < 20 && alive(); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(alive()).toBe(false);
      expect(existsSync(dirname(stateFile))).toBe(false);
    });
  });

  // On a Mac without the scheduler the watch comes from the NUC's queue_state row
  describe('the remote watch', () => {
    const inReview = {
      ...ticket('COD-5', 'started'),
      labels: { nodes: [{ name: 'agent:review' }] }
    };
    const watch = (unresolved: number) =>
      JSON.stringify({
        host: 'nuc',
        at: '2026-11-05T00:00:00Z',
        watch: { 'COD-5': { pr: 12, state: 'open', unresolved } }
      });
    const withWatch = (answers: string[], cmd: string) => {
      const linear = fake('linear', answers);
      return spawnSync('zsh', [SCRIPT, '--now'], {
        env: {
          ...process.env,
          HOME: dir,
          AGENT_QUEUE_HOST: '',
          AGENT_QUEUE_SESSIONS: join(dir, 'sessions'),
          AGENT_QUEUE_LINEAR_CMD: linear,
          AGENT_QUEUE_WATCH_CMD: cmd,
          PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`
        },
        encoding: 'utf8',
        timeout: 30_000
      });
    };

    beforeEach(() => {
      // No launchd job here: the scheduler runs elsewhere
      mkdirSync(join(dir, 'bin'));
      writeFileSync(join(dir, 'bin', 'launchctl'), '#!/bin/sh\nexit 1\n');
      chmodSync(join(dir, 'bin', 'launchctl'), 0o755);
    });

    it('reads review feedback from the remote watch', () => {
      const result = withWatch(
        [response(inReview)],
        `printf '%s' '${watch(1)}'`
      );
      expect(result.stdout).toMatch(/^run now: COD-5 /);
    });

    it('falls back to the local file when the remote is unreadable', () => {
      mkdirSync(join(dir, '.cdwr', 'agent-queue'), { recursive: true });
      writeFileSync(
        join(dir, '.cdwr', 'agent-queue', 'watch.json'),
        JSON.stringify({ 'COD-5': { pr: 12, state: 'open', unresolved: 1 } })
      );
      const result = withWatch([response(inReview)], 'true');
      expect(result.stdout).toMatch(/^run now: COD-5 /);
    });

    it('sees no feedback when the remote watch has none', () => {
      const result = withWatch(
        [response(inReview)],
        `printf '%s' '${watch(0)}'`
      );
      expect(result.stdout).toMatch(/^idle/);
    });
  });

  describe('a run pick at start', () => {
    const register = () => {
      mkdirSync(join(dir, 'sessions'));
      writeFileSync(
        join(dir, 'sessions', 'cur.json'),
        JSON.stringify(session('cur', 'stopped', '2026-10-11T10:00:00Z'))
      );
    };

    it('exits at once when not reported yet', () => {
      const result = run(
        [response(ticket('COD-1', 'backlog'))],
        ['--interval', '1', '--max', '20']
      );
      expect(result.stdout).toBe('changed: run now: COD-1 ready\n');
      expect(readFileSync(join(dir, 'linear-counter'), 'utf8').trim()).toBe(
        '1'
      );
    });

    it('waits for a change once the session has seen it', () => {
      register();
      const args = ['--interval', '1', '--max', '2'];
      const answers = [response(ticket('COD-1', 'backlog'))];
      expect(run(answers, args).stdout).toBe('changed: run now: COD-1 ready\n');
      expect(run(answers, args).stdout).toBe('timeout: run now: COD-1 ready\n');
    });

    it('exits at once when it differs from the one seen', () => {
      register();
      const args = ['--interval', '1', '--max', '2'];
      run([response(ticket('COD-1', 'backlog'))], args);
      expect(run([response(ticket('COD-2', 'backlog'))], args).stdout).toBe(
        'changed: run now: COD-2 ready\n'
      );
    });
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

  it('does not wake on a waiting set change under a running pick', () => {
    const working = {
      ...ticket('COD-9', 'started'),
      labels: { nodes: [{ name: 'agent:working' }] },
      description: `**Claim:** s · /w · ${new Date().toISOString().slice(0, 16)}Z\n**Next:** step 2\n`
    };
    const waiting = (id: string) => ({
      ...ticket(id, 'started'),
      labels: { nodes: [{ name: 'agent:needs-input' }] }
    });
    const result = run(
      [
        response(working, waiting('COD-1')),
        response(working, waiting('COD-2'))
      ],
      ['--interval', '1', '--max', '3']
    );
    expect(result.stdout).toMatch(/^timeout: running/);
  });

  describe("the session's own ticket", () => {
    const working = (claim: boolean, holder = 'cur') => ({
      ...ticket('COD-9', 'started'),
      labels: { nodes: [{ name: 'agent:working' }] },
      description: claim
        ? `**Claim:** ${holder} · /w · ${new Date().toISOString().slice(0, 16)}Z\n**Next:** step 2\n`
        : ''
    });
    const register = (ticketId = 'COD-9') => {
      mkdirSync(join(dir, 'sessions'));
      writeFileSync(
        join(dir, 'sessions', 'cur.json'),
        JSON.stringify(
          session('cur', 'stopped', '2026-10-11T10:00:00Z', ticketId)
        )
      );
    };
    const args = ['--interval', '1', '--max', '2'];

    it('exits at once with a resume line, then waits once seen', () => {
      register();
      const answers = [response(working(true))];
      const t0 = Date.now();
      expect(run(answers, args).stdout).toBe('resume: COD-9 · step 2\n');
      expect(Date.now() - t0).toBeLessThan(1000);
      const t1 = Date.now();
      expect(run(answers, args).stdout).toBe('resume: COD-9 · step 2\n');
      expect(Date.now() - t1).toBeGreaterThanOrEqual(1000);
    });

    it('reads a ticket without a claim line', () => {
      register();
      expect(run([response(working(false))], args).stdout).toBe(
        'resume: COD-9 · no claim line\n'
      );
    });

    it('--now prints the resume line', () => {
      register();
      expect(run([response(working(true))], ['--now']).stdout).toBe(
        'resume: COD-9 · step 2\n'
      );
    });

    it("finds its own ticket behind another session's fresher claim", () => {
      register();
      writeFileSync(
        join(dir, 'sessions', 'other.json'),
        JSON.stringify({
          ...session('other', 'working', '2026-10-11T10:00:00Z', 'COD-8'),
          pid: 1
        })
      );
      const claimed = (
        id: string,
        agoMs: number,
        next: string,
        holder = 'cur'
      ) => ({
        ...ticket(id, 'started'),
        labels: { nodes: [{ name: 'agent:working' }] },
        description: `**Claim:** ${holder} · /w · ${new Date(Date.now() - agoMs).toISOString().slice(0, 16)}Z\n**Next:** ${next}\n`
      });
      const answers = [
        response(
          claimed('COD-8', 0, 'step 1', 'other'),
          claimed('COD-9', 20 * 60_000, 'step 5')
        )
      ];
      expect(run(answers, args).stdout).toBe('resume: COD-9 · step 5\n');
    });

    it("a claim held by another session is not the session's own", () => {
      register();
      expect(run([response(working(true, 'other'))], args).stdout).toMatch(
        /^timeout: running/
      );
    });

    it('a session on another ticket does not see it as its own', () => {
      register('COD-1');
      expect(run([response(working(true))], args).stdout).toMatch(
        /^timeout: running/
      );
    });

    it('without a session file the running pick still times out', () => {
      expect(run([response(working(true))], args).stdout).toMatch(
        /^timeout: running/
      );
    });
  });

  it("wakes when a parked ticket's CI resolves between ticks", () => {
    const result = run(
      [response(parkedTicket('COD-1', 'CI', 'agent:review'))],
      ['--interval', '1', '--max', '20'],
      [rollup('PENDING'), rollup('SUCCESS')]
    );
    expect(result.stdout).toBe(
      'changed: run now: COD-1 parked wait resolved (success)\n'
    );
  });

  it.each(['copilot', 'CI'])(
    'wakes when the PR of a parked %s wait is merged',
    (wait) => {
      const merged = JSON.stringify({
        data: {
          repository: {
            t0: {
              state: 'MERGED',
              reviews: { nodes: [] },
              commits: { nodes: [{ commit: { statusCheckRollup: null } }] }
            }
          }
        }
      });
      const result = run(
        [response(parkedTicket('COD-1', wait, 'agent:working'))],
        ['--interval', '1', '--max', '20'],
        [merged]
      );
      expect(result.stdout).toBe(
        'changed: run now: COD-1 parked wait resolved (merged)\n'
      );
    }
  );

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

    it('shows the limit the desk set in the queue home on an idle pick', () => {
      const idle = run([response()], ['--now']);
      expect(idle.stdout).toMatch(/limit 0\/5/);
      mkdirSync(join(dir, '.cdwr/agent-queue'), { recursive: true });
      writeFileSync(join(dir, '.cdwr/agent-queue/limit'), '2\n');
      const result = run([response()], ['--now']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/limit 0\/2/);
    });

    it('--runnable prints the launch keys an implementing run may take', () => {
      const answered = {
        ...ticket('COD-702', 'started'),
        labels: { nodes: [{ name: 'agent:needs-input' }] },
        comments: {
          nodes: [{ body: 'go ahead', createdAt: '2026-10-02T00:00:00Z' }]
        }
      };
      const result = run(
        [response(ticket('COD-1', 'backlog'), answered)],
        ['--runnable']
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('COD-702 answered\n');
    });

    it('--runnable fails when Linear did not answer', () => {
      const result = run(['not json'], ['--runnable']);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('wait: Linear did not answer\n');
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
      'COD-1': { state: null, reviewed: true, rollup: null, oid: null },
      'COD-2': { state: null, reviewed: false, rollup: 'FAILURE', oid: null }
    });
    expect(calls).toContain('pullRequest(number: 12) { state reviews');
    expect(calls).toContain('commit { oid statusCheckRollup { state } }');
    expect(calls.trim().split('\n')).toHaveLength(1);
    expect(calls).toContain('t0: pullRequest(number: 12)');
    expect(calls).toContain('t1: pullRequest(number: 12)');
  });

  it('reads the PR state', () => {
    const merged = JSON.stringify({
      data: {
        repository: {
          t0: {
            state: 'MERGED',
            reviews: { nodes: [] },
            commits: { nodes: [{ commit: { statusCheckRollup: null } }] }
          }
        }
      }
    });
    const { res } = parkedWaits(
      response(parkedTicket('COD-1', 'ci', 'agent:working')),
      `echo '${merged}'`
    );
    expect(JSON.parse(res.stdout)).toEqual({
      'COD-1': { state: 'MERGED', reviewed: false, rollup: null, oid: null }
    });
  });

  it('prints {} when gh fails or answers nonsense', () => {
    const input = response(parkedTicket('COD-1', 'ci', 'agent:review'));
    expect(parkedWaits(input, 'exit 1').res.stdout.trim()).toBe('{}');
    expect(parkedWaits(input, 'echo nonsense').res.stdout.trim()).toBe('{}');
    expect(parkedWaits(input, 'echo "{}"').res.stdout.trim()).toBe('{}');
  });
});

const LIB = fileURLToPath(
  new URL('../../../agent-queue/lib.sh', import.meta.url)
);

describe.skipIf(!hasZsh)('lib.sh attended_nodes', () => {
  const fold = (input: unknown): unknown =>
    JSON.parse(
      spawnSync('zsh', ['-c', `source "${LIB}"; attended_nodes`], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', AGENT_QUEUE_LINEAR_KEY: 'k' }
      }).stdout
    );

  it('folds the sub-issues into the issues, once each', () => {
    expect(
      fold({
        data: {
          issues: { nodes: [{ identifier: 'COD-1' }] },
          subissues: {
            nodes: [{ identifier: 'COD-1' }, { identifier: 'COD-2' }]
          }
        }
      })
    ).toEqual({
      data: {
        issues: { nodes: [{ identifier: 'COD-1' }, { identifier: 'COD-2' }] }
      }
    });
  });

  it('folds the merged tickets in before the sub-issues, once each', () => {
    expect(
      fold({
        data: {
          issues: { nodes: [{ identifier: 'COD-1' }] },
          merged: {
            nodes: [{ identifier: 'COD-1' }, { identifier: 'COD-3' }]
          },
          subissues: { nodes: [{ identifier: 'COD-2' }] }
        }
      })
    ).toEqual({
      data: {
        issues: {
          nodes: [
            { identifier: 'COD-1' },
            { identifier: 'COD-3' },
            { identifier: 'COD-2' }
          ]
        }
      }
    });
  });

  // An empty queue made from an error would read as nothing to do
  it('leaves an error answer as it came', () => {
    const error = { errors: [{ message: 'rate limited' }] };
    expect(fold(error)).toEqual(error);
  });
});
