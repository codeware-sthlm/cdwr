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
    expect(SCRIPT).toMatch(
      /^\s*"\$\{claude_env\[@\]\}" ENABLE_TOOL_SEARCH=false claude -p /m
    );
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

  it('prints and records the queue view', () => {
    expect(SCRIPT).toContain('print -r -- "queue-view: $queue_view"');
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

  // Its warn rows land in runs.jsonl before the run's own row is sent
  it('records activity before the queue state and the run row', () => {
    const exit = SCRIPT.slice(SCRIPT.indexOf('on_exit() {'));
    expect(exit.indexOf('  record_activity')).toBeGreaterThan(-1);
    expect(exit.indexOf('  record_activity')).toBeLessThan(
      exit.indexOf('  record_queue_state')
    );
    expect(exit.indexOf('  record_activity')).toBeLessThan(
      exit.indexOf('  record_run')
    );
  });
});

// The queue reads its state from the telemetry tables; Linear documents are no longer written
describe('run.sh without Linear documents', () => {
  const code = SCRIPT.split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  const exit = SCRIPT.slice(SCRIPT.indexOf('on_exit() {'));
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';

  it('sends no document mutation or query', () => {
    expect(code).not.toContain('documentCreate');
    expect(code).not.toContain('documentUpdate');
    expect(code).not.toContain('documents(');
    expect(code).not.toMatch(/_TITLE=|publish_(doc|runs|usage|activity)/);
  });

  // The watch's one Linear write relabels a ticket whose PR merged outside review
  it('holds exactly one Linear mutation, issueUpdate in the RELABEL query', () => {
    expect(code.match(/mutation\b/gi)).toHaveLength(1);
    const relabel = code.match(
      /read -r -d '' RELABEL <<'GQL' \|\| true\n([\s\S]*?)\nGQL\n/
    )?.[1];
    expect(relabel).toMatch(/^mutation\(/);
    expect(relabel).toContain('issueUpdate(');
    expect(code.match(/issueUpdate\b/g)).toHaveLength(2);
  });

  it('uses "$RELABEL" only inside relabel_merged', () => {
    const relabel = fn('relabel_merged');
    expect(relabel).toContain('linear "$RELABEL" "$vars"');
    expect(code.match(/"\$RELABEL"/g)).toHaveLength(1);
    expect(code.replace(relabel, '')).not.toContain('$RELABEL');
  });

  it('watches the three agent labels', () => {
    const watched = code.match(
      /read -r -d '' WATCHED <<'GQL' \|\| true\n([\s\S]*?)\nGQL\n/
    )?.[1];
    expect(watched).toContain(
      'labels: { some: { name: { in: ["agent:working", "agent:needs-input", "agent:review"] } } }'
    );
    expect(watched).toContain('id');
    expect(watched).toContain('description');
    expect(watched).toContain('labels { nodes { id name } }');
    expect(watched).toContain('issueLabels(');
  });

  it('keeps lib.sh free of mutations', () => {
    const lib = readFileSync(
      fileURLToPath(new URL('../../../agent-queue/lib.sh', import.meta.url)),
      'utf8'
    )
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(lib).not.toMatch(/mutation/i);
  });

  it('stores relabelled only after the relabel write succeeded', () => {
    expect(code.match(/\.entry\.relabelled = true/g)).toHaveLength(1);
    expect(code).toMatch(
      /relabel_merged "\$node" [^\n]*"\$review" &&\n\s*out="\$\(jq -c '\.entry\.relabelled = true' <<<"\$out"\)"/
    );
  });

  it('upserts activity rows from cdwr agent activity, gated on telemetry_on', () => {
    const activity = fn('record_activity');
    expect(activity).toContain(
      'node tools/cdwr/bin/cdwr.mjs agent activity --runs "$RUNS" --json'
    );
    expect(activity).toContain(
      'supabase_upsert activity event_id "$rows_json" merge'
    );
    expect(activity).toMatch(
      /\{\n {2}\$check && return 0\n {2}telemetry_on \|\| return 0\n/
    );
  });

  it('keeps the last 20 runs and caches the attended line and queue view', () => {
    const keep = fn('keep_state');
    expect(keep).toContain('$check && return 0');
    expect(keep).toContain('tail -n 20 "$RUNS" > "$RUNS.tmp"');
    expect(keep).toContain('> "$HOME_DIR/attended-line"');
    expect(keep).toContain('> "$HOME_DIR/queue-view.json"');
  });

  it('keeps state before the queue state reads it back', () => {
    expect(exit.indexOf('  keep_state')).toBeGreaterThan(-1);
    expect(exit.indexOf('  keep_state')).toBeLessThan(
      exit.indexOf('  record_queue_state')
    );
    const state = fn('record_queue_state');
    expect(state).toContain(
      '$(cat "$HOME_DIR/attended-line" 2>/dev/null || cat "$HOME_DIR/attended-published" 2>/dev/null)'
    );
    expect(state).toContain('$(cat "$HOME_DIR/queue-view.json" 2>/dev/null)');
  });

  it('gives the suggest session the runs file and no document tools', () => {
    expect(code).toContain(
      '/suggest-improvement focus=$focus memory=${MEMORY_DIR:-none} runs=$RUNS'
    );
    expect(code).not.toContain('__list_documents');
    expect(code).not.toContain('__get_document');
  });
});

describe('run.sh Linear tools', () => {
  const code = SCRIPT.split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('gives the plan and suggest claude runs the Linear MCP flags', () => {
    expect(
      code.match(/--model opus "\$\{LINEAR_MCP_ARGS\[@\]\}"/g)
    ).toHaveLength(2);
  });

  it('takes the tool prefix from lib.sh, never hardcoded', () => {
    expect(code).not.toMatch(/\bL=mcp__claude_ai_Linear/);
    expect(code).toContain('linear_mcp "$HOME_DIR"');
  });

  it('starts nothing without Linear tools', () => {
    expect(code.indexOf('linear_ok || exit 0')).toBeGreaterThan(0);
    expect(code.indexOf('linear_ok || exit 0')).toBeLessThan(
      code.indexOf('to_main planning')
    );
    expect(code.indexOf('linear_ok || {')).toBeLessThan(
      code.indexOf('to_main suggesting')
    );
    expect(code).toContain('record "no Linear tools"');
    expect(code).toContain('linear_gate "$HOME_DIR"');
  });

  // A launched session without Linear tools could only fail and count as a miss
  it('launches no session without Linear tools', () => {
    expect(code).toContain(
      'if [[ "$action" == launch ]] && ! linear_ok; then return 0; fi'
    );
  });

  it('reports the state on --check', () => {
    // One form or the other: `${why:-…}` would repeat the reason after the missing form
    expect(code).toContain('print -r -- "linear: missing ($why)"');
    expect(code).toContain('print -r -- "linear: ok ($LINEAR_MCP)"');
    expect(code).not.toContain('${why:-');
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

  it('sends the queue state on exit, detached, never on --check', () => {
    expect(exit).toContain('  record_queue_state\n');
    expect(SCRIPT).toMatch(
      /^record_queue_state\(\) \{\n {2}\$check && return 0\n {2}telemetry_on \|\| return 0/m
    );
    expect(SCRIPT).toMatch(/\( telemetry_queue_state "\$last" [^)]*\) &!/s);
  });

  // A refused launch shows on the desk and in `cdwr agent status`, not only in the log
  it('names a refused launch in the queue state', () => {
    expect(SCRIPT).toMatch(/^launch_note=""$/m);
    expect(SCRIPT).toContain(`launch_note="$(jq -r '.reason' <<<"$decision")"`);
    expect(SCRIPT).toContain(
      `last="$(date '+%F %H:%M') · $last_outcome\${launch_note:+ · no launch: $launch_note}"`
    );
  });

  // A day that sums below zero (a settle after midnight, a correction) is no unreadable ledger
  it('clamps a negative spend day to 0 and passes an unreadable ledger as null', () => {
    expect(SCRIPT).toContain('if [[ "$spent" == (|-)<->(|.<->) ]]; then');
    expect(SCRIPT).toContain('[[ "$spent" != -* ]] || spent=0');
    expect(SCRIPT).toMatch(/^ {6}spent=null$/m);
    expect(SCRIPT).toContain('spent="$(spent_today)"');
    expect(SCRIPT).toContain(
      '[[ "$spent" == null ]] && note "warn: implement-spend.jsonl unreadable; no launch today"'
    );
    expect(SCRIPT).not.toContain('spent=1000000');
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
    expect(SCRIPT).toContain('agent usage-record --kind "$kind" --yes --json');
    // Hour rows every run; day rows too once the hourly stamp is older than an hour
    expect(SCRIPT).toContain('kind=hour');
    expect(SCRIPT).toMatch(
      /> 3600 \)\); then\n\s+kind=both\n\s+date \+%s > "\$stamp"/
    );
    expect(exit.indexOf('  record_usage')).toBeGreaterThan(-1);
    expect(exit.indexOf('  record_usage')).toBeLessThan(
      exit.indexOf('  record_activity')
    );
  });
});

describe('run.sh Sentry check-ins', () => {
  it('sources checkin.sh from its own directory', () => {
    expect(SCRIPT).toContain('source "${0:A:h}/checkin.sh"');
  });

  it('publishes and checks in once when paused, without the lock, before the key checks, and not on --check', () => {
    const paused = SCRIPT.slice(
      SCRIPT.indexOf('if $paused; then\n  last_outcome=paused')
    );
    expect(paused).toMatch(
      /^if \$paused; then\n {2}last_outcome=paused\n {2}job_state\n {2}record_queue_state\n {2}checkin ok\n {2}exit 0\nfi\n/
    );
    expect(SCRIPT).toContain(
      'if [[ -e "$HOME_DIR/paused" ]] && ! $check; then paused=true; fi'
    );
    expect(SCRIPT).toContain(
      'if ! $paused; then\n  if ! mkdir "$HOME_DIR/lock"'
    );
    const at = SCRIPT.indexOf('if $paused; then\n  last_outcome=paused');
    expect(at).toBeGreaterThan(SCRIPT.indexOf('mkdir "$HOME_DIR/lock"'));
    expect(at).toBeLessThan(SCRIPT.indexOf('[[ -z "$key" ]]'));
    expect(at).toBeLessThan(SCRIPT.indexOf('if offline; then'));
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

describe('run.sh session files from another host', () => {
  const loop =
    SCRIPT.match(
      /^ {4}for f in "\$SESSIONS"\/\*\.json\(N\); do\n[\s\S]*?\n {4}done\n/m
    )?.[0] ?? '';
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;

  // A session file as the Mac mirrors it: its pid belongs to the other machine
  const session = (id: string, ageSeconds: number, host = 'mac') => {
    const lastSeen = new Date(Date.now() - ageSeconds * 1000).toISOString();
    writeFileSync(
      join(root, `${id}.json`),
      JSON.stringify({ host, pid: 1, state: 'waiting', lastSeen })
    );
  };

  // Runs the file loop with this machine called `agent`; prints the kept items
  const sweep = () => {
    const script = [
      'set -uo pipefail',
      'host_id() { print agent; }',
      'sweep() {',
      `  local SESSIONS="${root}" f w pid wpid`,
      '  local -a items=()',
      loop,
      '  print -r -- "${(j:|:)items}"',
      '}',
      'sweep'
    ].join('\n');
    return spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'remote-session-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(loop).toContain('remote=true');
  });

  it.skipIf(!canRun)(
    'keeps a fresh waiting file, with unknown liveness',
    () => {
      session('fresh', 60);
      const result = sweep();
      expect(existsSync(join(root, 'fresh.json'))).toBe(true);
      const item = JSON.parse(result.stdout.trim());
      expect(item).toMatchObject({
        state: 'waiting',
        pidAlive: null,
        watcherAlive: null
      });
    }
  );

  it.skipIf(!canRun)('deletes a file older than 24 h', () => {
    session('stale', 86400 + 3600);
    const result = sweep();
    expect(existsSync(join(root, 'stale.json'))).toBe(false);
    expect(result.stdout.trim()).toBe('');
  });
});

describe('run.sh woken by the listener', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  let home: string;

  const live = (file: unknown) => {
    if (file !== undefined)
      writeFileSync(
        join(home, 'listener.json'),
        typeof file === 'string' ? file : JSON.stringify(file)
      );
    return spawnSync(
      'zsh',
      [
        '-c',
        [`HOME_DIR="${home}"`, fn('listener_live'), 'listener_live'].join('\n')
      ],
      { encoding: 'utf8' }
    ).status;
  };
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'listener-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it.skipIf(!hasZsh)(
    'reads the listener as live only on a fresh live beat',
    () => {
      expect(live({ state: 'live', lastBeat: ago(5_000) })).toBe(0);
      expect(live({ state: 'live', lastBeat: ago(180_000) })).not.toBe(0);
      expect(live({ state: 'down', lastBeat: ago(5_000) })).not.toBe(0);
      expect(live('not json')).not.toBe(0);
    }
  );

  it.skipIf(!hasZsh)('reads no listener as not live', () => {
    expect(live(undefined)).not.toBe(0);
  });

  it('says live and the fallback in the job line on the container', () => {
    expect(fn('job_line')).toContain(
      'out="Job: live · fallback $(( RUN_FALLBACK_SECONDS / 60 )) min"'
    );
  });

  it.skipIf(!hasZsh)(
    'names the commit the image was built from, when it has one',
    () => {
      const job = (sha?: string) =>
        spawnSync(
          'zsh',
          [
            '-c',
            [
              `REPO="${home}"`,
              'AGENT_QUEUE_HOST=container',
              'RUN_INTERVAL_SECONDS=600',
              // The agent image exports its own sha, so the unset case clears it
              sha === undefined
                ? 'unset AGENT_IMAGE_SHA'
                : `AGENT_IMAGE_SHA='${sha}'`,
              fn('job_line'),
              'job_line'
            ].join('\n')
          ],
          { encoding: 'utf8' }
        ).stdout.trim();

      expect(job('0123456789abcdef0123456789abcdef01234567')).toBe(
        'Job: every 10 min · image sha-0123456 unknown'
      );
      expect(job()).toBe('Job: every 10 min · image unknown');
      expect(job('not-a-sha')).toBe('Job: every 10 min · image unknown');
    }
  );

  it('records the interval and the version from either job line', () => {
    const run = fn('record_run');
    expect(run).toContain(`'(every|fallback) ([0-9]+) min'`);
    expect(run).toContain('version="${jl##* · }"');
  });

  it('reads Linear history at most once per 10 min on a woken run', () => {
    const activity = fn('record_activity');
    expect(SCRIPT).toContain(
      'wake=false; [[ "${1:-}" == "--wake" ]] && wake=true'
    );
    expect(activity).toMatch(
      /if \$wake; then[\s\S]*>= 600 \)\) \|\| \{ : > "\$owed"; return 0; \}/
    );
    // The stamp moves only after a read that went through
    expect(activity.indexOf('date +%s > "$stamp"')).toBeGreaterThan(
      activity.indexOf("rows_json=\"$(jq -ce '.result.rows'")
    );
  });
});

// A session reads job.json to learn whether the installed scripts that denied it are behind main
describe('run.sh job.json', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  const FILES = [
    'run.sh',
    'lib.sh',
    'waits.sh',
    'watch.jq',
    'implement.sh',
    'github-app.sh',
    'notify.sh',
    'checkin.sh',
    'telemetry.sh'
  ];
  let root: string;
  let repo: string;
  let home: string;

  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

  // origin/main carries every script and the interval; the installed copies match it
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'job-json-'));
    repo = join(root, 'repo');
    home = join(root, 'home');
    const dir = join(repo, 'tools/cdwr/agent-queue');
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(repo, 'tools/cdwr/src/commands/agent'), { recursive: true });
    mkdirSync(home);
    writeFileSync(
      join(repo, 'tools/cdwr/src/commands/agent/agent.logic.ts'),
      `export const RUN_INTERVAL_SECONDS = 600;\n`
    );
    for (const f of FILES) {
      writeFileSync(join(dir, f), `# ${f}\n`);
      writeFileSync(join(home, f), `# ${f}\n`);
    }
    if (!hasZsh) return;
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-qm', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (check = false) => {
    const res = spawnSync(
      'zsh',
      [
        '-c',
        [
          `REPO="${repo}"`,
          `HOME_DIR="${home}"`,
          `check=${check}`,
          'AGENT_QUEUE_HOST=container',
          'RUN_INTERVAL_SECONDS=600',
          'unset RUN_FALLBACK_SECONDS',
          "AGENT_IMAGE_SHA='0123456789abcdef0123456789abcdef01234567'",
          SCRIPT.match(/^INTERVAL_SED=.*$/m)?.[0] ?? '',
          'job_kind="" job_differs=null job=""',
          fn('listener_live'),
          fn('job_line'),
          fn('job_state'),
          'job_state',
          'print -r -- "$job"'
        ].join('\n')
      ],
      { encoding: 'utf8' }
    );
    const file = join(home, 'job.json');
    return {
      line: res.stdout.trim(),
      json: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
    };
  };

  it('writes job_state on exit, before the rows that reuse its line', () => {
    const exit = fn('on_exit');
    expect(exit.indexOf('job_state')).toBeGreaterThan(0);
    expect(exit.indexOf('job_state')).toBeLessThan(
      exit.indexOf('record_queue_state')
    );
    expect(fn('record_run')).toContain('jl="$job"');
    expect(fn('record_queue_state')).toContain('jl="$(queue_job_line)"');
  });

  const zsh = (script: string, env: Record<string, string> = {}) =>
    spawnSync('zsh', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, ...env }
    }).stdout.trim();

  describe.skipIf(!hasZsh)('spent_today', () => {
    const today = () => new Date().toLocaleDateString('sv-SE').slice(0, 10);
    const spent = (rows?: string) => {
      if (rows !== undefined)
        writeFileSync(join(home, 'implement-spend.jsonl'), rows);
      return zsh(
        [`HOME_DIR="${home}"`, fn('spent_today'), 'spent_today'].join('\n')
      );
    };
    const row = (day: string, cost: number) =>
      `${JSON.stringify({ day, cost })}\n`;

    it('is 0 without a ledger', () => {
      expect(spent()).toBe('0');
    });

    it("sums today's rows only", () => {
      expect(
        spent(row(today(), 1.5) + row(today(), 2) + row('2000-01-01', 99))
      ).toBe('3.5');
    });

    it('reads a negative day as 0', () => {
      expect(spent(row(today(), -3) + row(today(), 1))).toBe('0');
    });

    it('is null for an unreadable ledger', () => {
      expect(spent('not json\n')).toBe('null');
    });
  });

  describe.skipIf(!hasZsh)('queue_job_line', () => {
    const line = (opts: {
      job?: string;
      spent?: string;
      cap?: string;
      paused?: boolean;
    }) =>
      zsh(
        [
          `job='${opts.job ?? 'Job: every 10 min · image sha-0123456'}'`,
          `paused=${opts.paused ?? false}`,
          `spent_today() { print -r -- ${opts.spent ?? '0'}; }`,
          `implement_cap() { print -r -- ${opts.cap ?? '40'}; }`,
          fn('queue_job_line'),
          'queue_job_line'
        ].join('\n')
      );

    it('appends the effort with two decimals', () => {
      expect(line({ spent: '12.3' })).toBe(
        'Job: every 10 min · image sha-0123456 · effort $12.30 of $40'
      );
      expect(line({ spent: '0' })).toBe(
        'Job: every 10 min · image sha-0123456 · effort $0.00 of $40'
      );
    });

    it('omits the effort when the spend or the cap is unknown', () => {
      const bare = 'Job: every 10 min · image sha-0123456';
      expect(line({ spent: 'null' })).toBe(bare);
      expect(line({ cap: 'null' })).toBe(bare);
    });

    it('appends the pause last', () => {
      expect(line({ spent: '1', paused: true })).toBe(
        'Job: every 10 min · image sha-0123456 · effort $1.00 of $40 · paused'
      );
      expect(line({ cap: 'null', paused: true })).toBe(
        'Job: every 10 min · image sha-0123456 · paused'
      );
    });

    it('prints nothing for an empty job line', () => {
      expect(line({ job: '', paused: true })).toBe('');
    });
  });

  describe.skipIf(!hasZsh)('implement_cap', () => {
    const cap = (value?: string) =>
      zsh(
        [fn('implement_cap'), 'implement_cap'].join('\n'),
        value === undefined ? {} : { AGENT_QUEUE_IMPLEMENT_CAP_USD: value }
      );

    it('defaults to 40 and reads a number', () => {
      expect(cap('')).toBe('40');
      expect(cap('12.5')).toBe('12.5');
    });

    it('is null for a non-number', () => {
      expect(cap('lots')).toBe('null');
    });
  });

  it.skipIf(!hasZsh)('says nothing differs when the copies match', () => {
    const { line, json } = run();
    expect(line).toBe('Job: every 10 min · image sha-0123456');
    expect(json).toMatchObject({
      host: 'container',
      kind: 'image sha-0123456',
      imageSha: '0123456789abcdef0123456789abcdef01234567',
      line,
      differs: []
    });
    expect(json.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it.skipIf(!hasZsh)(
    'names implement.sh when its installed copy differs',
    () => {
      writeFileSync(join(home, 'implement.sh'), '# an older implement.sh\n');
      const { line, json } = run();
      expect(line).toBe(
        'Job: every 10 min · image sha-0123456 out of date (implement.sh)'
      );
      expect(json.differs).toEqual(['implement.sh']);
    }
  );

  it.skipIf(!hasZsh)(
    'keeps the kind with null when main cannot be read',
    () => {
      git('update-ref', '-d', 'refs/remotes/origin/main');
      const { line, json } = run();
      expect(line).toBe('Job: every 10 min · image sha-0123456 unknown');
      expect(json).toMatchObject({ kind: 'image sha-0123456', differs: null });
    }
  );

  it.skipIf(!hasZsh)('writes nothing under --check', () => {
    expect(run(true).json).toBeNull();
  });
});
