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

// The desk's copilot and merge commands are run.sh's only GitHub writes, all in desk_pr_act
const DESK_PR_ACT =
  SCRIPT.match(/^desk_pr_act\(\) \{\n[\s\S]*?\n\}\n/m)?.[0] ?? '';

const ghCalls = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.match(/\bgh\s.*/g) ?? []);

describe('run.sh', () => {
  const calls = ghCalls(SCRIPT.replace(DESK_PR_ACT, ''));

  it('calls gh', () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each(calls)('only reads: %s', (call) => {
    expect(READS.some((read) => read.test(call))).toBe(true);
  });

  it('writes to GitHub only in desk_pr_act, as the app', () => {
    expect(DESK_PR_ACT).not.toBe('');
    const writes = ghCalls(DESK_PR_ACT).filter(
      (call) => !READS.some((read) => read.test(call))
    );
    expect(writes).toEqual([
      'gh api -X POST "repos/codeware-sthlm/cdwr/pulls/$pr/requested_reviewers"',
      'gh api graphql -f query="$ENQUEUE" -f id="$id" -f oid="$oid" 2>&1)" && return 0 ;;'
    ]);
    // The app's token first, with no fallback to the signed-in user
    expect(DESK_PR_ACT.indexOf('gh_identity ||')).toBeLessThan(
      DESK_PR_ACT.indexOf('case "$kind"')
    );
    expect(DESK_PR_ACT).not.toContain('gh_read');
    expect(SCRIPT.split('"$ENQUEUE"')).toHaveLength(2);
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
      `'include "watch"; .data.issues.nodes | attended($now; $limit; $watch; $waits; $renovate)'`
    );
    expect(SCRIPT).toContain(
      `'include "watch"; .data.issues.nodes | queue_view($now; $limit; $watch; $session; $waits; $renovate)'`
    );
    expect(SCRIPT).toContain('--argjson renovate "$renovate"');
  });

  // The desk sets the limit in a file; no literal 5 may bypass it
  it('takes the limit from queue_limit, not a literal', () => {
    expect(SCRIPT).not.toContain('; 5;');
    expect(
      SCRIPT.match(/--argjson limit "\$\(queue_limit "\$HOME_DIR"\)"/g)
    ).toHaveLength(2);
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

  const gql = (name: string) =>
    code.match(
      new RegExp(
        `read -r -d '' ${name} <<'GQL' \\|\\| true\\n([\\s\\S]*?)\\nGQL\\n`
      )
    )?.[1];

  // The scheduler's Linear writes: the watch relabels a ticket whose PR merged outside review,
  // and a parent whose agent split finished is closed with a comment. Nothing else. The fourth
  // mutation is GitHub's, the desk's merge (ENQUEUE).
  it('holds exactly three Linear mutations, each in its named query', () => {
    expect(code.match(/mutation\b/gi)).toHaveLength(4);
    expect(gql('ENQUEUE')).toMatch(/^mutation\([\s\S]*enqueuePullRequest\(/);
    expect(code.match(/"\$ENQUEUE"/g)).toHaveLength(1);
    expect(gql('RELABEL')).toMatch(/^mutation\(/);
    expect(gql('RELABEL')).toContain('issueUpdate(');
    expect(gql('CLOSE_PARENT')).toMatch(/^mutation\(/);
    expect(gql('CLOSE_PARENT')).toContain(
      'issueUpdate(id: $id, input: { stateId: $state })'
    );
    expect(gql('CLOSE_COMMENT')).toMatch(/^mutation\(/);
    expect(gql('CLOSE_COMMENT')).toContain('commentCreate(');
    // Each in its mutation and in the check of its answer
    expect(code.match(/issueUpdate\b/g)).toHaveLength(4);
    expect(code.match(/commentCreate\b/g)).toHaveLength(2);
  });

  it.each([
    ['RELABEL', 'relabel_merged'],
    ['CLOSE_PARENT', 'close_parents'],
    ['CLOSE_COMMENT', 'close_parents']
  ])('uses "$%s" only inside %s', (name, owner) => {
    const body = fn(owner);
    expect(body).toContain(`linear "$${name}" "$vars"`);
    expect(code.split(`"$${name}"`)).toHaveLength(2);
    expect(code.replace(body, '')).not.toContain(`$${name}`);
  });

  it('closes parents after the watches, never on --check', () => {
    expect(code).toMatch(
      /if ! \$check; then\n {2}err="\$\(watch_prs\)"[^\n]*\n {2}err="\$\(watch_renovate\)"[^\n]*\n {2}err="\$\(close_parents\)" \|\| \{/
    );
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
    expect(watched).toContain('after: $after');
    expect(watched).toContain('pageInfo { hasNextPage endCursor }');
    expect(watched).not.toContain('issueLabels(');
    const labels = code.match(
      /read -r -d '' WATCH_LABELS <<'GQL' \|\| true\n([\s\S]*?)\nGQL\n/
    )?.[1];
    expect(labels).toContain('issueLabels(');
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

  it('sources telemetry.sh and searches its env from the checkout', () => {
    expect(SCRIPT).toContain('source "${0:A:h}/telemetry.sh"');
    expect(SCRIPT).toContain('telemetry_env_search "$REPO"');
  });

  // A Mac without the scheduler reads the NUC's watch from queue_state; --check says which
  it('takes the watch state from watch_state and reports its source on --check', () => {
    const attended = SCRIPT.slice(SCRIPT.indexOf('\nattended() {'));
    expect(attended).toContain(
      'watch_state "$HOME_DIR/watch.json"\n  state="$WATCH_STATE"'
    );
    expect(attended.indexOf('watch_state "$HOME_DIR/watch.json"')).toBeLessThan(
      attended.indexOf('resp="$(linear "$ATTENDED_QUERY"')
    );
    expect(SCRIPT).not.toContain('$(watch_state');
    expect(SCRIPT).not.toContain(
      '"$HOME_DIR/watch.json" 2>/dev/null || print \'{}\')"'
    );
    expect(attended).toContain('print -r -- "watch-source: $WATCH_SOURCE"');
    expect(attended).toContain('print -r -- "watch-state: $state"');
    // Printed before the Linear read, so a Linear failure still reports the source
    expect(
      attended.indexOf('print -r -- "watch-source: $WATCH_SOURCE"')
    ).toBeLessThan(attended.indexOf('resp="$(linear "$ATTENDED_QUERY"'));
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
    expect(SCRIPT).toMatch(
      /telemetry_queue_state [^)]*"\$watch" "\$renovate" \) &!/s
    );
    expect(SCRIPT).toContain(
      'watch="$(cat "$HOME_DIR/watch.json" 2>/dev/null)"'
    );
    expect(SCRIPT).toContain(
      'renovate="$(cat "$HOME_DIR/renovate.json" 2>/dev/null)"'
    );
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
    expect(at).toBeLessThan(SCRIPT.indexOf('linear_auth || {'));
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
    // watch_prs and watch_renovate, each inside a command substitution of its caller
    expect(SCRIPT.match(/^ *gh_identity_or_note$/gm)).toHaveLength(2);
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

describe('run.sh close_parents', () => {
  const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  // The queries and the function as written in run.sh
  const source = SCRIPT.slice(
    SCRIPT.indexOf("read -r -d '' PARENTS"),
    SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('close_parents() {')) + 3
  );
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;

  const PARENTS = {
    data: {
      issues: {
        nodes: [
          {
            parent: {
              id: 'uuid-100',
              identifier: 'COD-100',
              state: { type: 'started' },
              team: { key: 'COD' },
              labels: { nodes: [] },
              children: {
                nodes: [
                  {
                    identifier: 'COD-101',
                    state: { type: 'completed' },
                    labels: { nodes: [{ name: 'agent:review' }] }
                  }
                ],
                pageInfo: { hasNextPage: false }
              }
            }
          }
        ]
      },
      teams: {
        nodes: [
          {
            states: {
              nodes: [
                { id: 'st-done', name: 'Done', type: 'completed', position: 1 }
              ]
            }
          }
        ]
      }
    }
  };

  // Runs close_parents with a fake Linear; `update` is what the close answers
  const run = (update: unknown) => {
    writeFileSync(join(root, 'parents.json'), JSON.stringify(PARENTS));
    writeFileSync(join(root, 'update.json'), JSON.stringify(update));
    const script = [
      `ROOT="${root}"; HOME_DIR="${root}"`,
      `note() { print -r -- "$*" >> "$ROOT/notes"; }`,
      `record() { print -r -- "$*" >> "$ROOT/records"; }`,
      `notice() { print -r -- "$*" >> "$ROOT/notices"; }`,
      `watch() { jq -L "${DIR}" "$@"; }`,
      'watch_err() { :; }',
      'linear() {',
      '  case "$1" in',
      '    *issueUpdate*) print -r -- "close $2" >> "$ROOT/calls"; cat "$ROOT/update.json" ;;',
      '    *commentCreate*) print -r -- "comment $2" >> "$ROOT/calls"; print -r -- \'{"data":{"commentCreate":{"success":true}}}\' ;;',
      '    *) cat "$ROOT/parents.json" ;;',
      '  esac',
      '}',
      source,
      'close_parents; print -r -- "rc=$?"'
    ].join('\n');
    return spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
  };
  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'close-parents-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(source).toContain('close_parents() {');
    expect(source).toContain("read -r -d '' CLOSE_COMMENT");
  });

  it('reads only sub-issues whose parent is still open', () => {
    expect(source).toContain(
      'parent: { null: false, state: { type: { nin: ["completed", "canceled"] } } }'
    );
  });

  it.skipIf(!canRun)('closes a ready parent once, then comments', () => {
    const result = run({ data: { issueUpdate: { success: true } } });
    expect(result.stdout).toContain('rc=0');
    expect(read('calls').trim().split('\n')).toEqual([
      'close {"id":"uuid-100","state":"st-done"}',
      `comment ${JSON.stringify({ id: 'uuid-100', body: '**Agent: closed** all sub-issues are closed: COD-101 (Done).' })}`
    ]);
    expect(read('records')).toBe('closed COD-100 all sub-issues are closed\n');
    expect(read('notices')).toBe(
      'info COD-100: closed, all sub-issues are closed\n'
    );
    expect(read('closed-parents')).toBe('COD-100\n');
  });

  it.skipIf(!canRun)('leaves a parent it closed before alone', () => {
    writeFileSync(join(root, 'closed-parents'), 'COD-100\n');
    const result = run({ data: { issueUpdate: { success: true } } });
    expect(result.stdout).toContain('rc=0');
    expect(read('calls')).toBe('');
    expect(read('records')).toBe('');
  });

  it.skipIf(!canRun)(
    'only warns when the close fails, and posts no comment',
    () => {
      const result = run({ errors: [{ message: 'nope' }] });
      expect(result.stdout).toContain('rc=0');
      expect(read('calls')).not.toContain('comment');
      expect(read('records')).toBe('warn COD-100 close: parent close failed\n');
      expect(read('notes')).toContain('warn: close: COD-100 failed ("nope")');
      expect(read('notices')).toBe('');
      expect(read('closed-parents')).toBe('');
    }
  );
});

describe('run.sh watch_prs', () => {
  const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const source = SCRIPT.slice(
    SCRIPT.indexOf('watch_prs() {'),
    SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('watch_prs() {')) + 3
  );
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;

  const ticket = {
    identifier: 'COD-5',
    labels: { nodes: [{ name: 'agent:working' }] },
    description: null,
    attachments: {
      nodes: [
        {
          url: 'https://github.com/codeware-sthlm/cdwr/pull/754',
          createdAt: '2026-01-01T00:00:00Z'
        }
      ]
    }
  };

  // Runs watch_prs with a fake Linear and a GraphQL answer for the PR. Each page answers the
  // cursor of the one before it (the first answers no cursor); a page given as `null` is a
  // Linear error.
  const run = (
    headRefName: string,
    pages: ((typeof ticket)[] | null)[] = [[ticket]],
    more = false
  ) => {
    pages.forEach((nodes, i) =>
      writeFileSync(
        join(root, `page-${i + 1}.json`),
        JSON.stringify(
          nodes === null
            ? { errors: [{ message: 'boom' }] }
            : {
                data: {
                  issues: {
                    pageInfo: {
                      hasNextPage: more || i < pages.length - 1,
                      endCursor: String(i + 2)
                    },
                    nodes
                  }
                }
              }
        )
      )
    );
    writeFileSync(
      join(root, 'pr.json'),
      JSON.stringify({
        headRefName,
        state: 'OPEN',
        mergedAt: null,
        mergeable: 'MERGEABLE',
        reviewThreads: { nodes: [] },
        commits: { nodes: [] }
      })
    );
    const script = [
      `ROOT="${root}"; HOME_DIR="${root}"; OTHER_REPOS='[]'; WATCHED=w; WATCH_LABELS=l; PR_QUERY=q`,
      `note() { print -r -- "$*" >> "$ROOT/notes"; }`,
      `record() { print -r -- "$*" >> "$ROOT/records"; }`,
      `notice() { print -r -- "$*" >> "$ROOT/notices"; }`,
      `watch() { jq -L "${DIR}" "$@"; }`,
      'watch_err() { :; }',
      'gh_identity_or_note() { :; }',
      'gh_read() { cat "$ROOT/pr.json"; }',
      'relabel_merged() { print -r -- "$*" >> "$ROOT/relabels"; }',
      `linear() { [[ "$1" == l ]] && { print -r -- '{"data":{"issueLabels":{"nodes":[]}}}'; return 0; }; cat "$ROOT/page-$(jq -r '.after // "1"' <<<"$2").json"; }`,
      source,
      'watch_prs; print -r -- "rc=$?"'
    ].join('\n');
    return spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
  };
  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'watch-prs-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('asks for the head branch name of the PR', () => {
    expect(SCRIPT).toContain('headRefName');
  });

  it.skipIf(!canRun)('watches a ticket whose PR is not Renovate’s', () => {
    const result = run('feature/cod-5');
    expect(result.stdout).toContain('rc=0');
    expect(Object.keys(JSON.parse(read('watch.json')))).toEqual(['COD-5']);
  });

  it.skipIf(!canRun)(
    'skips a ticket whose attached PR is a renovate/ branch',
    () => {
      const result = run('renovate/zod-4.x');
      expect(result.stdout).toContain('rc=0');
      expect(JSON.parse(read('watch.json'))).toEqual({});
      expect(read('notices')).toBe('');
      expect(read('relabels')).toBe('');
      expect(read('records')).toBe('');
    }
  );

  it.skipIf(!canRun)(
    'drops a cached entry for a ticket whose attached PR is Renovate’s',
    () => {
      writeFileSync(
        join(root, 'watch.json'),
        JSON.stringify({ 'COD-5': { pr: 754, state: 'conflicting' } })
      );
      const result = run('renovate/zod-4.x');
      expect(result.stdout).toContain('rc=0');
      expect(JSON.parse(read('watch.json'))).toEqual({});
    }
  );

  const tickets = (...ids: number[]) =>
    ids.map((n) => ({ ...ticket, identifier: `COD-${n}` }));

  it.skipIf(!canRun)('watches the tickets of every page, with no warn', () => {
    const result = run('feature/cod-5', [tickets(5), tickets(6)]);
    expect(result.stdout).toContain('rc=0');
    expect(Object.keys(JSON.parse(read('watch.json'))).sort()).toEqual([
      'COD-5',
      'COD-6'
    ]);
    expect(read('records')).toBe('');
    expect(read('notes')).toBe('');
    expect(existsSync(join(root, 'watch-pages.jsonl'))).toBe(false);
  });

  it.skipIf(!canRun)('watches a ticket on two pages once', () => {
    const result = run('feature/cod-5', [tickets(5, 6), tickets(6)]);
    expect(result.stdout).toContain('rc=0');
    expect(Object.keys(JSON.parse(read('watch.json'))).sort()).toEqual([
      'COD-5',
      'COD-6'
    ]);
  });

  it.skipIf(!canRun)('warns once when more than 5 pages remain', () => {
    const result = run(
      'feature/cod-5',
      [1, 2, 3, 4, 5].map((n) => tickets(n)),
      true
    );
    expect(result.stdout).toContain('rc=0');
    expect(Object.keys(JSON.parse(read('watch.json')))).toHaveLength(5);
    expect(read('records')).toBe('warn  watch: page limit reached\n');
  });

  it.skipIf(!canRun)(
    'fails on a Linear error past the first page, leaving watch.json as it was',
    () => {
      const before = JSON.stringify({ 'COD-9': { pr: 1, state: 'open' } });
      writeFileSync(join(root, 'watch.json'), before);
      const result = run('feature/cod-5', [tickets(5), null]);
      expect(result.stdout).toContain('Linear error "boom"');
      expect(result.stdout).toContain('rc=1');
      expect(read('watch.json')).toBe(before);
    }
  );
});

describe('run.sh watch_renovate', () => {
  const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const source = SCRIPT.slice(
    SCRIPT.indexOf("read -r -d '' RENOVATE_TICKETS"),
    SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('watch_renovate() {')) + 3
  );
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;

  const PRS = [
    {
      number: 754,
      title: 'chore(deps): update zod',
      url: 'https://github.com/codeware-sthlm/cdwr/pull/754',
      headRefOid: 'abc',
      mergeable: 'MERGEABLE',
      statusCheckRollup: [{ conclusion: 'FAILURE' }],
      commits: []
    }
  ];

  const WAITS_SH = fileURLToPath(
    new URL('../../../agent-queue/waits.sh', import.meta.url)
  );

  // Runs watch_renovate with the real gh_read over a fake gh and Linear; `prs` is what gh pr list
  // answers (a string as it is), `gh` replaces the fake gh's body, `token` sets an App token
  const run = (
    prs: unknown,
    linear: unknown = { data: { issues: { nodes: [] } } },
    { gh, token }: { gh?: string; token?: boolean } = {}
  ) => {
    writeFileSync(
      join(root, 'prs.json'),
      typeof prs === 'string' ? prs : JSON.stringify(prs)
    );
    writeFileSync(join(root, 'linear.json'), JSON.stringify(linear));
    const script = [
      `ROOT="${root}"; HOME_DIR="${root}"; LOGS="${root}"`,
      `source "${WAITS_SH}"`,
      token ? 'export GH_TOKEN=ghs_x GITHUB_TOKEN=ghs_x' : 'unset GH_TOKEN',
      `note() { print -r -- "$*" >> "$ROOT/notes"; }`,
      `record() { print -r -- "$*" >> "$ROOT/records"; }`,
      `notice() { print -r -- "$*" >> "$ROOT/notices"; }`,
      `watch() { jq -L "${DIR}" "$@"; }`,
      'watch_err() { :; }',
      'gh_identity_or_note() { :; }',
      `gh() { ${gh ?? 'print -r -- "$*" >> "$ROOT/gh"; cat "$ROOT/prs.json"'}; }`,
      'linear() { cat "$ROOT/linear.json"; }',
      source,
      'watch_renovate; print -r -- "rc=$?"'
    ].join('\n');
    return spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
  };
  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'watch-renovate-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(source).toContain('watch_renovate() {');
    expect(source).toContain("read -r -d '' RENOVATE_TICKETS");
  });

  it('reads only: the PR list and the renovate tickets', () => {
    expect(source).toContain('gh_read gh pr list --repo codeware-sthlm/cdwr');
    expect(source).toContain('--author app/renovate');
    expect(source).toContain('labels: { some: { name: { eq: "renovate" } } }');
    expect(source).not.toContain('mutation');
  });

  it("asks for few enough PRs to stay under GitHub's 500k node limit", () => {
    const limit = Number(source.match(/renovate_limit=(\d+)/)?.[1]);
    expect(limit).toBe(30);
    expect(source).toContain('--limit "$renovate_limit"');
    expect(source).not.toContain('--limit 100');
    // gh asks for 100 commits per PR and 100 authors per commit
    expect(limit * 100 * 100).toBeLessThan(500_000);
  });

  it.skipIf(!canRun)('passes the limit to gh pr list', () => {
    run(PRS);
    expect(read('gh')).toContain('--limit 30');
  });

  it.skipIf(!canRun)(
    'warns on a full page and still writes renovate.json',
    () => {
      const full = Array.from({ length: 30 }, (_, i) => ({
        ...PRS[0],
        number: 700 + i
      }));
      const result = run(full);
      expect(result.stdout).toContain('rc=0');
      expect(read('notes')).toContain(
        'warn: renovate: 30 open Renovate PRs, the page limit; older ones are not read'
      );
      expect(read('records')).toContain(
        'warn  renovate: PR page limit reached'
      );
      expect(Object.keys(JSON.parse(read('renovate.json')))).toHaveLength(30);
    }
  );

  it.skipIf(!canRun)('does not warn below the page limit', () => {
    run(PRS);
    expect(read('notes')).not.toContain('page limit');
  });

  it('runs after watch_prs and before close_parents, never on --check', () => {
    const block =
      SCRIPT.match(
        /if ! \$check; then\n {2}err="\$\(watch_prs\)"[\s\S]*?\nfi\n/
      )?.[0] ?? '';
    const prs = block.indexOf('watch_prs)');
    const ren = block.indexOf('watch_renovate)');
    const close = block.indexOf('close_parents)');
    expect(prs).toBeGreaterThan(-1);
    expect(ren).toBeGreaterThan(prs);
    expect(close).toBeGreaterThan(ren);
  });

  it.skipIf(!canRun)(
    'writes renovate.json from the first run without a notice',
    () => {
      const result = run(PRS);
      expect(result.stdout).toContain('rc=0');
      expect(read('notices')).toBe('');
      expect(JSON.parse(read('renovate.json'))['754'].state).toBe('failing');
    }
  );

  it.skipIf(!canRun)(
    'writes renovate.json from renovate_step and notices a broken PR',
    () => {
      writeFileSync(join(root, 'renovate.json'), '{}');
      const result = run(PRS);
      expect(result.stdout).toContain('rc=0');
      expect(read('gh')).toContain('pr list');
      const state = JSON.parse(read('renovate.json'));
      expect(state['754']).toMatchObject({
        pr: 754,
        state: 'failing',
        ticket: null
      });
      expect(read('notices')).toBe(
        'info Renovate PR #754 has failing checks: chore(deps): update zod\n'
      );
    }
  );

  it.skipIf(!canRun)('sends no second notice while the state holds', () => {
    writeFileSync(join(root, 'renovate.json'), '{}');
    run(PRS);
    rmSync(join(root, 'notices'));
    const result = run(PRS);
    expect(result.stdout).toContain('rc=0');
    expect(read('notices')).toBe('');
    expect(JSON.parse(read('renovate.json'))['754'].state).toBe('failing');
  });

  it.skipIf(!canRun)(
    'sends no notice when renovate.json cannot be written',
    () => {
      writeFileSync(join(root, 'renovate.json'), '{}');
      mkdirSync(join(root, 'renovate.json.tmp'));
      const result = run(PRS);
      expect(result.stdout).toContain('could not write renovate.json');
      expect(result.stdout).toContain('rc=1');
      expect(read('notices')).toBe('');
      expect(read('renovate.json')).toBe('{}');
    }
  );

  it('records the failure as a warn in the run', () => {
    expect(SCRIPT).toContain(
      'record warn "" "renovate watch failed: ${err:-unknown}"'
    );
  });

  it.skipIf(!canRun)(
    'leaves renovate.json as it was when the answer is no list',
    () => {
      writeFileSync(join(root, 'renovate.json'), '{}');
      run(PRS);
      const before = read('renovate.json');
      const result = run({ not: 'an array' });
      expect(result.stdout).toContain('not a list: {"not":"an array"}\n');
      expect(result.stdout).toContain('rc=1');
      expect(read('renovate.json')).toBe(before);
    }
  );

  it.skipIf(!canRun)(
    'names an empty or long answer on one line, cut to 80 characters',
    () => {
      expect(run('').stdout).toContain('not a list: (empty)\n');
      const long = `<html>\r\n\t${'x'.repeat(100)}`;
      expect(run(long).stdout).toContain(
        `not a list: <html>   ${'x'.repeat(71)}\n`
      );
    }
  );

  it.skipIf(!canRun)(
    "names gh's first error line and leaves renovate.json as it was",
    () => {
      writeFileSync(join(root, 'renovate.json'), '{}');
      const result = run(PRS, undefined, {
        gh: `print -ru2 -- "  HTTP 403: Resource not accessible by integration"; print -ru2 -- "second line"; return 1`
      });
      expect(result.stdout).toContain(
        'GitHub: HTTP 403: Resource not accessible by integration\nrc=1'
      );
      expect(read('renovate.json')).toBe('{}');
    }
  );

  it.skipIf(!canRun)('says when gh failed without a word', () => {
    const result = run(PRS, undefined, { gh: 'return 1' });
    expect(result.stdout).toContain('GitHub: (no stderr)\nrc=1');
  });

  it.skipIf(!canRun)(
    "names both attempts' errors when the signed-in fallback fails too",
    () => {
      const result = run(PRS, undefined, {
        token: true,
        gh: `[[ -n "\${GH_TOKEN:-}" ]] && { print -ru2 -- "HTTP 403: app"; return 1; }; print -ru2 -- "To get started with GitHub CLI, please run: gh auth login"; return 4`
      });
      expect(result.stdout).toContain(
        'GitHub: HTTP 403: app; as user: To get started with GitHub CLI, please run: gh auth login\nrc=1'
      );
      expect(read('notes')).toContain(
        'warn: GitHub read fell back to the signed-in user'
      );
    }
  );

  it.skipIf(!canRun)('cuts each error line to 120 characters', () => {
    const result = run(PRS, undefined, {
      gh: `print -ru2 -- "${'e'.repeat(150)}"; return 1`
    });
    expect(result.stdout).toContain(`GitHub: ${'e'.repeat(120)}\nrc=1`);
  });

  it.skipIf(!canRun)('reads nothing more when the fallback succeeds', () => {
    const result = run(PRS, undefined, {
      token: true,
      gh: `[[ -n "\${GH_TOKEN:-}" ]] && { print -ru2 -- "HTTP 403: app"; return 1; }; cat "$ROOT/prs.json"`
    });
    expect(result.stdout).toContain('rc=0');
    expect(JSON.parse(read('renovate.json'))['754'].state).toBe('failing');
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
    const cap = (value?: string, file?: string) => {
      rmSync(join(home, 'implement-cap'), { force: true });
      if (file !== undefined) writeFileSync(join(home, 'implement-cap'), file);
      return zsh(
        [`HOME_DIR="${home}"`, fn('implement_cap'), 'implement_cap'].join('\n'),
        value === undefined ? {} : { AGENT_QUEUE_IMPLEMENT_CAP_USD: value }
      );
    };

    it('defaults to 40 and reads a number', () => {
      expect(cap('')).toBe('40');
      expect(cap('12.5')).toBe('12.5');
    });

    it('is null for a non-number', () => {
      expect(cap('lots')).toBe('null');
    });

    it('prefers the file the desk sets, 0 included', () => {
      expect(cap('12.5', '0\n')).toBe('0');
      expect(cap('12.5', '25\n')).toBe('25');
      expect(cap(undefined, ' 7.5 ')).toBe('7.5');
    });

    it('falls back to the env, then 40, when the file is not a number', () => {
      expect(cap('12.5', 'x')).toBe('12.5');
      expect(cap(undefined, 'x')).toBe('40');
      expect(cap(undefined)).toBe('40');
    });
  });

  describe.skipIf(!hasZsh)('queue_limit', () => {
    const LIB = readFileSync(
      fileURLToPath(new URL('../../../agent-queue/lib.sh', import.meta.url)),
      'utf8'
    );
    const limit = (file?: string) => {
      rmSync(join(home, 'limit'), { force: true });
      if (file !== undefined) writeFileSync(join(home, 'limit'), file);
      const body = LIB.match(/^queue_limit\(\) \{\n[\s\S]*?\n\}\n/m)?.[0] ?? '';
      return zsh([body, `queue_limit "${home}"`].join('\n'));
    };

    it('reads a whole number from 1 to 20', () => {
      expect(limit('3\n')).toBe('3');
      expect(limit(' 20 ')).toBe('20');
      expect(limit('1')).toBe('1');
    });

    it('is 5 without a file', () => {
      expect(limit()).toBe('5');
    });

    it.each(['0', '21', 'abc', '2.5', '', '-3'])('is 5 for %j', (value) => {
      expect(limit(value)).toBe('5');
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

describe('run.sh watch.jq errors', () => {
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';

  // A failure note without jq's reason can't be diagnosed after the fact
  it('adds the reason to every watch.jq failure', () => {
    const failures = SCRIPT.split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .filter((line) => line.includes('watch.jq failed'));
    expect(failures.length).toBeGreaterThanOrEqual(6);
    for (const line of failures) expect(line).toMatch(/watch_err|\$why/);
  });

  it.skipIf(!hasZsh)(
    "prints jq's first error line after a failure, nothing after a success",
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'run-sh-watch-err-'));
      try {
        writeFileSync(join(dir, 'watch.jq'), `def long: ${'x'.repeat(200)};\n`);
        const body = [
          'set -euo pipefail',
          `HOME_DIR="${dir}" LOGS="${dir}" WATCH_DIR="${dir}"`,
          fn('watch'),
          fn('watch_err'),
          'out="$(watch -n \'include "watch"; long\')" || print -r -- "fail:$(watch_err)|"',
          'out="$(watch -n 1)"; print -r -- "ok:$(watch_err)|"'
        ].join('\n');
        const result = spawnSync('zsh', ['-c', body], { encoding: 'utf8' });
        const [fail, ok] = result.stdout.trim().split('\n');
        expect(fail).toMatch(/^fail: \(jq: error.*\)\|$/);
        // The body is cut to 120 characters
        expect(fail?.length).toBe('fail: ()|'.length + 120);
        expect(ok).toBe('ok:|');
        // An unchecked call still leaves the error in the job's stderr
        expect(result.stderr).toMatch(/^jq: error/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});

// Desk commands are read and applied before the pause is, so a resume lifts it in the same tick
describe('run.sh apply_commands', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let home: string;

  type Row = {
    id: number;
    kind: string;
    value?: unknown;
    ageMs?: number;
    at?: string;
    args?: Record<string, unknown>;
  };
  type Opts = {
    check?: boolean;
    telemetry?: boolean;
    lost?: number[];
    paused?: boolean;
    files?: Record<string, string>;
    // Shell lines defining desk_pr_check and desk_pr_act, the GitHub side
    stubs?: string[];
  };

  // PostgREST form: 2026-11-02T10:59:03.621+00:00
  const stamp = (ageMs: number) =>
    new Date(Date.now() - ageMs).toISOString().replace('Z', '+00:00');

  // Runs apply_commands over the rows; every stub records what it was called with
  const apply = (rows: Row[], opts: Opts = {}) => {
    const json = rows.map((r) => ({
      id: r.id,
      at: r.at ?? stamp(r.ageMs ?? 60_000),
      kind: r.kind,
      args: r.args ?? (r.value === undefined ? {} : { value: r.value }),
      actor: 'mac'
    }));
    writeFileSync(join(home, 'rows.json'), JSON.stringify(json));
    writeFileSync(join(home, 'lost'), (opts.lost ?? []).join(' '));
    if (opts.paused) writeFileSync(join(home, 'paused'), '');
    for (const [name, content] of Object.entries(opts.files ?? {})) {
      writeFileSync(join(home, name), content);
    }
    const t = (name: string) => join(home, `t-${name}`);
    for (const name of ['select', 'patch', 'upsert', 'note', 'say']) {
      rmSync(t(name), { force: true });
    }
    const script = [
      `HOME_DIR="${home}"; check=${opts.check ?? false}; DESK_STALE_SECS=7200`,
      `telemetry_on() { ${opts.telemetry === false ? 'return 1' : 'return 0'}; }`,
      'telemetry_host() { print nuc; }',
      `supabase_select() { print -r -- "$*" >> "${t('select')}"; cat "${home}/rows.json"; }`,
      'supabase_patch() {',
      '  local id="${2#id=eq.}"; id="${id%%&*}"',
      `  print -r -- "$1|$2|$3" >> "${t('patch')}"`,
      `  if [[ " $(<"${home}/lost") " == *" $id "* ]]; then print -r -- '[]'; else print -r -- "[{\\"id\\":$id}]"; fi`,
      '}',
      `supabase_upsert() { print -r -- "$1|$2|$3|$4" >> "${t('upsert')}"; }`,
      `note() { print -r -- "$*" >> "${t('note')}"; }`,
      `say() { print -r -- "$*" >> "${t('say')}"; }`,
      ...(opts.stubs ?? []),
      fn('apply_commands'),
      'apply_commands'
    ].join('\n');
    const result = spawnSync('zsh', ['-c', script], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', HOME: home }
    });
    const lines = (name: string) =>
      existsSync(t(name))
        ? readFileSync(t(name), 'utf8').trim().split('\n')
        : [];
    return {
      stderr: result.stderr,
      selects: lines('select'),
      patches: lines('patch').map((l) => {
        const [table, query, ...body] = l.split('|');
        return {
          table,
          query,
          body: JSON.parse(body.join('|')) as Record<string, unknown>
        };
      }),
      upserts: lines('upsert').map((l) => {
        const [table, key, body, mode] = l.split('|');
        return {
          table,
          key,
          mode,
          body: JSON.parse(body as string) as Record<string, unknown>
        };
      }),
      notes: lines('note'),
      says: lines('say')
    };
  };

  const file = (name: string) =>
    existsSync(join(home, name))
      ? readFileSync(join(home, name), 'utf8').trim()
      : null;
  const changes = (r: ReturnType<typeof apply>) =>
    r.upserts.map((u) => u.body['change']);
  const statuses = (r: ReturnType<typeof apply>) =>
    r.patches.map((p) => [p.body['status'], p.body['note']]);

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'apply-commands-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(fn('apply_commands')).toContain('apply_commands()');
  });

  it('applies the commands before the pause is read', () => {
    const env = SCRIPT.indexOf('telemetry_env_search "$REPO"');
    const call = SCRIPT.indexOf('\napply_commands\n');
    expect(env).toBeGreaterThan(0);
    expect(env).toBeLessThan(call);
    expect(call).toBeLessThan(SCRIPT.indexOf('paused=false'));
  });

  it.skipIf(!canRun)('reads this host pending commands in id order', () => {
    const r = apply([]);
    expect(r.selects).toEqual([
      'desk_commands host=eq.nuc&status=eq.pending&kind=neq.abandon&order=id.asc&select=id,at,kind,args,actor'
    ]);
    expect(r.patches).toEqual([]);
  });

  it.skipIf(!canRun)('pauses then resumes: no pause file, both acked', () => {
    const r = apply([
      { id: 1, kind: 'pause' },
      { id: 2, kind: 'resume' }
    ]);
    expect(file('paused')).toBeNull();
    expect(r.patches.map((p) => [p.table, p.query])).toEqual([
      ['desk_commands', 'id=eq.1&status=eq.pending'],
      ['desk_commands', 'id=eq.2&status=eq.pending']
    ]);
    expect(statuses(r)).toEqual([
      ['applied', null],
      ['applied', null]
    ]);
    expect(r.upserts.map((u) => [u.table, u.key, u.mode])).toEqual([
      ['activity', 'event_id', 'merge'],
      ['activity', 'event_id', 'merge']
    ]);
    expect(r.upserts.map((u) => u.body['event_id'])).toEqual([
      'desk:1',
      'desk:2'
    ]);
    expect(changes(r)).toEqual([
      'paused from the desk (mac)',
      'resumed from the desk (mac)'
    ]);
    for (const u of r.upserts) {
      expect(u.body).toMatchObject({
        actor: 'human',
        host: 'nuc',
        ticket: null
      });
    }
  });

  it.skipIf(!canRun)('resumes then pauses: the pause file stays', () => {
    const r = apply([
      { id: 1, kind: 'resume' },
      { id: 2, kind: 'pause' }
    ]);
    expect(file('paused')).not.toBeNull();
    expect(statuses(r)).toEqual([
      ['applied', 'not paused'],
      ['applied', null]
    ]);
  });

  it.skipIf(!canRun)('notes a pause when already paused', () => {
    const r = apply([{ id: 1, kind: 'pause' }], { paused: true });
    expect(statuses(r)).toEqual([['applied', 'already paused']]);
  });

  it.skipIf(!canRun)('refuses a run while paused', () => {
    const r = apply([{ id: 1, kind: 'run' }], { paused: true });
    expect(statuses(r)).toEqual([['refused', 'paused']]);
    expect(changes(r)).toEqual(['run refused from the desk (mac): paused']);
  });

  it.skipIf(!canRun)('applies a run when not paused', () => {
    const r = apply([{ id: 1, kind: 'run' }]);
    expect(statuses(r)).toEqual([['applied', 'this run']]);
    expect(changes(r)).toEqual(['run requested from the desk (mac)']);
  });

  it.skipIf(!canRun)('sets the limit from 1 to 20 and refuses the rest', () => {
    const ok = apply([{ id: 1, kind: 'limit', value: 3 }]);
    expect(file('limit')).toBe('3');
    expect(changes(ok)).toEqual(['PR limit set to 3 from the desk (mac)']);
    for (const value of [0, 21, 2.5]) {
      const r = apply([{ id: 1, kind: 'limit', value }]);
      expect(statuses(r)).toEqual([['refused', 'bad value']]);
      expect(file('limit')).toBe('3');
      expect(changes(r)).toEqual([
        'limit refused from the desk (mac): bad value'
      ]);
    }
  });

  it.skipIf(!canRun)(
    'sets the implement cap up to 500 and refuses the rest',
    () => {
      const zero = apply([{ id: 1, kind: 'cap', value: 0 }]);
      expect(file('implement-cap')).toBe('0');
      expect(statuses(zero)).toEqual([['applied', null]]);

      const frac = apply([{ id: 1, kind: 'cap', value: 25.5 }]);
      expect(file('implement-cap')).toBe('25.5');
      expect(changes(frac)).toEqual([
        'implement cap set to $25.5 from the desk (mac)'
      ]);

      const big = apply([{ id: 1, kind: 'cap', value: 501 }]);
      expect(statuses(big)).toEqual([['refused', 'bad value']]);
      expect(file('implement-cap')).toBe('25.5');
    }
  );

  it.skipIf(!canRun)(
    'refuses a command 3 hours old and applies nothing',
    () => {
      const r = apply([{ id: 1, kind: 'pause', ageMs: 3 * 3600_000 }]);
      expect(statuses(r)).toEqual([['refused', 'expired']]);
      expect(file('paused')).toBeNull();
      expect(changes(r)).toEqual([
        'pause refused from the desk (mac): expired'
      ]);
    }
  );

  it.skipIf(!canRun)('reads an unparsable time as expired', () => {
    const r = apply([{ id: 1, kind: 'pause', at: 'yesterday-ish' }]);
    expect(statuses(r)).toEqual([['refused', 'expired']]);
    expect(file('paused')).toBeNull();
  });

  it.skipIf(!canRun)('refuses a run while another run holds the lock', () => {
    mkdirSync(join(home, 'lock'));
    const r = apply([{ id: 1, kind: 'run' }]);
    expect(statuses(r)).toEqual([['refused', 'a run is in progress']]);
  });

  it.skipIf(!canRun)(
    'applies nothing and writes no activity row when the ack was lost',
    () => {
      const r = apply(
        [
          { id: 1, kind: 'pause' },
          { id: 2, kind: 'limit', value: 7 }
        ],
        { lost: [1] }
      );
      expect(file('paused')).toBeNull();
      expect(r.upserts.map((u) => u.body['event_id'])).toEqual(['desk:2']);
      expect(r.notes.join('\n')).toContain('desk command 1 (pause): not acked');
      expect(file('limit')).toBe('7');
    }
  );

  it.skipIf(!canRun)('only counts under --check', () => {
    const r = apply(
      [
        { id: 1, kind: 'pause' },
        { id: 2, kind: 'cap', value: 5 }
      ],
      { check: true }
    );
    expect(r.says).toEqual(['commands: 2 pending']);
    expect(r.patches).toEqual([]);
    expect(r.upserts).toEqual([]);
    expect(file('paused')).toBeNull();
    expect(file('implement-cap')).toBeNull();
  });

  it.skipIf(!canRun)('reads nothing without telemetry', () => {
    const r = apply([{ id: 1, kind: 'pause' }], { telemetry: false });
    expect(r.selects).toEqual([]);
    expect(r.patches).toEqual([]);
    expect(file('paused')).toBeNull();
  });

  describe('copilot and merge', () => {
    // The stubs record their arguments, so the order of check, ack and write shows
    const stubs = (check: string, act: string) => [
      `desk_pr_check() { print -r -- "check $*" >> "${join(home, 't-note')}"; print -r -- "${check}"; }`,
      `desk_pr_act() { print -r -- "act $*" >> "${join(home, 't-note')}"; ${act}; }`
    ];
    const pr = { ticket: 'COD-7', pr: 42 };

    it.skipIf(!canRun)(
      'checks, acks, then writes, with the ticket on the activity row',
      () => {
        const r = apply(
          [
            { id: 1, kind: 'merge', args: pr },
            { id: 2, kind: 'copilot', args: pr }
          ],
          { stubs: stubs('ok PR_node abc123', 'return 0') }
        );
        expect(statuses(r)).toEqual([
          ['applied', null],
          ['applied', null]
        ]);
        expect(r.notes.filter((n) => /^(check|act) /.test(n))).toEqual([
          'check merge COD-7 42',
          'act merge 42 PR_node abc123',
          'check copilot COD-7 42',
          'act copilot 42 PR_node abc123'
        ]);
        expect(changes(r)).toEqual([
          'PR 42 added to the merge queue from the desk (mac)',
          'Copilot review requested on PR 42 from the desk (mac)'
        ]);
        expect(r.upserts.map((u) => u.body['ticket'])).toEqual([
          'COD-7',
          'COD-7'
        ]);
      }
    );

    it.skipIf(!canRun)(
      'refuses with the check reason and writes nothing',
      () => {
        const r = apply([{ id: 1, kind: 'merge', args: pr }], {
          stubs: stubs('checks pending', 'return 0')
        });
        expect(statuses(r)).toEqual([['refused', 'checks pending']]);
        expect(r.notes.some((n) => n.startsWith('act '))).toBe(false);
        expect(changes(r)).toEqual([
          'merge refused from the desk (mac): checks pending'
        ]);
      }
    );

    it.skipIf(!canRun)(
      'turns an acked row refused when the GitHub write fails',
      () => {
        const r = apply([{ id: 1, kind: 'copilot', args: pr }], {
          stubs: stubs(
            'ok PR_node abc123',
            'print -r -- "GitHub did not add Copilot as a reviewer"; return 1'
          )
        });
        expect(r.patches.map((p) => [p.query, p.body['status']])).toEqual([
          ['id=eq.1&status=eq.pending', 'applied'],
          ['id=eq.1', 'refused']
        ]);
        expect(r.patches[1]?.body['note']).toBe(
          'GitHub did not add Copilot as a reviewer'
        );
        expect(changes(r)).toEqual([
          'copilot refused from the desk (mac): GitHub did not add Copilot as a reviewer'
        ]);
      }
    );

    it.skipIf(!canRun)('writes nothing when the ack was lost', () => {
      const r = apply([{ id: 1, kind: 'merge', args: pr }], {
        lost: [1],
        stubs: stubs('ok PR_node abc123', 'return 0')
      });
      expect(r.notes.some((n) => n.startsWith('act '))).toBe(false);
      expect(r.upserts).toEqual([]);
    });

    it.skipIf(!canRun)(
      'keeps a limit value after the empty ticket and pr',
      () => {
        const r = apply([{ id: 1, kind: 'limit', value: 9 }]);
        expect(file('limit')).toBe('9');
        expect(r.upserts.map((u) => u.body['ticket'])).toEqual([null]);
      }
    );
  });
});

// The scheduler's verdict on a desk command, from the PR it just read; desk_pr_check prints it
describe('watch.jq desk_verdict', () => {
  const canRun = spawnSync('jq', ['--version']).status === 0;
  const dir = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const verdict = (kind: string, pr: Record<string, unknown>) =>
    execFileSync(
      'jq',
      [
        '-L',
        dir,
        '-r',
        '--arg',
        'kind',
        kind,
        'include "watch"; desk_verdict($kind)'
      ],
      { input: JSON.stringify(pr), encoding: 'utf8' }
    ).trim();
  const ready = (over: Record<string, unknown> = {}) => ({
    id: 'PR_node',
    headRefOid: 'abc123',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeQueueEntry: null,
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }]
    },
    reviewThreads: { nodes: [] },
    reviewRequests: { nodes: [] },
    reviews: { nodes: [] },
    ...over
  });

  it.skipIf(!canRun)('lets a ready PR through with its node and head', () => {
    expect(verdict('merge', ready())).toBe('ok PR_node abc123');
    expect(verdict('copilot', ready())).toBe('ok PR_node abc123');
  });

  it.skipIf(!canRun).each([
    [{ state: 'MERGED' }, 'PR is merged'],
    [{ isDraft: true }, 'PR is a draft'],
    [{ mergeQueueEntry: { state: 'QUEUED' } }, 'already in the merge queue'],
    [{ mergeable: 'CONFLICTING' }, 'conflicts with main'],
    [{ mergeable: 'UNKNOWN' }, 'GitHub has not checked for conflicts yet'],
    [
      {
        commits: {
          nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }]
        }
      },
      'checks pending'
    ],
    [{ commits: { nodes: [] } }, 'checks missing'],
    [
      { reviewThreads: { pageInfo: { hasNextPage: true }, nodes: [] } },
      'too many review threads to check them all'
    ],
    [
      {
        reviewThreads: {
          nodes: [
            {
              isResolved: false,
              comments: {
                nodes: [{ author: { __typename: 'Bot' }, body: 'x' }]
              }
            }
          ]
        }
      },
      '1 unresolved thread'
    ]
  ])('refuses a merge: %j', (over, why) => {
    expect(verdict('merge', ready(over))).toBe(why);
  });

  it.skipIf(!canRun)(
    'refuses a Copilot request once one is asked or done',
    () => {
      expect(
        verdict(
          'copilot',
          ready({
            reviewRequests: {
              nodes: [
                {
                  requestedReviewer: { login: 'copilot-pull-request-reviewer' }
                }
              ]
            }
          })
        )
      ).toBe('Copilot review already requested');
      expect(
        verdict(
          'copilot',
          ready({
            reviews: {
              nodes: [{ author: { login: 'copilot-pull-request-reviewer' } }]
            }
          })
        )
      ).toBe('Copilot has reviewed it');
    }
  );
});
