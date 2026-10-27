import { execFile, execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { RUN_INTERVAL_SECONDS } from './agent.logic';

// run.sh runs gh unattended as Håkan, so every gh call must be a read
const SCRIPT = readFileSync(
  fileURLToPath(new URL('../../../agent-queue/run.sh', import.meta.url)),
  'utf8'
);

const READS = [/^gh pr list /, /^gh api graphql -f query="\$PR_QUERY" /];

describe('run.sh', () => {
  const calls = SCRIPT.split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.match(/\bgh\s.*/g) ?? []);

  it('calls gh', () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each(calls)('only reads: %s', (call) => {
    expect(READS.some((read) => read.test(call))).toBe(true);
  });

  // The suggest session reads review threads through the read-only wrapper, never raw GraphQL
  it('allows the suggest session no raw gh api', () => {
    expect(SCRIPT).toContain(
      '"Bash(tools/cdwr/agent-queue/gh-review.sh threads *)"'
    );
    expect(SCRIPT).not.toContain('Bash(gh api');
  });

  // Tool search hides the Linear tools from a run limited by --tools
  it('runs claude without tool search', () => {
    expect(SCRIPT).toMatch(/^ENABLE_TOOL_SEARCH=false claude -p /m);
  });

  // A dark wake has no network; that is not a Linear failure worth a record
  it('skips offline before the first Linear call', () => {
    const offline = SCRIPT.indexOf('if offline; then');
    expect(offline).toBeGreaterThan(0);
    expect(offline).toBeLessThan(SCRIPT.search(/\$\(linear "/));
  });

  it('fails a clean run that planned nothing', () => {
    expect(SCRIPT).toMatch(/note "fail: planned nothing/);
  });

  // wait.sh keeps <id>.seen per session; it goes with the session, and an orphan is swept
  it('removes the .seen file with its session, and orphans', () => {
    expect(SCRIPT).toContain(
      'rm -f "$f" "${f%.json}.watcher" "${f%.json}.seen"'
    );
    expect(SCRIPT).toContain('[[ -f "${w%.seen}.json" ]] || rm -f "$w"');
  });

  // The watcher's liveness comes from <id>.watcher, not from the session JSON
  it('reads the watcher pid from the .watcher file', () => {
    expect(SCRIPT).toContain('"${f%.json}.watcher"');
    expect(SCRIPT).not.toContain('watcherPid');
  });

  // `cdwr agent status` and the Desk read the queue view by these markers
  it('launches through watch.jq and implement.sh, detached', () => {
    expect(SCRIPT).toContain('\'include "watch"; launch($g)\'');
    expect(SCRIPT).toContain('nohup "$HOME_DIR/implement.sh"');
    expect(SCRIPT).toContain('print -r -- "launch: ');
    expect(SCRIPT).toContain('AGENT_QUEUE_IMPLEMENT_CAP_USD:-40');
  });

  it('keeps the start notice as the fallback when a guard refuses', () => {
    expect(SCRIPT).toContain('Not launched: ');
    expect(SCRIPT).toContain('Start /work-queue.');
  });

  it('prints and publishes the queue view', () => {
    expect(SCRIPT).toContain('print -r -- "queue-view: $queue_view"');
    expect(SCRIPT).toContain('```json queue-view\\n');
    // A heartbeat alone (lastSeen, detail) is no change to publish
    expect(SCRIPT).toContain(
      `session: (.session | if . == null then null else {state, ticket} end)`
    );
  });

  // A failed publish must not mark the line and view as published
  it('marks the runs document published only when its stamp moved', () => {
    expect(SCRIPT).toContain(
      `[[ "$(cat "$stamp" 2>/dev/null)" != "$before" ]] || return 0`
    );
  });

  // The documents are the only things run.sh writes to Linear
  it('sends no mutation but the documents', () => {
    const mutations = [...SCRIPT.matchAll(/mutation\b[^{]*\{\s*(\w+)/gi)].map(
      ([, field]) => field
    );
    expect(mutations).toEqual(['documentCreate', 'documentUpdate']);
    expect(SCRIPT.match(/mutation/gi)).toHaveLength(2);
  });

  // run.sh tells an out-of-date install by reading this constant from origin/main
  it('reads the run interval the way agent.logic.ts declares it', () => {
    const pattern = SCRIPT.match(/^INTERVAL_SED='(.*)'$/m)?.[1];
    expect(pattern).toContain('RUN_INTERVAL_SECONDS = ');
    const logic = fileURLToPath(new URL('./agent.logic.ts', import.meta.url));
    const out = execFileSync('sed', ['-n', pattern as string, logic], {
      encoding: 'utf8'
    });
    expect(out.trim()).toBe(String(RUN_INTERVAL_SECONDS));
  });

  // The cap is told from the result JSON, not from the wording of a log line
  it('reads the budget cap and cost from the run result', () => {
    expect(SCRIPT).toMatch(/^ {2}--output-format json \\$/m);
    expect(SCRIPT).toContain(`.subtype // empty' "$result"`);
    expect(SCRIPT).toContain('== error_max_budget_usd ]]');
    expect(SCRIPT).toContain(`.total_cost_usd // empty' "$result"`);
    expect(SCRIPT).not.toContain('Exceeded USD budget');
  });

  it('publishes the usage document from cdwr agent usage', () => {
    expect(SCRIPT).toMatch(/^USAGE_TITLE='Agent queue: usage'$/m);
    expect(SCRIPT).toContain(
      'node tools/cdwr/bin/cdwr.mjs agent usage --days 30 --json'
    );
    expect(SCRIPT).toMatch(
      /publish_doc "\$USAGE_TITLE" "\$HOME_DIR\/usage-doc-id" "\$stamp"/
    );
    expect(SCRIPT).toMatch(
      /publish_doc "\$DOC_TITLE" "\$HOME_DIR\/runs-doc-id" "\$stamp"/
    );
  });

  // The verdict comes from watch.jq, never from logic copied into run.sh
  it('computes the attended line with watch.jq', () => {
    expect(SCRIPT).toContain(
      `'include "watch"; .data.issues.nodes | attended($now; 5; $watch; $waits)'`
    );
    expect(SCRIPT).toContain(
      `'include "watch"; .data.issues.nodes | queue_view($now; 5; $watch; $session; $waits)'`
    );
  });

  // The parked tickets' PR reads live in waits.sh, installed beside run.sh
  it('reads parked waits once through waits.sh', () => {
    expect(SCRIPT).toContain('source "${0:A:h}/waits.sh"');
    expect(SCRIPT.match(/parked_waits <<</g)).toHaveLength(1);
    expect(SCRIPT).toMatch(/^attended$/m);
    expect(SCRIPT).toContain('print -r -- "attended: $attended_line"');
  });

  it('notices a missing session without naming a ticket for /work-queue', () => {
    expect(SCRIPT).toContain('no session running');
    expect(SCRIPT).toContain('Start /work-queue.');
    expect(SCRIPT).not.toMatch(/\/work-queue \$/);
    expect(SCRIPT).not.toMatch(/\/work-queue \S*COD-/);
  });

  it('publishes the activity document from cdwr agent activity', () => {
    expect(SCRIPT).toMatch(/^ACTIVITY_TITLE='Agent queue: activity'$/m);
    expect(SCRIPT).toContain(
      'node tools/cdwr/bin/cdwr.mjs agent activity --runs "$RUNS" --json'
    );
    expect(SCRIPT).toMatch(
      /publish_doc "\$ACTIVITY_TITLE" "\$HOME_DIR\/activity-doc-id" "\$stamp"/
    );
  });

  // Its warn rows land in the runs document of the same run
  it('publishes activity before the runs document', () => {
    const exit = SCRIPT.slice(SCRIPT.indexOf('on_exit() {'));
    expect(exit.indexOf('  publish_activity')).toBeGreaterThan(-1);
    expect(exit.indexOf('  publish_activity')).toBeLessThan(
      exit.indexOf('  publish_runs')
    );
  });

  it('publishes the job line after the last run and the attended line', () => {
    expect(SCRIPT).toContain('"Last run: \\($last)\\n\\n"');
    expect(SCRIPT).toContain('"Attended: \\($attended)\\n\\n"');
    expect(SCRIPT).toContain('+ "\\($job)\\n\\nWritten');
    expect(SCRIPT).toMatch(/--arg job "\$\(job_line\)"/);
  });
});

const execAsync = promisify(execFile);

describe('run.sh telemetry', () => {
  const exit = SCRIPT.slice(SCRIPT.indexOf('on_exit() {'));

  it('sources telemetry.sh and reads its env from the checkout', () => {
    expect(SCRIPT).toContain('source "${0:A:h}/telemetry.sh"');
    expect(SCRIPT).toContain('telemetry_env "$REPO/tools/cdwr/.env"');
  });

  it('sends one runs row on exit, detached, never on --check', () => {
    expect(exit).toContain('  record_run "$st"');
    expect(SCRIPT).toMatch(/^record_run\(\) \{\n {2}\$check && return 0/m);
    expect(SCRIPT).toMatch(/\( telemetry_run "\$RUN_STARTED" [^)]*\) &!/s);
  });

  it('records the outcome apart from its ticket and detail', () => {
    expect(SCRIPT).toContain(
      'outcome_name="$1" outcome_ticket="${2:-}" outcome_detail="${3:-}"'
    );
    expect(SCRIPT).toContain('run_kind=suggest');
  });

  it('upserts the activity rows by event id, merging edits, and records usage detached', () => {
    expect(SCRIPT).toContain(
      'supabase_upsert activity event_id "$rows_json" merge'
    );
    expect(SCRIPT).toContain('agent usage-record --yes --json');
    expect(exit.indexOf('  record_usage')).toBeGreaterThan(
      exit.indexOf('  publish_usage')
    );
  });
});

describe('run.sh Sentry check-ins', () => {
  it('sources checkin.sh from its own directory', () => {
    expect(SCRIPT).toContain('source "${0:A:h}/checkin.sh"');
  });

  it('checks in once when paused, before the lock, and not on --check', () => {
    expect(SCRIPT).toContain('then checkin ok; exit 0; fi');
    expect(SCRIPT.indexOf('then checkin ok; exit 0; fi')).toBeLessThan(
      SCRIPT.indexOf('mkdir "$HOME_DIR/lock"')
    );
    expect(SCRIPT).toContain('$check || CHECKIN_ID="$(checkin in_progress)"');
    expect(SCRIPT).toContain('if ! $check; then');
  });

  it('opens after the lock and closes by exit status in on_exit', () => {
    const lock = SCRIPT.indexOf('mkdir "$HOME_DIR/lock"');
    expect(SCRIPT.indexOf('checkin in_progress')).toBeGreaterThan(lock);
    const exit = SCRIPT.slice(SCRIPT.indexOf('on_exit() {'));
    expect(exit).toContain('checkin ok "$CHECKIN_ID"');
    expect(exit).toContain('checkin error "$CHECKIN_ID"');
  });
});

describe('run.sh GitHub identity', () => {
  const APP_SH = fileURLToPath(
    new URL('../../../agent-queue/github-app.sh', import.meta.url)
  );
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  const hasOpenssl = spawnSync('openssl', ['version']).status === 0;
  const WAITS_SH = fileURLToPath(
    new URL('../../../agent-queue/waits.sh', import.meta.url)
  );
  const TOKEN = `ghs_${'A1_'.repeat(20)}`;

  // The reads and the parked waits each run in a command substitution, so the token stays there
  it('takes the identity inside the watch and the parked waits only', () => {
    expect(SCRIPT).toContain('source "${0:A:h}/github-app.sh"');
    const watch = SCRIPT.slice(
      SCRIPT.indexOf('watch_prs() {'),
      SCRIPT.indexOf('# One fetch per run')
    );
    expect(watch).toContain('gh_identity_or_note');
    expect(SCRIPT).toContain(
      'waits="$(gh_identity || true; parked_waits <<<"$resp")"'
    );
    expect(SCRIPT.match(/^ *gh_identity_or_note$/gm)).toHaveLength(1);
  });

  it('reads through gh_read', () => {
    expect(SCRIPT).toContain('gh_read gh pr list');
    expect(SCRIPT).toContain('gh_read gh api graphql -f query="$PR_QUERY"');
  });

  describe.skipIf(!hasZsh)('gh_read', () => {
    it('retries once as the signed-in user and notes the fallback once per run', () => {
      const dir = mkdtempSync(join(tmpdir(), 'run-sh-ghread-'));
      try {
        const notes = join(dir, 'notes');
        const body = [
          `source "${WAITS_SH}"`,
          `LOGS="${dir}"`,
          `note() { print -r -- "$*" >> "${notes}"; }`,
          'gh() { [[ -n "${GH_TOKEN:-}" ]] && return 1; print -r -- "read as user"; }',
          'export GH_TOKEN=ghs_x GITHUB_TOKEN=ghs_x',
          'print -r -- "$(gh_read gh pr list)"',
          'print -r -- "$(gh_read gh api graphql)"',
          'print -r -- "token after: $GH_TOKEN"'
        ].join('\n');
        const result = spawnSync('zsh', ['-c', body], {
          encoding: 'utf8',
          env: { PATH: process.env['PATH'] ?? '', HOME: dir }
        });
        expect(result.stdout.trim().split('\n')).toEqual([
          'read as user',
          'read as user',
          'token after: ghs_x'
        ]);
        expect(readFileSync(notes, 'utf8').trim().split('\n')).toEqual([
          'warn: GitHub read fell back to the signed-in user'
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not retry without a token', () => {
      const body = [
        `source "${WAITS_SH}"`,
        'gh() { print -r -- called >&2; return 1; }',
        'unset GH_TOKEN',
        'gh_read gh pr list; print -r -- "rc=$?"'
      ].join('\n');
      const result = spawnSync('zsh', ['-c', body], {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '' }
      });
      expect(result.stdout).toContain('rc=1');
      expect(result.stderr.match(/called/g)).toHaveLength(1);
    });
  });

  describe.skipIf(!hasZsh || !hasOpenssl)('run', () => {
    let dir: string;
    let key: string;
    let server: Server;
    let api: string;

    // The functions as written in run.sh, from the reason variable to the end of the second one
    const functions = (): string => {
      const start = SCRIPT.indexOf('gh_reason=""');
      const second = SCRIPT.indexOf('gh_identity_or_note() {');
      return SCRIPT.slice(start, SCRIPT.indexOf('\n}\n', second) + 3);
    };

    // A repo with tools/cdwr/.env; `app` leaves the App variables out when false
    const exec = async (
      app: boolean
    ): Promise<{ stdout: string; notes: string }> => {
      const repo = mkdtempSync(join(dir, 'repo-'));
      const logs = join(repo, 'logs');
      mkdirSync(join(repo, 'tools', 'cdwr'), { recursive: true });
      mkdirSync(logs);
      if (app) {
        writeFileSync(
          join(repo, 'tools', 'cdwr', '.env'),
          `AGENT_GITHUB_APP_ID=1\nAGENT_GITHUB_APP_INSTALLATION_ID=2\nAGENT_GITHUB_APP_KEY_PATH=${key}\n`
        );
      }
      const notes = join(repo, 'notes');
      const body = [
        `source "${APP_SH}"`,
        `REPO="${repo}"; LOGS="${logs}"; check=false`,
        `note() { print -r -- "$*" >> "${notes}"; }`,
        functions(),
        'gh() { print -r -- "gh sees ${GH_TOKEN:-nothing}"; }',
        'print -r -- "$(gh_identity_or_note; gh)"',
        'print -r -- "outside sees ${GH_TOKEN:-nothing}"'
      ].join('\n');
      // Async: the fake server shares this process
      const { stdout } = await execAsync('zsh', ['-c', body], {
        env: {
          PATH: process.env['PATH'] ?? '',
          HOME: dir,
          AGENT_QUEUE_GITHUB_API: api
        }
      });
      return {
        stdout,
        notes: existsSync(notes) ? readFileSync(notes, 'utf8') : ''
      };
    };

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'run-sh-app-'));
      key = join(dir, 'app.pem');
      spawnSync('openssl', [
        'genpkey',
        '-algorithm',
        'RSA',
        '-pkeyopt',
        'rsa_keygen_bits:2048',
        '-out',
        key
      ]);
      chmodSync(key, 0o600);
      server = createServer((req, res) => {
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(json));
        };
        req.resume();
        req.on('end', () => {
          if (req.method === 'POST') send(201, { token: TOKEN });
          else if (req.url === '/app') send(200, { slug: 'codeware-agent' });
          else send(200, { id: 7 });
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      );
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('no port');
      }
      api = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    });

    it('gives the reads the App token and keeps it from the rest of the run', async () => {
      const result = await exec(true);
      expect(result.stdout.trim().split('\n')).toEqual([
        `gh sees ${TOKEN}`,
        'outside sees nothing'
      ]);
      expect(result.notes).toBe('');
    });

    it('falls back to the signed-in user with a warning', async () => {
      const result = await exec(false);
      expect(result.stdout.trim().split('\n')).toEqual([
        'gh sees nothing',
        'outside sees nothing'
      ]);
      expect(result.notes).toContain(
        'warn: GitHub reads as the signed-in user: github app:'
      );
      expect(result.notes).toContain('not readable');
    });
  });
});

describe('run.sh to_main', () => {
  const fn = SCRIPT.match(/^to_main\(\) \{\n[\s\S]*?\n\}\n/m)?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  let root: string;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

  // A checkout one commit behind origin/main; the new commit changes the lockfile or not
  const setup = (lockChanged: boolean) => {
    const origin = join(root, 'origin');
    mkdirSync(origin);
    git(origin, 'init', '-q', '-b', 'main');
    writeFileSync(join(origin, 'pnpm-lock.yaml'), 'a\n');
    git(origin, 'add', 'pnpm-lock.yaml');
    git(origin, 'commit', '-q', '-m', 'one');
    git(root, 'clone', '-q', origin, join(root, 'work'));
    if (lockChanged) writeFileSync(join(origin, 'pnpm-lock.yaml'), 'b\n');
    git(origin, 'commit', '-q', '--allow-empty', '-am', 'two');
    git(join(root, 'work'), 'fetch', '-q', 'origin');
  };

  // A stub pnpm that logs its arguments and exits with the given status
  const stub = (status: number) => {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'pnpm'),
      `#!/bin/sh\necho "$@" >> "${root}/pnpm.calls"\nexit ${status}\n`
    );
    chmodSync(join(bin, 'pnpm'), 0o755);
  };

  const run = () => {
    const script = [
      'set -euo pipefail',
      `LOGS="${root}"`,
      `note() { print -r -- "$*" >> "$LOGS/notes"; }`,
      `record() { print -r -- "$*" >> "$LOGS/records"; }`,
      fn,
      `cd "${root}/work"`,
      'to_main planning',
      'print done >> "$LOGS/notes"'
    ].join('\n');
    return spawnSync('zsh', ['-c', script], {
      env: { ...process.env, PATH: `${root}/bin:${process.env['PATH']}` },
      encoding: 'utf8'
    });
  };
  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'to-main-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(fn).toContain('to_main()');
  });

  // node_modules as installed from the lockfile with the given content
  const installedFrom = (content: string) => {
    const modules = join(root, 'work', 'node_modules');
    mkdirSync(modules, { recursive: true });
    const hash = execFileSync('git', ['hash-object', '--stdin'], {
      input: content,
      encoding: 'utf8'
    }).trim();
    writeFileSync(join(modules, '.cdwr-lockfile'), `${hash}\n`);
  };
  const marker = () => read('work/node_modules/.cdwr-lockfile').trim();
  const lockHash = () =>
    git(join(root, 'work'), 'hash-object', 'pnpm-lock.yaml');

  it.skipIf(!hasZsh)('installs when the lockfile changed', () => {
    setup(true);
    installedFrom('a\n');
    stub(0);
    expect(run().status).toBe(0);
    expect(read('pnpm.calls')).toBe('install --frozen-lockfile\n');
    expect(read('records')).toBe('');
    expect(marker()).toBe(lockHash());
  });

  it.skipIf(!hasZsh)('does not install when node_modules matches', () => {
    setup(false);
    installedFrom('a\n');
    stub(0);
    expect(run().status).toBe(0);
    expect(read('pnpm.calls')).toBe('');
  });

  it.skipIf(!hasZsh)('installs when nothing says what node_modules has', () => {
    setup(false);
    stub(0);
    expect(run().status).toBe(0);
    expect(read('pnpm.calls')).toBe('install --frozen-lockfile\n');
  });

  it.skipIf(!hasZsh)('warns, carries on, and retries on the next run', () => {
    setup(true);
    installedFrom('a\n');
    stub(1);
    expect(run().status).toBe(0);
    expect(read('records')).toContain('install failed after a lockfile change');
    expect(read('notes')).toContain('done');
    expect(run().status).toBe(0);
    expect(read('pnpm.calls')).toBe(
      'install --frozen-lockfile\ninstall --frozen-lockfile\n'
    );
  });
});
