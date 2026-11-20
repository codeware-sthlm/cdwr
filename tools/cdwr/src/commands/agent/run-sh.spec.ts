import { execFile, execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { QUEUE_FILES, RUN_INTERVAL_SECONDS } from './agent.logic';

// run.sh runs gh unattended as Håkan, so every gh call must be a read
const SCRIPT = readFileSync(
  fileURLToPath(new URL('../../../agent-queue/run.sh', import.meta.url)),
  'utf8'
);

const READS = [
  /^gh pr list /,
  /^gh api graphql -f query="\$PR_QUERY" /,
  // The apply list's reads: the production deploy of a merge commit, the files a PR added
  /^gh api "repos\/codeware-sthlm\/cdwr\/actions\/workflows\/fly-deployment\.yml\/runs\?head_sha=\$1&per_page=5" /,
  /^gh api --paginate "repos\/codeware-sthlm\/cdwr\/pulls\/\$pr\/files" /,
  // read_deploy: the Fly Deployment runs of a merge commit, their jobs and annotations
  /^gh api "repos\/codeware-sthlm\/cdwr\/(actions\/(workflows\/fly-deployment\.yml\/runs\?head_sha=|runs\/\$rid\/jobs\?per_page=100)|check-runs\/\$job\/annotations)/
];

// The Copilot request and the merge command (the desk's, and the watch's own) are run.sh's only
// GitHub writes, in copilot_request and desk_pr_act
const COPILOT_REQUEST =
  SCRIPT.match(/^copilot_request\(\) \{\n[\s\S]*?\n\}\n/m)?.[0] ?? '';
const DESK_PR_ACT =
  SCRIPT.match(/^desk_pr_act\(\) \{\n[\s\S]*?\n\}\n/m)?.[0] ?? '';

const ghCalls = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.match(/\bgh\s.*/g) ?? []);

describe('run.sh', () => {
  const calls = ghCalls(
    SCRIPT.replace(DESK_PR_ACT, '').replace(COPILOT_REQUEST, '')
  );

  it('calls gh', () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each(calls)('only reads: %s', (call) => {
    expect(READS.some((read) => read.test(call))).toBe(true);
  });

  it('writes to GitHub only in copilot_request and desk_pr_act, as the app', () => {
    expect(COPILOT_REQUEST).not.toBe('');
    expect(DESK_PR_ACT).not.toBe('');
    const notRead = (call: string) => !READS.some((read) => read.test(call));
    expect(ghCalls(COPILOT_REQUEST).filter(notRead)).toEqual([
      'gh api -X POST "repos/codeware-sthlm/cdwr/pulls/$pr/requested_reviewers"'
    ]);
    expect(ghCalls(DESK_PR_ACT).filter(notRead)).toEqual([
      'gh api graphql -f query="$ENQUEUE" -f id="$id" -f oid="$oid" 2>&1)" && return 0 ;;'
    ]);
    // The app's token first, then Håkan's token, with no fallback to the signed-in user
    expect(COPILOT_REQUEST.indexOf('if gh_identity; then')).toBeLessThan(
      COPILOT_REQUEST.indexOf('"${request[@]}"')
    );
    expect(
      COPILOT_REQUEST.split('\n').filter(
        (line) =>
          line.includes('"${request[@]}"') &&
          !line.includes('GH_TOKEN="$token"')
      )
    ).toHaveLength(1);
    expect(DESK_PR_ACT.indexOf('gh_identity ||')).toBeLessThan(
      DESK_PR_ACT.indexOf('case "$kind"')
    );
    expect(COPILOT_REQUEST).not.toContain('gh_read');
    expect(DESK_PR_ACT).not.toContain('gh_read');
    // Copilot is requested only through copilot_request
    expect(SCRIPT.match(/\brequested_reviewers\b/g)).toHaveLength(1);
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

  it('leaves planned tickets out of the plan-only selection', () => {
    expect(SCRIPT).toContain('select((status_rows | length) == 0)');
    expect(SCRIPT).toMatch(
      /identifier\n\s+description\n\s+state \{ type \}\n\s+labels \{ nodes \{ name \} \}\n\s+inverseRelations/
    );
  });

  it('counts an offered ticket still agent:ready with a plan as planned', () => {
    const planned = SCRIPT.slice(SCRIPT.indexOf("read -r -d '' PLANNED"));
    expect(planned).toContain(
      'labels: { some: { name: { in: ["agent:needs-input", "agent:ready"] } } }'
    );
    expect(planned).toContain('(^|\\n)##\\\\s+plan\\\\s*(\\n|$)');
    expect(planned).toContain('record planned "$id"');
    expect(planned).toContain(
      'notice info "$id: plan approved, an implementing run follows"'
    );
    expect(planned).toContain('notify "$id: plan ready, needs your approval"');
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
    expect(SCRIPT).not.toContain('launch-pick:');
    expect(SCRIPT).toContain('AGENT_QUEUE_IMPLEMENT_CAP_USD:-40');
  });

  it('keys attended.json by the launch candidate and keeps the pick in the fallback', () => {
    expect(SCRIPT).toContain('pick: ($d.pick | if . == null then null else');
    expect(SCRIPT).toContain('session: $s.state, launch: $a}');
    expect(SCRIPT).toContain(
      '{action: "skip", reason: $r, key: null, pick: (if .verdict == "run"'
    );
  });

  // COD-657: the Mac plans and notifies; implement sessions start in the container only
  it('turns a launch into a notice off the container, before anything acts on it', () => {
    const guard =
      'if [[ "${AGENT_QUEUE_HOST:-}" != container && "$(jq -r \'.action\' <<<"$decision")" == launch ]]; then\n' +
      '    decision="$(jq -c \'.action = "notify" | .reason = "implement runs only in the container"\' <<<"$decision")"\n' +
      '  fi\n';
    expect(SCRIPT).toContain(guard);
    const at = SCRIPT.indexOf(guard);
    expect(SCRIPT.indexOf('\'include "watch"; launch($g)\'')).toBeLessThan(at);
    expect(at).toBeLessThan(SCRIPT.indexOf('print -r -- "launch: '));
    expect(at).toBeLessThan(
      SCRIPT.indexOf(
        'local action; action="$(jq -r \'.action\' <<<"$decision")"'
      )
    );
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
      `'include "watch"; .data.issues.nodes | attended($now; $limit; $watch; $waits; $renovate; $session)'`
    );
    expect(SCRIPT).toContain('--argjson session "$session"');
    // The session is read before the pick, which takes it
    expect(SCRIPT.indexOf('session_state($now)')).toBeLessThan(
      SCRIPT.indexOf(
        'attended($now; $limit; $watch; $waits; $renovate; $session)'
      )
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

  // The own events keep what the activity row says about the run apart from them
  it('keeps and sends the own events after the activity and before the queue state', () => {
    const exit = SCRIPT.slice(SCRIPT.indexOf('on_exit() {'));
    const at = (call: string) => exit.indexOf(`  ${call}\n`);
    expect(at('own_self_deploy')).toBeGreaterThan(at('record_activity'));
    expect(at('own_send')).toBeGreaterThan(at('own_self_deploy'));
    expect(at('own_send')).toBeLessThan(at('record_queue_state'));
  });
});

// What the queue did on its own: own.jsonl, kept 7 days and sent to own_actions
describe('run.sh own events', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let home: string;

  const sleep = (ms: number) =>
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const file = (name: string) =>
    existsSync(join(home, name))
      ? readFileSync(join(home, name), 'utf8')
      : null;
  const events = () =>
    (file('own.jsonl') ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  const put = (rows: (Record<string, unknown> | string)[]) =>
    writeFileSync(
      join(home, 'own.jsonl'),
      rows
        .map((r) => (typeof r === 'string' ? r : JSON.stringify(r)))
        .join('\n') + '\n'
    );

  // Runs the body with the functions cut out of run.sh; supabase_upsert records its arguments
  const sh = (
    body: string[],
    opts: { check?: boolean; telemetry?: boolean } = {}
  ) =>
    spawnSync(
      'zsh',
      [
        '-c',
        [
          `HOME_DIR="${home}"; OWN="${home}/own.jsonl"; check=${opts.check ?? false}`,
          'telemetry_host() { print -r -- nuc; }',
          `telemetry_on() { ${opts.telemetry === false ? 'return 1' : 'return 0'}; }`,
          `supabase_upsert() { print -r -- "$1|$2|$3|$4" >> "${home}/upsert"; }`,
          'note() { print -r -- "$*" >> "$HOME_DIR/notes"; }',
          fn('own_event'),
          fn('own_self_deploy'),
          fn('own_send'),
          ...body
        ].join('\n')
      ],
      { encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: home } }
    );
  // The detached upsert: wait for its file, or for a moment when none is due
  const upsert = () => {
    for (let i = 0; i < 50 && !existsSync(join(home, 'upsert')); i++)
      sleep(100);
    const line = file('upsert');
    if (line === null) return null;
    const [table, key, rows, mode] = line.trim().split('|');
    return {
      table,
      key,
      mode,
      rows: JSON.parse(rows as string) as Record<string, unknown>[]
    };
  };
  const quiet = () => {
    sleep(600);
    return file('upsert');
  };
  const ago = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'own-events-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  describe('own_event', () => {
    it.skipIf(!canRun)('appends one line with the host and the time', () => {
      const r = sh([
        `own_event '{"event_id":"e1","kind":"merge","ticket":"COD-1","pr":5,"title":"t","target":"abc1234","result":"merged","reason":"why"}'`
      ]);
      expect(r.status).toBe(0);
      const [e, ...rest] = events();
      expect(rest).toEqual([]);
      expect(e).toMatchObject({
        event_id: 'e1',
        host: 'nuc',
        kind: 'merge',
        ticket: 'COD-1',
        pr: 5,
        title: 't',
        target: 'abc1234',
        result: 'merged',
        reason: 'why'
      });
      expect(e?.['at']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it.skipIf(!canRun)('keeps a given time and nulls what is missing', () => {
      sh([
        `own_event '{"event_id":"e2","kind":"deploy","result":"ok","at":"2026-01-02T03:04:05Z"}'`
      ]);
      expect(events()).toEqual([
        {
          event_id: 'e2',
          at: '2026-01-02T03:04:05Z',
          host: 'nuc',
          kind: 'deploy',
          ticket: null,
          pr: null,
          title: null,
          target: null,
          result: 'ok',
          reason: null
        }
      ]);
    });

    it.skipIf(!canRun)('does nothing with --check', () => {
      sh([`own_event '{"event_id":"e3","kind":"merge","result":"merged"}'`], {
        check: true
      });
      expect(file('own.jsonl')).toBeNull();
    });
  });

  describe('own_self_deploy', () => {
    const deploy = (d: Record<string, unknown>) =>
      writeFileSync(join(home, 'deploy.json'), JSON.stringify(d));
    const tag = 'sha-abc';

    it.skipIf(!canRun)('records a settled deploy once and stamps it', () => {
      deploy({
        tag,
        phase: 'rolled-back',
        reason: 'health check failed',
        at: '2026-11-20T07:12:00Z'
      });
      sh(['own_self_deploy']);
      expect(events()).toEqual([
        {
          event_id: `self-deploy:${tag}:rolled-back`,
          at: '2026-11-20T07:12:00Z',
          host: 'nuc',
          kind: 'self-deploy',
          ticket: null,
          pr: null,
          title: null,
          target: tag,
          result: 'rolled-back',
          reason: 'health check failed'
        }
      ]);
      expect(file('deploy-recorded')?.trim()).toBe(
        `self-deploy:${tag}:rolled-back`
      );
      sh(['own_self_deploy']);
      expect(events()).toHaveLength(1);
    });

    it.skipIf(!canRun).each(['ok', 'stuck'])('records phase %s', (phase) => {
      deploy({ tag, phase });
      sh(['own_self_deploy']);
      expect(events()).toMatchObject([
        { event_id: `self-deploy:${tag}:${phase}`, result: phase, reason: null }
      ]);
    });

    it.skipIf(!canRun)('takes the time only when it looks like one', () => {
      deploy({ tag, phase: 'ok', at: 'yesterday' });
      sh(['own_self_deploy']);
      expect(events()[0]?.['at']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(events()[0]?.['at']).not.toBe('yesterday');
    });

    it.skipIf(!canRun).each(['checking', 'superseded'])(
      'records nothing for phase %s',
      (phase) => {
        deploy({ tag, phase });
        sh(['own_self_deploy']);
        expect(file('own.jsonl')).toBeNull();
        expect(file('deploy-recorded')).toBeNull();
      }
    );

    it.skipIf(!canRun)('records a new phase of the same tag again', () => {
      deploy({ tag, phase: 'stuck' });
      sh(['own_self_deploy']);
      deploy({ tag, phase: 'ok' });
      sh(['own_self_deploy']);
      expect(events().map((e) => e['event_id'])).toEqual([
        `self-deploy:${tag}:stuck`,
        `self-deploy:${tag}:ok`
      ]);
    });

    it.skipIf(!canRun)('does nothing without a deploy.json', () => {
      sh(['own_self_deploy']);
      expect(file('own.jsonl')).toBeNull();
    });
  });

  describe('own_send', () => {
    const row = (id: string, at: string) => ({
      event_id: id,
      at,
      host: 'nuc',
      kind: 'merge',
      result: 'merged'
    });

    it.skipIf(!canRun)(
      'trims old rows and bad lines, dedupes, and upserts with ignore',
      () => {
        put([
          row('old', ago(8)),
          'not json',
          row('b', ago(1)),
          row('a', ago(2)),
          row('b', ago(1))
        ]);
        sh(['own_send']);
        const sent = upsert();
        expect(sent).toMatchObject({
          table: 'own_actions',
          key: 'event_id',
          mode: 'ignore'
        });
        expect(sent?.rows.map((r) => r['event_id']).sort()).toEqual(['a', 'b']);
        expect(
          events()
            .map((e) => e['event_id'])
            .sort()
        ).toEqual(['a', 'b']);
      }
    );

    it.skipIf(!canRun)(
      'still trims with telemetry off, and sends nothing',
      () => {
        put([row('old', ago(8)), row('new', ago(1))]);
        sh(['own_send'], { telemetry: false });
        expect(quiet()).toBeNull();
        expect(events().map((e) => e['event_id'])).toEqual(['new']);
      }
    );

    it.skipIf(!canRun)('sends nothing when every row is old', () => {
      put([row('old', ago(9))]);
      sh(['own_send']);
      expect(quiet()).toBeNull();
      expect(events()).toEqual([]);
    });

    it.skipIf(!canRun)('sends nothing for an empty file', () => {
      writeFileSync(join(home, 'own.jsonl'), '');
      sh(['own_send']);
      expect(quiet()).toBeNull();
    });
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
  // a parent whose agent split finished is closed with a comment, a split's next part is labelled
  // agent:ready with a comment, and the apply list ticks its items in the PR-ready comment. Nothing
  // else. The last mutation is GitHub's, the desk's merge (ENQUEUE).
  it('holds exactly five Linear mutations, each in its named query', () => {
    expect(code.match(/mutation\b/gi)).toHaveLength(6);
    expect(gql('COMMENT_UPDATE')).toMatch(/^mutation\(/);
    expect(gql('COMMENT_UPDATE')).toContain('commentUpdate(');
    expect(code.match(/commentUpdate\b/g)).toHaveLength(2);
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
    expect(gql('LABEL_PART')).toMatch(/^mutation\(/);
    expect(gql('LABEL_PART')).toContain('addedLabelIds: [$label]');
    expect(code.match(/issueUpdate\b/g)).toHaveLength(6);
    expect(code.match(/commentCreate\b/g)).toHaveLength(4);
  });

  it.each([
    ['RELABEL', 'relabel_merged'],
    ['CLOSE_PARENT', 'close_parents'],
    ['LABEL_PART', 'label_parts'],
    ['COMMENT_UPDATE', 'apply_tick']
  ])('uses "$%s" only inside %s', (name, owner) => {
    const body = fn(owner);
    expect(body).toContain(`linear "$${name}" "$vars"`);
    expect(code.split(`"$${name}"`)).toHaveLength(2);
    expect(code.replace(body, '')).not.toContain(`$${name}`);
  });

  it('uses "$CLOSE_COMMENT" only inside close_parents and label_parts', () => {
    for (const owner of ['close_parents', 'label_parts']) {
      expect(fn(owner)).toContain('linear "$CLOSE_COMMENT" "$vars"');
    }
    expect(code.split('"$CLOSE_COMMENT"')).toHaveLength(4);
    expect(
      code.replace(fn('close_parents'), '').replace(fn('label_parts'), '')
    ).not.toContain('$CLOSE_COMMENT');
  });

  it('closes parents then labels parts after the watches, never on --check', () => {
    expect(code).toMatch(
      /if ! \$check; then\n {2}err="\$\(watch_prs\)"[^\n]*\n {2}apply_lists\n {2}err="\$\(watch_renovate\)"[^\n]*\n {2}err="\$\(close_parents\)"[^\n]*\n {2}err="\$\(label_parts\)" \|\| \{/
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
    // is_agent tells the agent's comments by their author
    // and the apply list ticks its items in the comment by id
    expect(watched).toContain('nodes { id body createdAt user { id app } }');
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

  it('gives the plan, suggest and devlog claude runs the Linear MCP flags', () => {
    expect(
      code.match(/--model opus "\$\{LINEAR_MCP_ARGS\[@\]\}"/g)
    ).toHaveLength(3);
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
    expect(code).toContain('print -r -- "linear: ok ($LINEAR_MCP$via)"');
    // `via` names the proxy only in key mode with the proxy set
    expect(code).toContain(
      '[[ "$LINEAR_MCP" == key && -n "$LINEAR_PROXY_URL" ]] && via=" via proxy"'
    );
    expect(code).not.toMatch(/linear: [^\n]*\$\{why:-/);
  });

  // Every Linear tool a run.sh launch allows is on the list the container's proxy lets through
  it('allows only Linear tools that linear-tools.txt lists', () => {
    const listed = readFileSync(
      fileURLToPath(
        new URL('../../../agent-queue/linear-tools.txt', import.meta.url)
      ),
      'utf8'
    )
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean);
    const used = [...code.matchAll(/"\$L"__(\w+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !listed.includes(name ?? ''))).toEqual([]);
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
      /telemetry_queue_state [^)]*"\$watch" "\$renovate" "\$devlog" "\$review" "\$deploy" \) &!/s
    );
    expect(SCRIPT).toContain(
      'deploy="$(cat "$HOME_DIR/deploy.json" 2>/dev/null)"'
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
    expect(SCRIPT).toContain('if ! $paused; then\n  if ! take_run_lock $$');
    const at = SCRIPT.indexOf('if $paused; then\n  last_outcome=paused');
    expect(at).toBeGreaterThan(SCRIPT.indexOf('take_run_lock $$'));
    expect(at).toBeLessThan(SCRIPT.indexOf('linear_auth || {'));
    expect(at).toBeLessThan(SCRIPT.indexOf('if offline; then'));
    expect(SCRIPT).toContain('$check || CHECKIN_ID="$(checkin in_progress)"');
    expect(SCRIPT).toContain('if ! $check; then');
  });

  it('opens after the lock and closes by exit status in on_exit', () => {
    const lock = SCRIPT.indexOf('take_run_lock $$');
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

  const run = (args = 'planning', cwd = `${root}/work`) => {
    const script = [
      'set -euo pipefail',
      `LOGS="${root}"; REPO="${root}/work"`,
      `note() { print -r -- "$*" >> "$LOGS/notes"; }`,
      `record() { print -r -- "$*" >> "$LOGS/records"; }`,
      fn,
      `cd "${cwd}"`,
      `to_main ${args}`,
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
    expect(read('pnpm.calls')).toBe(
      `-C ${root}/work install --frozen-lockfile\n`
    );
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
    expect(read('pnpm.calls')).toBe(
      `-C ${root}/work install --frozen-lockfile\n`
    );
  });

  it.skipIf(!hasZsh)('warns, carries on, and retries on the next run', () => {
    setup(true);
    installedFrom('a\n');
    stub(1);
    expect(run().status).toBe(0);
    expect(read('records')).toContain('install failed after a lockfile change');
    expect(read('notes')).toContain('done');
    expect(run().status).toBe(0);
    const call = `-C ${root}/work install --frozen-lockfile\n`;
    expect(read('pnpm.calls')).toBe(call + call);
  });

  it.skipIf(!hasZsh)('with quiet, a failed install is only noted', () => {
    setup(true);
    installedFrom('a\n');
    stub(1);
    expect(run('platform quiet').status).toBe(0);
    expect(read('notes')).toContain('install failed after a lockfile change');
    expect(read('records')).toBe('');
  });

  it.skipIf(!hasZsh)('with quiet, a dirty worktree is only noted', () => {
    setup(true);
    stub(0);
    // origin/main changed the lockfile, so a local edit of it blocks the switch
    writeFileSync(join(root, 'work', 'pnpm-lock.yaml'), 'dirty\n');
    expect(run('platform quiet').status).toBe(0);
    expect(read('notes')).toContain('worktree not clean');
    expect(read('records')).toBe('');
    expect(read('pnpm.calls')).toBe('');
  });

  it.skipIf(!hasZsh)('moves the checkout from another cwd', () => {
    setup(true);
    installedFrom('a\n');
    stub(0);
    expect(run('planning', '/').status).toBe(0);
    expect(git(join(root, 'work'), 'rev-parse', 'HEAD')).toBe(
      git(join(root, 'origin'), 'rev-parse', 'HEAD')
    );
    expect(read('pnpm.calls')).toBe(
      `-C ${root}/work install --frozen-lockfile\n`
    );
    expect(marker()).toBe(lockHash());
  });
});

describe('run.sh implement_live', () => {
  const fn = SCRIPT.match(/^implement_live\(\) \{\n[\s\S]*?\n\}\n/m)?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  let root: string;

  const live = () =>
    spawnSync('zsh', ['-c', `HOME_DIR="${root}"\n${fn}\nimplement_live`], {
      encoding: 'utf8'
    }).status === 0;
  const lock = (pid?: string) => {
    mkdirSync(join(root, 'implement.lock'));
    if (pid !== undefined)
      writeFileSync(join(root, 'implement.lock', 'pid'), `${pid}\n`);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'impl-live-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(fn).toContain('implement_live()');
  });

  it.skipIf(!hasZsh)('is false without a lock', () => {
    expect(live()).toBe(false);
  });

  it.skipIf(!hasZsh)('is true while the pid in the lock answers', () => {
    lock(String(process.pid));
    expect(live()).toBe(true);
  });

  it.skipIf(!hasZsh)('is false when the pid in the lock is gone', () => {
    lock(String(spawnSync('true').pid));
    expect(live()).toBe(false);
  });

  it.skipIf(!hasZsh)('is true for a fresh lock without a pid', () => {
    lock();
    expect(live()).toBe(true);
  });

  it.skipIf(!hasZsh)(
    'is false for a lock without a pid over a minute old',
    () => {
      lock();
      const old = new Date(Date.now() - 2 * 60 * 1000);
      utimesSync(join(root, 'implement.lock'), old, old);
      expect(live()).toBe(false);
    }
  );
});

describe('run.sh queue lock', () => {
  const cut = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const fns = ['run_lock_live', 'take_run_lock', 'drop_run_lock'].map(cut);
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  let root: string;

  const lockDir = () => join(root, 'lock');
  const lock = (pid?: string) => {
    mkdirSync(lockDir());
    if (pid !== undefined) writeFileSync(join(lockDir(), 'pid'), `${pid}\n`);
  };
  const age = () => {
    const old = new Date(Date.now() - 2 * 60 * 1000);
    utimesSync(lockDir(), old, old);
  };
  const dead = () => String(spawnSync('true').pid);
  // runs the helpers with note writing to $HOME_DIR/notes
  const sh = (call: string) =>
    spawnSync(
      'zsh',
      [
        '-c',
        [
          `HOME_DIR="${root}"`,
          'note() { print -r -- "$*" >> "$HOME_DIR/notes"; }',
          ...fns,
          call
        ].join('\n')
      ],
      { encoding: 'utf8' }
    ).status;
  const pidFile = () => readFileSync(join(lockDir(), 'pid'), 'utf8').trim();
  const notes = () =>
    existsSync(join(root, 'notes'))
      ? readFileSync(join(root, 'notes'), 'utf8')
      : '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'run-lock-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    for (const f of fns) expect(f).not.toBe('');
  });

  it.skipIf(!hasZsh)('takes a free lock and writes the owner pid', () => {
    expect(sh('take_run_lock 4242')).toBe(0);
    expect(pidFile()).toBe('4242');
    expect(notes()).toBe('');
  });

  it.skipIf(!hasZsh)('clears a lock whose pid is gone and takes it', () => {
    const gone = dead();
    lock(gone);
    expect(sh('take_run_lock 4242')).toBe(0);
    expect(pidFile()).toBe('4242');
    expect(notes()).toContain(`warn: cleared lock; its run ${gone} is gone`);
  });

  it.skipIf(!hasZsh)(
    'leaves a stale lock alone while another run clears it',
    () => {
      lock(dead());
      mkdirSync(join(root, 'lock.takeover'));
      expect(sh('take_run_lock 4242')).not.toBe(0);
      expect(pidFile()).not.toBe('4242');
      expect(notes()).toBe('');
    }
  );

  it.skipIf(!hasZsh)(
    'clears a takeover left by a killed run after a minute',
    () => {
      lock(dead());
      const takeover = join(root, 'lock.takeover');
      mkdirSync(takeover);
      const old = new Date(Date.now() - 2 * 60 * 1000);
      utimesSync(takeover, old, old);
      expect(sh('take_run_lock 4242')).toBe(0);
      expect(pidFile()).toBe('4242');
      expect(existsSync(takeover)).toBe(false);
    }
  );

  it.skipIf(!hasZsh)('keeps a lock whose pid answers', () => {
    lock(String(process.pid));
    expect(sh('take_run_lock 4242')).not.toBe(0);
    expect(pidFile()).toBe(String(process.pid));
    expect(notes()).toBe('');
    expect(sh('run_lock_live')).toBe(0);
  });

  it.skipIf(!hasZsh)('keeps a fresh lock without a pid', () => {
    lock();
    expect(sh('take_run_lock 4242')).not.toBe(0);
    expect(existsSync(join(lockDir(), 'pid'))).toBe(false);
  });

  it.skipIf(!hasZsh)('clears a lock without a pid over a minute old', () => {
    lock();
    age();
    expect(sh('take_run_lock 4242')).toBe(0);
    expect(pidFile()).toBe('4242');
    expect(notes()).toContain('warn: cleared lock; its run ? is gone');
  });

  it.skipIf(!hasZsh)('is not live without a lock', () => {
    expect(sh('run_lock_live')).not.toBe(0);
  });

  it.skipIf(!hasZsh)('drops only its own lock', () => {
    lock('4242');
    expect(sh('drop_run_lock 1111')).toBe(0);
    expect(existsSync(lockDir())).toBe(true);
    expect(sh('drop_run_lock 4242')).toBe(0);
    expect(existsSync(lockDir())).toBe(false);
  });

  it.skipIf(!hasZsh)('leaves a lock without a pid when dropping', () => {
    lock();
    expect(sh('drop_run_lock 4242')).toBe(0);
    expect(existsSync(lockDir())).toBe(true);
  });

  it.skipIf(!hasZsh)('platform_move writes its own pid, not the parent', () => {
    const move = cut('platform_move');
    const r = spawnSync(
      'zsh',
      [
        '-c',
        [
          `HOME_DIR="${root}"`,
          'exec >/dev/null 2>&1',
          'zmodload zsh/system',
          'note() { :; }',
          'implement_near() {',
          '  cat "$HOME_DIR/lock/pid" > "$HOME_DIR/seen"',
          '  print -r -- "$sysparams[pid]" > "$HOME_DIR/own"',
          '  return 0',
          '}',
          ...fns,
          move,
          '( platform_move )',
          'print -r -- "$$" > "$HOME_DIR/parent"'
        ].join('\n')
      ],
      { encoding: 'utf8' }
    );
    expect(r.status).toBe(0);
    const seen = readFileSync(join(root, 'seen'), 'utf8').trim();
    expect(seen).toBe(readFileSync(join(root, 'own'), 'utf8').trim());
    expect(seen).not.toBe(readFileSync(join(root, 'parent'), 'utf8').trim());
    expect(existsSync(lockDir())).toBe(false);
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

describe('run.sh label_parts', () => {
  const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  // The queries and the function as written in run.sh
  const source = SCRIPT.slice(
    SCRIPT.indexOf("read -r -d '' PARTS"),
    SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('label_parts() {')) + 3
  );
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;

  const part = (
    description: string,
    comments: unknown[] = [],
    labels: Array<{ name: string }> = []
  ) => ({
    data: {
      issues: {
        nodes: [
          {
            id: 'uuid-102',
            identifier: 'COD-102',
            description,
            comments: { nodes: comments },
            team: { key: 'COD' },
            parent: { identifier: 'COD-100', state: { type: 'started' } },
            state: { type: 'backlog' },
            labels: { nodes: labels },
            inverseRelations: {
              nodes: [
                {
                  type: 'blocks',
                  issue: {
                    identifier: 'COD-101',
                    completedAt: '2026-11-01T00:00:00Z',
                    state: { type: 'completed' },
                    labels: { nodes: [{ name: 'agent:review' }] }
                  }
                }
              ],
              pageInfo: { hasNextPage: false }
            }
          }
        ]
      },
      issueLabels: { nodes: [{ id: 'lbl-ready', team: { key: 'COD' } }] }
    }
  });

  // Runs label_parts with a fake Linear; `update` is what the label update answers
  const run = (
    update: unknown,
    description = '## Report\n\nDone.',
    comments: unknown[] = [],
    labels: Array<{ name: string }> = []
  ) => {
    writeFileSync(
      join(root, 'parts.json'),
      JSON.stringify(part(description, comments, labels))
    );
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
      '    *issueUpdate*) print -r -- "label $2" >> "$ROOT/calls"; cat "$ROOT/update.json" ;;',
      '    *commentCreate*) print -r -- "comment $2" >> "$ROOT/calls"; print -r -- \'{"data":{"commentCreate":{"success":true}}}\' ;;',
      '    *) cat "$ROOT/parts.json" ;;',
      '  esac',
      '}',
      // The comment mutation is shared with close_parents
      SCRIPT.slice(
        SCRIPT.indexOf("read -r -d '' CLOSE_COMMENT"),
        SCRIPT.indexOf(
          'GQL\n',
          SCRIPT.indexOf("read -r -d '' CLOSE_COMMENT") + 40
        ) + 4
      ),
      source,
      'label_parts; print -r -- "rc=$?"'
    ].join('\n');
    return spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
  };
  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'label-parts-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is found in run.sh', () => {
    expect(source).toContain('label_parts() {');
    expect(source).toContain("read -r -d '' LABEL_PART");
    expect(source).toContain(
      'comments(first: 50, orderBy: createdAt) { nodes { body createdAt user { id app } } }'
    );
  });

  it.skipIf(!canRun)('labels a ready part once, then comments', () => {
    const result = run({ data: { issueUpdate: { success: true } } });
    expect(result.stdout).toContain('rc=0');
    expect(read('calls').trim().split('\n')).toEqual([
      'label {"id":"uuid-102","label":"lbl-ready"}',
      `comment ${JSON.stringify({ id: 'uuid-102', body: '**Agent: labelled ready** every blocker is closed: COD-101 (Done).' })}`
    ]);
    expect(read('records')).toBe('labelled COD-102 every blocker is closed\n');
    expect(read('notices')).toBe(
      'info COD-102 labelled agent:ready: every blocker is closed\n'
    );
    expect(read('labelled-parts')).toBe('COD-102\n');
  });

  it.skipIf(!canRun)('leaves a part it labelled before alone', () => {
    writeFileSync(join(root, 'labelled-parts'), 'COD-102\n');
    const result = run({ data: { issueUpdate: { success: true } } });
    expect(result.stdout).toContain('rc=0');
    expect(read('calls')).toBe('');
    expect(read('records')).toBe('');
  });

  it.skipIf(!canRun)('leaves a part the queue labelled on another host', () => {
    const result = run(
      { data: { issueUpdate: { success: true } } },
      undefined,
      [
        {
          body: '**Agent: labelled ready** every blocker is closed: COD-101 (Done).',
          createdAt: '2026-11-02T00:00:00Z',
          user: { id: 'bbbb4a33-e052-486e-8e0f-d3abb5c5c841', app: true }
        }
      ]
    );
    expect(result.stdout).toContain('rc=0');
    expect(read('calls')).toBe('');
    expect(read('records')).toBe('');
  });

  it.skipIf(!canRun)('leaves a part whose report asks Håkan first', () => {
    const result = run(
      { data: { issueUpdate: { success: true } } },
      '## Report\n\n**Ask me before implementing**\n'
    );
    expect(result.stdout).toContain('rc=0');
    expect(read('calls')).toBe('');
    expect(read('records')).toBe('');
    expect(read('labelled-parts')).toBe('');
  });

  it.skipIf(!canRun)(
    'only warns when the label fails, and posts no comment',
    () => {
      const result = run({ errors: [{ message: 'nope' }] });
      expect(result.stdout).toContain('rc=0');
      expect(read('calls')).not.toContain('comment');
      expect(read('records')).toBe('warn COD-102 label: part label failed\n');
      expect(read('notes')).toContain('warn: label: COD-102 failed ("nope")');
      expect(read('notices')).toBe('');
      expect(read('labelled-parts')).toBe('');
    }
  );

  it.skipIf(!canRun)(
    'posts the comment again for a part it labelled whose comment failed',
    () => {
      writeFileSync(join(root, 'labelled-parts'), 'COD-102\n');
      const result = run({}, undefined, [], [{ name: 'agent:ready' }]);
      expect(result.stdout).toContain('rc=0');
      expect(read('calls').trim().split('\n')).toEqual([
        `comment ${JSON.stringify({ id: 'uuid-102', body: '**Agent: labelled ready** every blocker is closed: COD-101 (Done).' })}`
      ]);
      expect(read('notes')).toContain('label: COD-102 comment posted on retry');
      expect(read('records')).toBe('');
    }
  );

  it.skipIf(!canRun)('posts nothing more once the comment is there', () => {
    writeFileSync(join(root, 'labelled-parts'), 'COD-102\n');
    const result = run(
      {},
      undefined,
      [
        {
          body: '**Agent: labelled ready** every blocker is closed: COD-101 (Done).',
          createdAt: '2026-11-02T00:00:00Z',
          user: { id: 'bbbb4a33-e052-486e-8e0f-d3abb5c5c841', app: true }
        }
      ],
      [{ name: 'agent:ready' }]
    );
    expect(result.stdout).toContain('rc=0');
    expect(read('calls')).toBe('');
  });
});

describe('run.sh watch_prs', () => {
  const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const cutFn = (name: string) =>
    SCRIPT.slice(
      SCRIPT.indexOf(`${name}() {`),
      SCRIPT.indexOf('\n}\n', SCRIPT.indexOf(`${name}() {`)) + 3
    );
  const source = [cutFn('hold_list_warn'), cutFn('watch_prs')].join('\n');
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;

  const ticket = {
    identifier: 'COD-5',
    labels: { nodes: [{ name: 'agent:working' }] },
    description: null as string | null,
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
    more = false,
    opts: { pr?: Record<string, unknown>; noHolds?: boolean } = {}
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
        commits: { nodes: [] },
        ...opts.pr
      })
    );
    const script = [
      `ROOT="${root}"; HOME_DIR="${root}"; OTHER_REPOS='[]'; WATCHED=w; WATCH_LABELS=l; PR_QUERY=q`,
      // The real hold list, or a directory with none
      `WATCH_DIR="${opts.noHolds ? root : DIR}"`,
      // The merge: one line per call; it fails with a reason while act-fail exists
      'desk_pr_act() { print -r -- "$*" >> "$ROOT/act"; [[ -f "$ROOT/act-fail" ]] || return 0; print -r -- "GitHub said no"; return 1; }',
      // The deploy read has its own spec; here it prints the deploy in the file, if any
      'read_deploy() { [[ -f "$ROOT/deploy" ]] && cat "$ROOT/deploy"; return 0; }',
      `note() { print -r -- "$*" >> "$ROOT/notes"; }`,
      `record() { print -r -- "$*" >> "$ROOT/records"; }`,
      `notice() { print -r -- "$*" >> "$ROOT/notices"; }`,
      `watch() { jq -L "${DIR}" "$@"; }`,
      'watch_err() { :; }',
      'gh_identity_or_note() { :; }',
      'gh_read() { cat "$ROOT/pr.json"; }',
      'relabel_merged() { print -r -- "$*" >> "$ROOT/relabels"; }',
      // The request: one line per call; it fails with a reason while copilot-fail exists
      'copilot_request() { print -r -- "$1" >> "$ROOT/copilot"; [[ -f "$ROOT/copilot-fail" ]] || return 0; print -r -- "no Copilot seat"; return 1; }',
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

  describe('Copilot request for a ticket parked on Copilot', () => {
    const parkedTicket = (wait = 'copilot', pr = 754) => ({
      ...ticket,
      description: `Status\n\n**Next:** Waiting: ${wait} · PR #${pr} · since 2026-01-01T00:00Z\n`
    });
    const entry = () => JSON.parse(read('watch.json'))['COD-5'];

    it.skipIf(!canRun)('asks once and stores the request', () => {
      const result = run('feature/cod-5', [[parkedTicket()]]);
      expect(result.stdout).toContain('rc=0');
      expect(read('copilot')).toBe('754\n');
      expect(entry().copilotAsked).toMatchObject({ ok: true, why: null });
      expect(entry().copilotAsked.at).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(entry().copilot).toBe('requested');
      expect(read('notices')).toBe('');
    });

    it.skipIf(!canRun)('stores a failure and notices it once', () => {
      writeFileSync(join(root, 'copilot-fail'), '');
      const result = run('feature/cod-5', [[parkedTicket()]]);
      expect(result.stdout).toContain('rc=0');
      expect(read('copilot')).toBe('754\n');
      expect(entry().copilotAsked).toMatchObject({
        ok: false,
        why: 'no Copilot seat'
      });
      expect(entry().copilot).toBe('none');
      expect(read('notices')).toBe(
        'action COD-5: could not request Copilot on PR 754: no Copilot seat\n'
      );
    });

    it.skipIf(!canRun)('does not ask again on the next tick', () => {
      run('feature/cod-5', [[parkedTicket()]]);
      const first = entry().copilotAsked;
      const result = run('feature/cod-5', [[parkedTicket()]]);
      expect(result.stdout).toContain('rc=0');
      expect(read('copilot')).toBe('754\n');
      expect(entry().copilotAsked).toEqual(first);
    });

    it.skipIf(!canRun)('does not ask again after a failed try', () => {
      writeFileSync(join(root, 'copilot-fail'), '');
      run('feature/cod-5', [[parkedTicket()]]);
      run('feature/cod-5', [[parkedTicket()]]);
      expect(read('copilot')).toBe('754\n');
      expect(read('notices').split('\n').filter(Boolean)).toHaveLength(1);
    });

    it.skipIf(!canRun)('does not ask for a ticket parked on CI', () => {
      run('feature/cod-5', [[parkedTicket('CI')]]);
      expect(read('copilot')).toBe('');
      expect(entry()).not.toHaveProperty('copilotAsked');
    });

    it.skipIf(!canRun)('does not ask for a ticket that is not parked', () => {
      run('feature/cod-5');
      expect(read('copilot')).toBe('');
    });
  });

  describe('merging on its own', () => {
    const readyTicket = {
      ...ticket,
      labels: { nodes: [{ name: 'agent:review' }] },
      comments: {
        nodes: [
          {
            body: '**Agent: PR ready**\n\nCode review: clean\nMerge: merging on its own: no hold path',
            createdAt: '2026-01-02T00:00:00Z'
          }
        ]
      }
    };
    const greenPr = (path = 'docs/guide.md') => ({
      id: 'PR_node',
      headRefOid: 'abc123',
      isDraft: false,
      mergeQueueEntry: null,
      commits: {
        nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }]
      },
      files: { pageInfo: { hasNextPage: false }, nodes: [{ path }] }
    });
    const entry = () => JSON.parse(read('watch.json'))['COD-5'];

    it.skipIf(!canRun)(
      'enqueues with the node id and head oid it read, and records it',
      () => {
        const result = run('feature/cod-5', [[readyTicket]], false, {
          pr: greenPr()
        });
        expect(result.stdout).toContain('rc=0');
        expect(read('act')).toBe('merge 754 PR_node abc123\n');
        expect(read('records')).toBe('auto-merge COD-5 PR 754 enqueued\n');
        expect(read('notices')).toBe('info COD-5: PR 754 merging on its own\n');
        expect(entry().autoMerge).toMatchObject({ tries: 1, oid: 'abc123' });
        expect(entry().autoMerge).not.toHaveProperty('failed');
      }
    );

    it.skipIf(!canRun)('does not enqueue a PR on a hold path', () => {
      run('feature/cod-5', [[readyTicket]], false, {
        pr: greenPr('libs/shared/util/csp/src/index.ts')
      });
      expect(read('act')).toBe('');
      expect(entry()).not.toHaveProperty('autoMerge');
    });

    it.skipIf(!canRun)('stores the failure and notices it', () => {
      writeFileSync(join(root, 'act-fail'), '');
      const result = run('feature/cod-5', [[readyTicket]], false, {
        pr: greenPr()
      });
      expect(result.stdout).toContain('rc=0');
      expect(read('act')).toBe('merge 754 PR_node abc123\n');
      expect(read('records')).toBe('');
      expect(read('notices')).toBe(
        'action COD-5: PR 754 could not join the merge queue: GitHub said no\n'
      );
      expect(entry().autoMerge).toMatchObject({
        failed: true,
        oid: 'abc123',
        // A refused enqueue is no try: the PR never joined the queue
        tries: 0
      });
    });

    it.skipIf(!canRun)('does not try the failed head again', () => {
      writeFileSync(join(root, 'act-fail'), '');
      run('feature/cod-5', [[readyTicket]], false, { pr: greenPr() });
      run('feature/cod-5', [[readyTicket]], false, { pr: greenPr() });
      expect(read('act').split('\n').filter(Boolean)).toHaveLength(1);
    });

    it.skipIf(!canRun)('enqueues nothing without a hold list', () => {
      const result = run('feature/cod-5', [[readyTicket]], false, {
        pr: greenPr(),
        noHolds: true
      });
      expect(result.stdout).toContain('rc=0');
      expect(read('act')).toBe('');
      expect(read('notes')).toContain('hold-paths.txt not read');
      expect(read('records')).toBe('warn  watch: hold-paths.txt not read\n');
      expect(entry()).not.toHaveProperty('autoMerge');
    });

    it.skipIf(!canRun)('stores the deploy the read prints', () => {
      writeFileSync(
        join(root, 'deploy'),
        '{"state":"success","run":"https://github.com/r/1","at":"2026-01-03T00:00:00Z"}'
      );
      run('feature/cod-5', [[readyTicket]], false, { pr: greenPr() });
      expect(entry().deploy).toEqual({
        state: 'success',
        run: 'https://github.com/r/1',
        at: '2026-01-03T00:00:00Z'
      });
    });
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

describe('run.sh read_deploy', () => {
  const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const cutFn = (name: string) =>
    SCRIPT.slice(
      SCRIPT.indexOf(`${name}() {`),
      SCRIPT.indexOf('\n}\n', SCRIPT.indexOf(`${name}() {`)) + 3
    );
  const source = [cutFn('deploy_warn'), cutFn('read_deploy')].join('\n');
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let root: string;
  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';
  const put = (name: string, value: unknown) =>
    writeFileSync(join(root, name), JSON.stringify(value));

  const merged = {
    pr: 754,
    state: 'merged',
    mergeCommit: 'cafe123',
    mergedAt: new Date(Date.now() - 600_000).toISOString(),
    autoMerge: { tries: 1 }
  };
  const run = (entry: unknown, runs: unknown[], notes: unknown[] = []) => {
    put('runs.json', { workflow_runs: runs });
    put('jobs.json', { jobs: [{ id: 11 }, { id: 12 }] });
    put('annotations.json', notes);
    const script = [
      `ROOT="${root}"; HOME_DIR="${root}"`,
      `note() { print -r -- "$*" >> "$ROOT/notes"; }`,
      `record() { print -r -- "$*" >> "$ROOT/records"; }`,
      `watch() { jq -L "${DIR}" "$@"; }`,
      'watch_err() { :; }',
      // Every read is logged; the answer is by URL, and gh-fail makes the run list fail
      'gh_read() { print -r -- "$3" >> "$ROOT/calls"; case "$3" in *workflows*) [[ -f "$ROOT/gh-fail" ]] && return 1; cat "$ROOT/runs.json" ;; */jobs\\?*) cat "$ROOT/jobs.json" ;; *) cat "$ROOT/annotations.json" ;; esac; }',
      source,
      `read_deploy '${JSON.stringify(entry)}' COD-5`
    ].join('\n');
    return spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
  };
  const newest = {
    id: 99,
    created_at: '2026-01-03T00:00:00Z',
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/codeware-sthlm/cdwr/actions/runs/99'
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'read-deploy-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('asks for push runs of the merge commit', () => {
    expect(source).toContain(
      'actions/workflows/fly-deployment.yml/runs?head_sha=$sha&event=push'
    );
  });

  it.skipIf(!canRun)(
    'reads success from a clean deploy of the newest run',
    () => {
      const r = run(merged, [
        {
          ...newest,
          id: 98,
          created_at: '2026-01-01T00:00:00Z',
          conclusion: 'failure'
        },
        newest
      ]);
      const deploy = JSON.parse(r.stdout);
      expect(deploy).toMatchObject({ state: 'success', run: newest.html_url });
      expect(deploy.at).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(read('calls').split('\n').filter(Boolean)).toEqual([
        'repos/codeware-sthlm/cdwr/actions/workflows/fly-deployment.yml/runs?head_sha=cafe123&event=push',
        'repos/codeware-sthlm/cdwr/actions/runs/99/jobs?per_page=100',
        'repos/codeware-sthlm/cdwr/check-runs/11/annotations',
        'repos/codeware-sthlm/cdwr/check-runs/12/annotations'
      ]);
      expect(read('watch-notes.jsonl')).toBe('');
    }
  );

  it.skipIf(!canRun)('reads skipped from the deploy guard’s warning', () => {
    const r = run(
      merged,
      [newest],
      [
        {
          annotation_level: 'warning',
          message: 'The commit is older than the deployed one'
        }
      ]
    );
    expect(JSON.parse(r.stdout).state).toBe('skipped');
  });

  it.skipIf(!canRun)('reads failure without reading the jobs', () => {
    const r = run(merged, [{ ...newest, conclusion: 'failure' }]);
    expect(JSON.parse(r.stdout).state).toBe('failure');
    expect(read('calls').split('\n').filter(Boolean)).toHaveLength(1);
  });

  it.skipIf(!canRun)('reads pending while the run is going or missing', () => {
    expect(
      JSON.parse(
        run(merged, [{ ...newest, status: 'in_progress', conclusion: null }])
          .stdout
      ).state
    ).toBe('pending');
    expect(JSON.parse(run(merged, []).stdout)).toMatchObject({
      state: 'pending',
      run: null
    });
  });

  it.skipIf(!canRun)(
    'prints nothing and warns once an hour when a read fails',
    () => {
      writeFileSync(join(root, 'gh-fail'), '');
      const r = run(merged, [newest]);
      expect(r.stdout).toBe('');
      expect(read('records')).toBe(
        'warn COD-5 watch: could not read the deploy\n'
      );
      // The next tick notes it again, but the warn row waits an hour
      run(merged, [newest]);
      expect(read('notes').split('\n').filter(Boolean)).toHaveLength(2);
      expect(read('records')).toBe(
        'warn COD-5 watch: could not read the deploy\n'
      );
    }
  );

  it.skipIf(!canRun).each([
    ['not merged on its own', { ...merged, autoMerge: undefined }],
    ['not merged', { ...merged, state: 'open' }],
    ['no merge commit', { ...merged, mergeCommit: null }],
    ['already settled', { ...merged, deploy: { state: 'success' } }]
  ])('reads nothing for an entry %s', (_name, entry) => {
    const r = run(entry, [newest]);
    expect(r.stdout).toBe('');
    expect(read('calls')).toBe('');
  });
});

describe('run.sh copilot_request', () => {
  const source = SCRIPT.slice(
    SCRIPT.indexOf('copilot_request() {'),
    SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('copilot_request() {')) + 3
  );
  const canRun = spawnSync('zsh', ['-c', 'true']).status === 0;

  // app: whether the app's token is there; token: Håkan's token, or none; added: the identity
  // whose request GitHub turns into a Copilot request
  // The calls go to a log, since copilot_request keeps the request's output as its reason
  const request = (app: boolean, token: string, added: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'copilot-request-'));
    const log = join(dir, 'log');
    const script = [
      `gh_identity() { ${app ? 'export GH_TOKEN=app; return 0' : 'return 1'}; }`,
      `copilot_token() { print -r -- "${token}"; }`,
      `gh() { print -r -- "gh \${GH_TOKEN:-login}" >> "${log}"; }`,
      `copilot_asked() { print -r -- "asked \${GH_TOKEN:-login}" >> "${log}"; [[ "\${GH_TOKEN:-}" == "${added}" ]]; }`,
      source,
      'out="$(copilot_request 42)"; print -r -- "rc=$? out=$out"'
    ].join('\n');
    const r = spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
    const calls = existsSync(log) ? readFileSync(log, 'utf8') : '';
    rmSync(dir, { recursive: true, force: true });
    return { stdout: r.stdout, calls };
  };

  it.skipIf(!canRun)('asks as the app and stops there when it worked', () => {
    const r = request(true, 'tok', 'app');
    expect(r.stdout).toBe('rc=0 out=\n');
    expect(r.calls).toBe('gh app\nasked app\n');
  });

  it.skipIf(!canRun)(
    'falls back on the token when the app adds no Copilot',
    () => {
      const r = request(true, 'tok', 'tok');
      expect(r.stdout).toBe('rc=0 out=\n');
      expect(r.calls).toBe('gh app\nasked app\ngh tok\nasked tok\n');
    }
  );

  it.skipIf(!canRun)('falls back on the token when there is no app', () => {
    const r = request(false, 'tok', 'tok');
    expect(r.stdout).toBe('rc=0 out=\n');
    expect(r.calls).toBe('gh tok\nasked tok\n');
  });

  it.skipIf(!canRun)(
    'gives a one-line reason whole, not its first letter',
    () => {
      const r = request(true, '', 'tok');
      expect(r.stdout).toBe(
        'rc=1 out=GitHub did not add Copilot as a reviewer\n'
      );
    }
  );

  it.skipIf(!canRun)('never asks as the signed-in user', () => {
    const r = request(false, '', 'login');
    expect(r.stdout).toBe('rc=1 out=no GitHub app\n');
    expect(r.calls).toBe('');
  });
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

  it('compares every queue file against main in the job line', () => {
    const loop = /for f in ([^;\n]+); do\n\s+theirs=/.exec(fn('job_line'))?.[1];
    expect(loop?.split(' ').sort()).toEqual([...QUEUE_FILES].sort());
  });

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
    'telemetry.sh',
    'deploy-gate.sh',
    'linear-tools.txt',
    'hold-paths.txt'
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

describe('run.sh audit', () => {
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';

  it('adds the audit and the tree to the view, and keeps the view when they fail', () => {
    expect(SCRIPT).toContain(
      'audit($now; $watch; $launch; $runnable; $wide[0])'
    );
    expect(SCRIPT).toContain('tree($now; $watch; $gaps[0]; $order; $wide[0])');
    expect(SCRIPT).toContain(
      'warn: audit: watch.jq failed$carried$(watch_err)'
    );
    expect(SCRIPT).toContain('kept the previous audit and tree');
    expect(SCRIPT).toContain('audit_notices "$queue_view"');
  });

  describe.skipIf(!hasZsh)('tree_wide', () => {
    let home: string;
    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'tree-wide-'));
    });
    afterEach(() => rmSync(home, { recursive: true, force: true }));

    const cached = JSON.stringify({
      nodes: [{ identifier: 'COD-1' }],
      truncated: false
    });
    const fresh = JSON.stringify({
      nodes: [{ identifier: 'COD-2' }],
      truncated: false
    });
    // tree_nodes records each call; `ttl` is AGENT_QUEUE_TREE_TTL_MIN
    const run = (opts: {
      file?: string;
      ageMin?: number;
      read: 'ok' | 'fail';
      ttl?: string;
    }) => {
      const f = join(home, 'tree-nodes.json');
      if (opts.file) {
        writeFileSync(f, opts.file);
        const t = new Date(Date.now() - (opts.ageMin ?? 0) * 60000);
        utimesSync(f, t, t);
      }
      const script = [
        'set -uo pipefail',
        `HOME_DIR="${home}"`,
        ...(opts.ttl ? [`AGENT_QUEUE_TREE_TTL_MIN=${opts.ttl}`] : []),
        `tree_nodes() { print x >> "${home}/calls"; ${opts.read === 'ok' ? `print -r -- '${fresh}'` : 'return 1'}; }`,
        fn('tree_wide'),
        'tree_wide'
      ].join('\n');
      const res = spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
      let calls = 0;
      try {
        calls = readFileSync(join(home, 'calls'), 'utf8')
          .split('\n')
          .filter(Boolean).length;
      } catch {
        /* no read */
      }
      return { status: res.status, out: res.stdout.trim(), calls };
    };

    it('reuses a file younger than the TTL without reading Linear', () => {
      expect(run({ file: cached, ageMin: 5, read: 'ok' })).toEqual({
        status: 0,
        out: cached,
        calls: 0
      });
    });

    it('reads again past the TTL, and stores the answer', () => {
      const r = run({ file: cached, ageMin: 30, read: 'ok' });
      expect(r).toEqual({ status: 0, out: fresh, calls: 1 });
      expect(readFileSync(join(home, 'tree-nodes.json'), 'utf8').trim()).toBe(
        fresh
      );
    });

    it('reads every time with a TTL of 0', () => {
      expect(run({ file: cached, ageMin: 0, read: 'ok', ttl: '0' }).calls).toBe(
        1
      );
    });

    it('falls back on an old file when the read fails, and fails without one', () => {
      expect(run({ file: cached, ageMin: 600, read: 'fail' })).toEqual({
        status: 0,
        out: cached,
        calls: 1
      });
    });

    it('fails when the read fails and there is no file', () => {
      expect(run({ read: 'fail' }).status).toBe(1);
    });
  });

  it('notifies after the --check path returns', () => {
    const check = SCRIPT.indexOf('print -r -- "queue-view: $queue_view"');
    expect(SCRIPT.indexOf('audit_notices "$queue_view"')).toBeGreaterThan(
      check
    );
  });

  describe.skipIf(!hasZsh)('audit_notices', () => {
    let home: string;
    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'audit-notices-'));
    });
    afterEach(() => rmSync(home, { recursive: true, force: true }));

    const gap = (n: number) => ({
      id: `COD-${n}:label-on-closed`,
      ticket: `COD-${n}`,
      kind: 'label-on-closed',
      what: `COD-${n} is Done but still agent:ready`,
      fix: 'Remove the label'
    });

    // Runs the function with a notice that records its arguments; returns them and the seen file
    const run = (audit: unknown, seen?: Record<string, unknown>) => {
      if (seen)
        writeFileSync(join(home, 'audit-seen.json'), JSON.stringify(seen));
      const script = [
        'set -uo pipefail',
        `HOME_DIR="${home}"`,
        `notice() { print -r -- "$1|$2" >> "${home}/notices"; }`,
        fn('audit_notices'),
        `audit_notices '${JSON.stringify(audit === undefined ? {} : { audit })}'`
      ].join('\n');
      const res = spawnSync('zsh', ['-c', script], { encoding: 'utf8' });
      expect(res.status).toBe(0);
      const read = (f: string) => {
        try {
          return readFileSync(join(home, f), 'utf8');
        } catch {
          return null;
        }
      };
      return {
        notices: (read('notices') ?? '').split('\n').filter(Boolean),
        seen: JSON.parse(read('audit-seen.json') ?? 'null') as Record<
          string,
          { first: string; told: boolean }
        > | null
      };
    };

    const ago = (seconds: number) =>
      new Date(Date.now() - seconds * 1000)
        .toISOString()
        .replace(/\.\d+Z$/, 'Z');
    const stood = (seconds: number, told = false) => ({
      first: ago(seconds),
      told
    });
    const A = 'COD-1:label-on-closed';
    const B = 'COD-2:label-on-closed';

    it('records a new gap without a notice', () => {
      const r = run([gap(1), gap(2)]);
      expect(r.notices).toEqual([]);
      expect(r.seen).toMatchObject({
        [A]: { told: false },
        [B]: { told: false }
      });
    });

    it('notifies a gap that has stood for 15 minutes, once', () => {
      const first = run([gap(1), gap(2)], { [A]: stood(901), [B]: stood(300) });
      expect(first.notices).toEqual([
        'action|Gap: COD-1 is Done but still agent:ready. Remove the label'
      ]);
      expect(first.seen?.[A]?.told).toBe(true);
      expect(first.seen?.[B]?.told).toBe(false);
      const again = run([gap(1), gap(2)]);
      // The notices file accumulates: still the one from the first run
      expect(again.notices).toEqual(first.notices);
    });

    it('records and tells nothing for a candidate gap', () => {
      const cand = { ...gap(3), id: 'COD-3:untouched', candidate: true };
      const r = run([cand, gap(1)], {
        'COD-3:untouched': stood(3600),
        [A]: stood(901)
      });
      expect(r.notices).toEqual([
        'action|Gap: COD-1 is Done but still agent:ready. Remove the label'
      ]);
      expect(Object.keys(r.seen ?? {})).toEqual([A]);
    });

    it('reads an old string value as told, keeping its first time', () => {
      const first = '2026-11-01T00:00:00Z';
      const r = run([gap(1)], { [A]: first });
      expect(r.notices).toEqual([]);
      expect(r.seen?.[A]).toEqual({ first, told: true });
    });

    it('forgets a gap that closed, so its return starts over', () => {
      const gone = run([gap(2)], {
        [A]: stood(3600, true),
        [B]: stood(3600, true)
      });
      expect(Object.keys(gone.seen ?? {})).toEqual([B]);
      const back = run([gap(1), gap(2)]);
      expect(back.notices).toEqual([]);
      expect(back.seen?.[A]?.told).toBe(false);
    });

    it('sends one summary for more than 3 due gaps and marks them all told', () => {
      const seen = Object.fromEntries(
        [1, 2, 3, 4, 5].map((n) => [`COD-${n}:label-on-closed`, stood(3600)])
      );
      const r = run([1, 2, 3, 4, 5].map(gap), seen);
      expect(r.notices).toEqual([
        'action|Agent queue: 5 new gaps, e.g. COD-1 is Done but still agent:ready. See cdwr agent status or the desk.'
      ]);
      expect(Object.values(r.seen ?? {}).every((v) => v.told)).toBe(true);
    });

    it('sends each of up to 3 due gaps on its own', () => {
      const seen = Object.fromEntries(
        [1, 2, 3].map((n) => [`COD-${n}:label-on-closed`, stood(3600)])
      );
      expect(run([1, 2, 3].map(gap), seen).notices).toHaveLength(3);
    });

    it('leaves the seen file alone for a view without an audit', () => {
      const seen = { [A]: stood(3600) };
      const r = run(undefined, seen);
      expect(r.notices).toEqual([]);
      expect(r.seen).toEqual(seen);
    });
  });
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
    env?: Record<string, string>;
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
      fn('run_lock_live'),
      fn('apply_commands'),
      'apply_commands'
    ].join('\n');
    const result = spawnSync('zsh', ['-c', script], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', HOME: home, ...opts.env }
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
    const call = SCRIPT.indexOf('\n$platform || apply_commands\n');
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

  it.skipIf(!canRun)(
    'requests a review with a file for the next idle tick',
    () => {
      const r = apply([{ id: 1, kind: 'review' }]);
      expect(statuses(r)).toEqual([['applied', null]]);
      expect(changes(r)).toEqual(['review requested from the desk (mac)']);
      expect(file('review-requested')).toBe('');
    }
  );

  it.skipIf(!canRun)(
    'accepts a review when the last one ran over an hour ago',
    () => {
      const ranAt = String(Math.floor(Date.now() / 1000) - 2 * 3600);
      const r = apply([{ id: 1, kind: 'review' }], {
        files: { 'review-ran-at': `${ranAt}\n` }
      });
      expect(statuses(r)).toEqual([['applied', null]]);
      expect(file('review-requested')).toBe('');
    }
  );

  it.skipIf(!canRun)('refuses a review within an hour of the last', () => {
    const ranAt = Math.floor(Date.now() / 1000) - 1800;
    const r = apply([{ id: 1, kind: 'review' }], {
      files: { 'review-ran-at': `${ranAt}\n` }
    });
    expect(statuses(r)).toEqual([
      ['refused', expect.stringMatching(/^a review ran at \d\d:\d\d$/)]
    ]);
    expect(changes(r)[0]).toMatch(
      /^review refused from the desk \(mac\): a review ran at \d\d:\d\d$/
    );
    expect(file('review-requested')).toBeNull();
  });

  it.skipIf(!canRun)('notes a review that is already requested', () => {
    const r = apply([{ id: 1, kind: 'review' }], {
      files: { 'review-requested': '' }
    });
    expect(statuses(r)).toEqual([['applied', 'already requested']]);
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

  describe('restart and gate', () => {
    const AQ = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
    const TOKEN = 'Zk3pQ9xLm2Vb7Nc4Rt8Wy6Hd';
    const CALL = 'tools/cdwr/bin/cdwr.mjs';
    const restart = { tenant: 'acme', app: 'cdwr-cms-acme', sha: 'abc1234' };
    const close = { tenant: 'acme', action: 'close' };
    const restartDry = {
      ok: true,
      command: 'fly restart',
      dryRun: true,
      plan: {
        steps: [],
        json: {
          app: 'cdwr-cms-acme',
          environment: 'production',
          machines: [{ id: 'm1', state: 'started', sha: 'abc1234def5678' }]
        }
      }
    };
    const gateDry = (onFly: string, inInfisical: boolean) => ({
      ok: true,
      command: 'tenant gate',
      dryRun: true,
      plan: {
        steps: [],
        json: {
          tenant: 'acme',
          environment: 'production',
          apps: [{ app: 'cms', flyApp: 'cdwr-cms-acme', inInfisical, onFly }]
        }
      }
    });

    // The real check, act and argv, with a stub node standing in for cdwr
    const setup = (
      dry: unknown,
      real: unknown = { ok: true },
      rc = 0,
      creds = true
    ) => {
      const bin = join(home, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, 'node'),
        [
          '#!/bin/sh',
          `echo "$*" >> "${home}/node.calls"`,
          'case "$*" in',
          `  *--dry-run*) env > "${home}/node.dry.env"; cat "${home}/dry.json" ;;`,
          '  *)',
          `    if [ -f "${home}/t-patch" ]; then echo after-ack >> "${home}/node.order"; else echo before-ack >> "${home}/node.order"; fi`,
          `    env > "${home}/node.env"; cat "${home}/real.json"; exit ${rc} ;;`,
          'esac'
        ].join('\n')
      );
      chmodSync(join(bin, 'node'), 0o755);
      writeFileSync(join(home, 'dry.json'), JSON.stringify(dry));
      writeFileSync(join(home, 'real.json'), JSON.stringify(real));
      return {
        env: { PATH: `${bin}:${process.env['PATH'] ?? ''}` },
        stubs: [
          `LOGS="${home}"; WATCH_DIR="${AQ}"; REPO="${home}"`,
          ...(creds
            ? [
                // plain shell variables, as unexported_env leaves them
                'typeset +x DESK_FLY_TOKEN=fly-desk DESK_INFISICAL_CLIENT_ID=inf-id DESK_INFISICAL_CLIENT_SECRET=inf-secret DESK_INFISICAL_PROJECT_ID=inf-proj'
              ]
            : []),
          ...[
            'desk_platform_on',
            'desk_cdwr',
            'desk_platform_argv',
            'desk_platform_check',
            'desk_platform_act',
            'watch',
            'watch_err'
          ].map(fn)
        ]
      };
    };
    const calls = () => (file('node.calls') ?? '').split('\n').filter(Boolean);
    const everything = (r: ReturnType<typeof apply>) =>
      JSON.stringify([r.patches, r.upserts, r.notes, r.says, r.stderr]);

    it.skipIf(!canRun)('refuses without the write credentials', () => {
      const r = apply(
        [{ id: 1, kind: 'restart', args: restart }],
        setup(restartDry, undefined, 0, false)
      );
      expect(statuses(r)).toEqual([['refused', 'no write credentials on nuc']]);
      expect(calls()).toEqual([]);
    });

    it.skipIf(!canRun)(
      'dry runs, acks, then restarts with the desk credentials alone',
      () => {
        const r = apply(
          [{ id: 1, kind: 'restart', args: restart }],
          setup(restartDry)
        );
        expect(statuses(r)).toEqual([['applied', null]]);
        expect(calls()).toEqual([
          `${CALL} fly restart cdwr-cms-acme --dry-run --yes --json`,
          `${CALL} fly restart cdwr-cms-acme --yes --json`
        ]);
        expect(file('node.order')).toBe('after-ack');
        expect(changes(r)).toEqual([
          'restarted cdwr-cms-acme from the desk (mac)'
        ]);
        for (const name of ['node.dry.env', 'node.env']) {
          const env = file(name) ?? '';
          expect(env).toMatch(/^FLY_API_TOKEN=fly-desk$/m);
          expect(env).toMatch(/^FLY_ACCESS_TOKEN=fly-desk$/m);
          expect(env).toMatch(/^INFISICAL_CLIENT_ID=inf-id$/m);
          expect(env).toMatch(/^INFISICAL_CLIENT_SECRET=inf-secret$/m);
          expect(env).toMatch(/^INFISICAL_PROJECT_ID=inf-proj$/m);
          expect(env).toMatch(/^INFISICAL_SERVICE_TOKEN=$/m);
          expect(env).not.toContain('DESK_');
        }
      }
    );

    it.skipIf(!canRun)('closes a site with a generated password', () => {
      const r = apply(
        [{ id: 1, kind: 'gate', args: close }],
        setup(gateDry('missing', false))
      );
      expect(statuses(r)).toEqual([['applied', null]]);
      expect(calls()).toEqual([
        `${CALL} tenant gate close --env production --tenant acme --generate --dry-run --yes --json`,
        `${CALL} tenant gate close --env production --tenant acme --generate --yes --json`
      ]);
      expect(changes(r)).toEqual(['site closed for acme from the desk (mac)']);
    });

    it.skipIf(!canRun)('opens a site without generating anything', () => {
      const r = apply(
        [{ id: 1, kind: 'gate', args: { tenant: 'acme', action: 'open' } }],
        setup(gateDry('set', true))
      );
      expect(statuses(r)).toEqual([['applied', null]]);
      expect(calls()[1]).toBe(
        `${CALL} tenant gate open --env production --tenant acme --yes --json`
      );
      expect(changes(r)).toEqual(['site opened for acme from the desk (mac)']);
    });

    it.skipIf(!canRun)(
      'refuses on the verdict and never runs the real command',
      () => {
        const r = apply(
          [{ id: 1, kind: 'gate', args: close }],
          setup(gateDry('set', true))
        );
        expect(statuses(r)).toEqual([['refused', 'already closed']]);
        expect(calls()).toHaveLength(1);
        expect(calls()[0]).toContain('--dry-run');
        expect(changes(r)).toEqual([
          'gate refused from the desk (mac): already closed'
        ]);
      }
    );

    it.skipIf(!canRun)('refuses a restart whose sha has moved on', () => {
      const r = apply(
        [{ id: 1, kind: 'restart', args: { ...restart, sha: '1111111' } }],
        setup(restartDry)
      );
      expect(statuses(r)).toEqual([
        ['refused', 'cdwr-cms-acme runs abc1234 now, not 1111111']
      ]);
      expect(calls()).toHaveLength(1);
    });

    it.skipIf(!canRun)(
      'refuses args that would not make a command line',
      () => {
        const r = apply(
          [
            {
              id: 1,
              kind: 'restart',
              args: { ...restart, app: 'cdwr-cms-acme; rm -rf /' }
            }
          ],
          setup(restartDry)
        );
        expect(statuses(r)).toEqual([['refused', 'bad args']]);
        expect(calls()).toEqual([]);
      }
    );

    it.skipIf(!canRun)(
      'turns an acked row refused when the command fails',
      () => {
        const r = apply(
          [{ id: 1, kind: 'restart', args: restart }],
          setup(restartDry, { ok: false, error: { message: 'fly is down' } }, 1)
        );
        expect(r.patches.map((p) => [p.query, p.body['status']])).toEqual([
          ['id=eq.1&status=eq.pending', 'applied'],
          ['id=eq.1', 'refused']
        ]);
        expect(r.patches[1]?.body['note']).toBe('fly is down');
        expect(changes(r)).toEqual([
          'restart refused from the desk (mac): fly is down'
        ]);
      }
    );

    it.skipIf(!canRun)(
      'keeps the generated password out of a failed close',
      () => {
        const r = apply(
          [{ id: 1, kind: 'gate', args: close }],
          setup(
            gateDry('missing', false),
            {
              ok: false,
              error: {
                message: `could not set SITE_GATE_PASSWORD=Abc${TOKEN} on cdwr-cms-acme`
              },
              password: TOKEN
            },
            1
          )
        );
        expect(r.patches[1]?.body['status']).toBe('refused');
        expect(String(r.patches[1]?.body['note']).trim()).toBe('could not set');
        const all = everything(r);
        expect(all).not.toContain(TOKEN);
        expect(all).not.toContain('SITE_GATE_PASSWORD=');
      }
    );

    it.skipIf(!canRun)(
      'strips a bare token from a failed close message',
      () => {
        const r = apply(
          [{ id: 1, kind: 'gate', args: close }],
          setup(
            gateDry('missing', false),
            { ok: false, error: { message: `failed with ${TOKEN} given` } },
            1
          )
        );
        expect(r.patches[1]?.body['status']).toBe('refused');
        expect(everything(r)).not.toContain(TOKEN);
      }
    );

    const partial = (reason?: string) => ({
      ok: false,
      command: 'tenant gate',
      result: {
        summary: 'acme in production is only partly open',
        tenant: 'acme',
        failed: [],
        ...(reason ? { reason } : {})
      }
    });

    it.skipIf(!canRun)(
      'refuses a partial gate with the app it could not read',
      () => {
        const r = apply(
          [{ id: 1, kind: 'gate', args: { tenant: 'acme', action: 'open' } }],
          setup(
            gateDry('set', true),
            // 23 characters with a digit, past the password-shaped run length
            partial(
              'cdwr-headless-codeware2 not read on Fly: Error: unauthorized'
            ),
            1
          )
        );
        expect(r.patches[1]?.body['status']).toBe('refused');
        expect(r.patches[1]?.body['note']).toBe(
          'cdwr-headless-codeware2 not read on Fly: Error: unauthorized'
        );
      }
    );

    it.skipIf(!canRun)('replaces the password itself in the reason', () => {
      // A generated password can be all lowercase, so no shape gives it away
      const lower = 'qwertyuiopasdfghjklzxcvb';
      const r = apply(
        [{ id: 1, kind: 'gate', args: close }],
        setup(
          gateDry('missing', false),
          {
            ok: false,
            result: {
              password: lower,
              reason: `cdwr-cms-acme not read on Fly: Error: ${lower}`
            }
          },
          1
        )
      );
      expect(r.patches[1]?.body['note']).toBe(
        'cdwr-cms-acme not read on Fly: Error: …'
      );
      expect(everything(r)).not.toContain(lower);
    });

    it.skipIf(!canRun)(
      'falls back to the generic text without a reason',
      () => {
        const r = apply(
          [{ id: 1, kind: 'gate', args: { tenant: 'acme', action: 'open' } }],
          setup(gateDry('set', true), partial(), 1)
        );
        expect(r.patches[1]?.body['note']).toBe(
          'only partly applied, see cdwr history on the host'
        );
      }
    );
  });
});

// The apply list: the items of a merged PR's hand-off comment that the scheduler applies itself
describe('run.sh apply list', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const AQ = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  const SHA = 'a'.repeat(40);
  const TAG = `sha-${'b'.repeat(40)}`;
  const MIGRATION =
    'tools/cdwr/agent-queue/supabase/migrations/20261120120000_applied_migrations.sql';
  let home: string;

  // apply_app is a one-line function
  const APPLY_APP = SCRIPT.match(/^apply_app\(\) \{.*\}$/m)?.[0] ?? '';
  const FNS = [
    'apply_argv',
    'apply_cdwr',
    'apply_deploy_state',
    'apply_self_deploy',
    'apply_item',
    'apply_tick',
    'apply_list',
    'desk_cdwr',
    'desk_platform_on',
    'watch',
    'watch_err'
  ]
    .map(fn)
    .concat(APPLY_APP);

  const write = (name: string, content: string, mode?: number) => {
    mkdirSync(join(home, name, '..'), { recursive: true });
    writeFileSync(join(home, name), content);
    if (mode) chmodSync(join(home, name), mode);
  };
  const file = (name: string) =>
    existsSync(join(home, name))
      ? readFileSync(join(home, name), 'utf8').trim()
      : null;
  const lines = (name: string) =>
    (file(name) ?? '').split('\n').filter(Boolean);

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'apply-list-'));
    write(
      'nx.json',
      JSON.stringify({ release: { groups: { apps: { projects: ['cms'] } } } })
    );
    mkdirSync(
      join(home, 'tools/cdwr/agent-queue/supabase/functions/desk-notify'),
      { recursive: true }
    );
    mkdirSync(join(home, 'tools/cdwr/agent-queue/supabase/functions/_shared'), {
      recursive: true
    });
    // Fakes for cdwr (node) and git; their answers are files in the temp home
    write(
      'bin/node',
      [
        '#!/bin/sh',
        `echo "$*" >> "${home}/node.calls"`,
        'case "$*" in',
        `  *--dry-run*) cat "${home}/dry.json" ;;`,
        `  *) cat "${home}/real.json"; exit $(cat "${home}/node.rc") ;;`,
        'esac'
      ].join('\n'),
      0o755
    );
    write(
      'bin/git',
      [
        '#!/bin/sh',
        'case "$*" in',
        `  *"diff --quiet"*) exit $(cat "${home}/git.diff.rc") ;;`,
        `  *" HEAD") exit $(cat "${home}/git.head.rc") ;;`,
        `  *) exit $(cat "${home}/git.tag.rc") ;;`,
        'esac'
      ].join('\n'),
      0o755
    );
    write('dry.json', '{}');
    write('real.json', '{}');
    write('node.rc', '0');
    write('git.head.rc', '0');
    write('git.tag.rc', '0');
    write('git.diff.rc', '0');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const run = (
    body: string[],
    env: Record<string, string> = {},
    stubs: string[] = []
  ) =>
    spawnSync(
      'zsh',
      [
        '-c',
        [
          `HOME_DIR="${home}"; REPO="${home}"; LOGS="${home}"; WATCH_DIR="${AQ}"; APPLY_WAIT_SECS=10800`,
          'telemetry_host() { print -r -- nuc; }',
          ...FNS,
          ...stubs,
          ...body
        ].join('\n')
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: `${join(home, 'bin')}:${process.env['PATH'] ?? ''}`,
          HOME: home,
          ...env
        }
      }
    );

  const item = (
    kind: string,
    args: string[],
    extra: Record<string, unknown> = {}
  ) => ({
    spec: [kind, ...args].join(' '),
    kind,
    args,
    afterDeploy: false,
    status: 'pending',
    ...extra
  });

  describe('apply_argv', () => {
    const argv = (kind: string, args: (string | number)[]) => {
      const r = run(
        ['apply_argv "$ITEM"; print -r -- "rc=$?"'],
        { ITEM: JSON.stringify({ kind, args }) },
        []
      );
      const out = r.stdout.trimEnd().split('\n');
      return { rc: out.pop(), out };
    };

    it.skipIf(!canRun).each([
      ['restart', ['cdwr-cms'], ['fly', 'restart', 'cdwr-cms']],
      [
        'restart',
        ['cdwr-headless-moon'],
        ['fly', 'restart', 'cdwr-headless-moon']
      ],
      ['restart', ['cdwr-cms-acme'], ['fly', 'restart', 'cdwr-cms-acme']],
      [
        'scale',
        ['cdwr-headless-moon', '2'],
        ['fly', 'scale', 'cdwr-headless-moon', '2']
      ],
      [
        'deploy-workflow',
        ['cms', 'production'],
        ['fly', 'deploy', 'cms', '--env', 'production']
      ],
      [
        'supabase-migration',
        [MIGRATION],
        ['agent', 'supabase-migrate', MIGRATION]
      ],
      ['supabase-function', ['desk-notify'], []],
      ['agent-deploy', [], []]
    ])('prints the argv of %s %j', (kind, args, expected) => {
      const r = argv(kind, args);
      expect(r.rc).toBe('rc=0');
      expect(r.out).toEqual(expected);
    });

    it.skipIf(!canRun).each([
      ['restart', ['cdwr-agent']],
      ['restart', ['cdwr-builder']],
      ['restart', ['cdwr-cms;rm']],
      ['restart', ['-a']],
      ['restart', []],
      ['restart', ['cdwr-cms', 'extra']],
      ['scale', ['cdwr-cms', '0']],
      ['scale', ['cdwr-cms', '5']],
      ['scale', ['cdwr-cms']],
      ['scale', ['cdwr-agent', '2']],
      ['deploy-workflow', ['web', 'production']],
      ['deploy-workflow', ['cms', 'preview']],
      ['deploy-workflow', ['cms']],
      [
        'supabase-migration',
        ['tools/cdwr/agent-queue/other/20261120120000_x.sql']
      ],
      [
        'supabase-migration',
        ['tools/cdwr/agent-queue/supabase/migrations/../20261120120000_x.sql']
      ],
      [
        'supabase-migration',
        ['tools/cdwr/agent-queue/supabase/migrations/2026_x.sql']
      ],
      ['supabase-migration', []],
      ['supabase-function', ['_shared']],
      ['supabase-function', ['missing']],
      ['supabase-function', []],
      ['agent-deploy', ['x']],
      ['frobnicate', []]
    ])('refuses %s %j', (kind, args) => {
      const r = argv(kind, args);
      expect(r.rc).toBe('rc=1');
      expect(r.out).toEqual([]);
    });
  });

  describe('apply_item', () => {
    const restartDry = {
      ok: true,
      plan: {
        json: {
          app: 'cdwr-cms',
          environment: 'production',
          machines: [{ id: 'm1', state: 'started', sha: 'abc' }]
        }
      }
    };
    const entry = (at = new Date().toISOString()) =>
      JSON.stringify({ apply: { sha: SHA, at } });
    const CREDS =
      'typeset +x DESK_FLY_TOKEN=fly-desk DESK_INFISICAL_CLIENT_ID=i DESK_INFISICAL_CLIENT_SECRET=s DESK_INFISICAL_PROJECT_ID=p';

    const apply = (
      it_: Record<string, unknown>,
      opts: {
        entry?: string;
        creds?: boolean;
        deployState?: string;
        env?: Record<string, string>;
      } = {}
    ) => {
      const r = run(
        ['res="$(apply_item "$ENTRY" "$ITEM")"; print -r -- "$res"'],
        {
          ENTRY: opts.entry ?? entry(),
          ITEM: JSON.stringify(it_),
          ...opts.env
        },
        [
          ...(opts.creds === false ? [] : [CREDS]),
          ...(opts.deployState
            ? [`apply_deploy_state() { print -r -- ${opts.deployState}; }`]
            : [])
        ]
      );
      return r.stdout.trim();
    };
    const nodeCalls = () => lines('node.calls');
    const restart = item('restart', ['cdwr-cms']);

    it.skipIf(!canRun)('waits while the checkout lacks the merge', () => {
      write('git.head.rc', '1');
      write('dry.json', JSON.stringify(restartDry));
      expect(apply(restart)).toBe('wait');
      expect(nodeCalls()).toEqual([]);
    });

    it.skipIf(!canRun).each([
      ['null', JSON.stringify({ apply: { sha: null } })],
      ['short', JSON.stringify({ apply: { sha: 'abc1234' } })],
      ['missing', JSON.stringify({ apply: {} })]
    ])('refuses without a merge commit sha (%s)', (_n, e) => {
      expect(apply(restart, { entry: e })).toBe('refused no merge commit');
    });

    it.skipIf(!canRun)('applies a restart after an ok dry run', () => {
      write('dry.json', JSON.stringify(restartDry));
      write('real.json', JSON.stringify({ ok: true, result: { app: 'x' } }));
      expect(apply(restart)).toMatch(/^applied \d{4}-\d\d-\d\dT\d\d:\d\dZ$/);
      expect(nodeCalls()).toEqual([
        'tools/cdwr/bin/cdwr.mjs fly restart cdwr-cms --dry-run --yes --json',
        'tools/cdwr/bin/cdwr.mjs fly restart cdwr-cms --yes --json'
      ]);
    });

    it.skipIf(!canRun)('says already when the scale is at its target', () => {
      write(
        'dry.json',
        JSON.stringify({
          ok: true,
          plan: {
            json: {
              app: 'cdwr-cms',
              environment: 'production',
              count: 2,
              target: 2
            }
          }
        })
      );
      expect(apply(item('scale', ['cdwr-cms', '2']))).toBe('applied already 2');
      expect(nodeCalls()).toHaveLength(1);
      expect(nodeCalls()[0]).toContain('--dry-run');
    });

    it.skipIf(!canRun)('scales when the count differs', () => {
      write(
        'dry.json',
        JSON.stringify({
          ok: true,
          plan: {
            json: {
              app: 'cdwr-cms',
              environment: 'production',
              count: 1,
              target: 2
            }
          }
        })
      );
      write('real.json', JSON.stringify({ ok: true, result: { count: 2 } }));
      expect(apply(item('scale', ['cdwr-cms', '2']))).toMatch(/^applied 20/);
      expect(nodeCalls()).toHaveLength(2);
    });

    it.skipIf(!canRun)('refuses on the dry run verdict, no real call', () => {
      write(
        'dry.json',
        JSON.stringify({ ok: false, error: { message: 'no such app' } })
      );
      expect(apply(restart)).toBe('refused the dry run failed: no such app');
      expect(nodeCalls()).toHaveLength(1);
    });

    it.skipIf(!canRun)('refuses when the dry run prints nothing', () => {
      write('bin/node', '#!/bin/sh\nexit 1', 0o755);
      expect(apply(restart)).toBe('refused the dry run printed nothing');
    });

    it.skipIf(!canRun)('refuses with the message of a failing call', () => {
      write('dry.json', JSON.stringify(restartDry));
      write(
        'real.json',
        JSON.stringify({ ok: false, error: { message: 'fly · is\ndown' } })
      );
      write('node.rc', '1');
      expect(apply(restart)).toBe('refused fly - is down');
    });

    it.skipIf(!canRun)('refuses with cdwr failed without a message', () => {
      write('dry.json', JSON.stringify(restartDry));
      write('real.json', '{"ok":false}');
      write('node.rc', '1');
      expect(apply(restart)).toBe('refused cdwr failed');
    });

    it.skipIf(!canRun)('refuses without the desk Fly token', () => {
      write('dry.json', JSON.stringify(restartDry));
      expect(apply(restart, { creds: false })).toBe(
        'refused no DESK_FLY_TOKEN on nuc'
      );
      expect(nodeCalls()).toEqual([]);
    });

    it.skipIf(!canRun)('restarts with the Fly token alone', () => {
      write('dry.json', JSON.stringify(restartDry));
      write('real.json', '{"ok":true}');
      const r = run(
        ['res="$(apply_item "$ENTRY" "$ITEM")"; print -r -- "$res"'],
        { ENTRY: entry(), ITEM: JSON.stringify(restart) },
        ['typeset +x DESK_FLY_TOKEN=fly-desk']
      );
      expect(r.stdout.trim()).toMatch(/^applied /);
    });

    it.skipIf(!canRun)('refuses a migration without a database url', () => {
      expect(apply(item('supabase-migration', [MIGRATION]))).toBe(
        'refused no DESK_SUPABASE_DB_URL on nuc'
      );
    });

    it.skipIf(!canRun)(
      'refuses a migration whose file changed after the merge',
      () => {
        write('git.diff.rc', '1');
        const r = run(
          ['res="$(apply_item "$ENTRY" "$ITEM")"; print -r -- "$res"'],
          {
            ENTRY: entry(),
            ITEM: JSON.stringify(item('supabase-migration', [MIGRATION]))
          },
          ['typeset +x DESK_SUPABASE_DB_URL=postgres://x']
        );
        expect(r.stdout.trim()).toBe(
          'refused the file changed after the merge'
        );
        expect(nodeCalls()).toEqual([]);
      }
    );

    it.skipIf(!canRun)('refuses supabase-function as not enabled', () => {
      expect(apply(item('supabase-function', ['desk-notify']))).toBe(
        'refused not enabled'
      );
    });

    describe('agent-deploy', () => {
      const deploy = item('agent-deploy', []);

      it.skipIf(!canRun)('refuses without deploy.json', () => {
        expect(apply(deploy)).toBe('refused no self-deploy on this host');
      });

      it.skipIf(!canRun)('applies once the tag contains the merge', () => {
        write('deploy.json', JSON.stringify({ phase: 'ok', tag: TAG }));
        expect(apply(deploy)).toBe(`applied deployed ${TAG}`);
      });

      it.skipIf(!canRun)('waits while the tag lacks the merge', () => {
        write('deploy.json', JSON.stringify({ phase: 'ok', tag: TAG }));
        write('git.tag.rc', '1');
        expect(apply(deploy)).toBe('wait');
      });

      it.skipIf(!canRun)('waits for a tag that is not a sha', () => {
        write('deploy.json', JSON.stringify({ phase: 'ok', tag: 'latest' }));
        expect(apply(deploy)).toBe('wait');
      });

      it.skipIf(!canRun)('refuses a failed roll-out', () => {
        write('deploy.json', JSON.stringify({ phase: 'stuck', tag: TAG }));
        expect(apply(deploy)).toBe(`refused self-deploy of ${TAG}: stuck`);
      });

      it.skipIf(!canRun)('refuses after the wait limit', () => {
        write('deploy.json', JSON.stringify({ phase: 'ok', tag: TAG }));
        write('git.tag.rc', '1');
        const old = new Date(Date.now() - 4 * 3600_000).toISOString();
        expect(apply(deploy, { entry: entry(old) })).toBe(
          'refused no self-deploy within 3 hours'
        );
      });
    });

    describe('after-deploy', () => {
      const scale = item('scale', ['cdwr-cms', '2'], { afterDeploy: true });

      it.skipIf(!canRun)('waits on wait', () => {
        expect(apply(scale, { deployState: 'wait' })).toBe('wait');
        expect(nodeCalls()).toEqual([]);
      });

      it.skipIf(!canRun)('refuses on failed', () => {
        expect(apply(scale, { deployState: 'failed' })).toBe(
          'refused production deploy failed'
        );
      });

      it.skipIf(!canRun)('refuses a deploy that never came', () => {
        const old = new Date(Date.now() - 4 * 3600_000).toISOString();
        expect(apply(scale, { deployState: 'wait', entry: entry(old) })).toBe(
          'refused no production deploy within 3 hours'
        );
      });

      it.skipIf(!canRun)('goes on once the deploy is ok', () => {
        write(
          'dry.json',
          JSON.stringify({
            ok: true,
            plan: {
              json: {
                app: 'cdwr-cms',
                environment: 'production',
                count: 2,
                target: 2
              }
            }
          })
        );
        expect(apply(scale, { deployState: 'ok' })).toBe('applied already 2');
      });
    });
  });

  describe('apply_list', () => {
    // apply_item answers per spec from RES, apply_tick records its arguments
    const list = (
      items: Record<string, unknown>[],
      res: Record<string, string>,
      opts: { tickRc?: number; saveRc?: number; apply?: object } = {}
    ) => {
      const entry = {
        pr: 5,
        apply: {
          commentId: 'c1',
          sha: SHA,
          items,
          left: [],
          invalid: null,
          done: false,
          ...opts.apply
        }
      };
      const r = run(
        ['apply_list COD-9 "$ENTRY"'],
        { ENTRY: JSON.stringify(entry), RES: JSON.stringify(res) },
        [
          'apply_item() { print -r -- "$(jq -r .spec <<<"$2")" >> "' +
            home +
            '/item.calls"; jq -r --arg s "$(jq -r .spec <<<"$2")" \'.[$s] // ""\' <<<"$RES"; }',
          `apply_tick() { print -r -- "$*" >> "${home}/tick.calls"; return ${opts.tickRc ?? 0}; }`,
          `apply_save() { print -r -- "$1" >> "${home}/save.calls"; return ${opts.saveRc ?? 0}; }`,
          // The checkout has the merge, and the PR's files read as none added
          'git() { return 0; }',
          'gh_identity() { return 0; }',
          'gh() { return 0; }',
          'note() { :; }',
          'record() { :; }',
          `own_event() { print -r -- "$1" >> "${home}/own.calls"; }`,
          `notice() { print -r -- "$1|$2" >> "${home}/notices"; }`
        ]
      );
      return {
        own: lines('own.calls').map(
          (l) => JSON.parse(l) as Record<string, unknown>
        ),
        out: JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}') as {
          apply: {
            done: boolean;
            told?: boolean;
            invalid: string | null;
            items: { status: string; outcome?: string; ticked?: boolean }[];
          };
        },
        ticks: lines('tick.calls'),
        items: lines('item.calls'),
        saves: lines('save.calls'),
        notices: lines('notices')
      };
    };
    const a = item('restart', ['cdwr-cms']);
    const b = item('restart', ['cdwr-headless-moon']);

    it.skipIf(!canRun)(
      'marks a list with an invalid item and applies nothing',
      () => {
        const bad = item('restart', ['cdwr-cms;rm']);
        const r = list([a, bad], {
          [a.spec]: 'applied x',
          [bad.spec]: 'applied x'
        });
        expect(r.out.apply.invalid).toBe(
          'restart cdwr-cms;rm: not in the vocabulary'
        );
        expect(r.out.apply.done).toBe(true);
        expect(r.out.apply.items.map((i) => i.status)).toEqual([
          'pending',
          'pending'
        ]);
        expect(r.ticks).toEqual([]);
        expect(r.notices).toHaveLength(1);
        expect(r.notices[0]).toMatch(
          /^action\|COD-9: apply list not applied: /
        );
      }
    );

    it.skipIf(!canRun)(
      'marks a migration the PR did not add as invalid',
      () => {
        const m = item('supabase-migration', [MIGRATION]);
        const r = list([m], { [m.spec]: 'applied x' });
        expect(r.out.apply.invalid).toBe(`${m.spec}: PR 5 did not add it`);
        expect(r.out.apply.done).toBe(true);
        expect(r.ticks).toEqual([]);
      }
    );

    it.skipIf(!canRun)('stops at the first refusal', () => {
      const r = list([a, b], {
        [a.spec]: 'refused nope',
        [b.spec]: 'applied x'
      });
      expect(r.out.apply.items).toEqual([
        expect.objectContaining({
          status: 'refused',
          outcome: 'refused: nope'
        }),
        expect.objectContaining({ status: 'pending' })
      ]);
      expect(r.out.apply.done).toBe(true);
      expect(r.ticks).toEqual(['c1 restart cdwr-cms refused: nope false']);
      expect(r.notices).toHaveLength(1);
      expect(r.notices[0]).toMatch(
        /^action\|COD-9: apply list stopped at restart cdwr-cms: nope/
      );
    });

    describe('own events', () => {
      it.skipIf(!canRun)('records an invalid list as one refused event', () => {
        const bad = item('restart', ['cdwr-cms;rm']);
        const r = list([a, bad], { [a.spec]: 'applied x' });
        expect(r.own).toEqual([
          {
            event_id: 'apply:COD-9:c1:invalid',
            kind: 'apply',
            ticket: 'COD-9',
            pr: 5,
            target: 'the apply list',
            result: 'refused',
            reason: 'restart cdwr-cms;rm: not in the vocabulary'
          }
        ]);
      });

      it.skipIf(!canRun)('records an applied and a refused item', () => {
        const r = list([a, b], {
          [a.spec]: 'applied 2026-11-20T07:12Z',
          [b.spec]: 'refused nope'
        });
        expect(r.own).toEqual([
          {
            event_id: 'apply:COD-9:c1:0',
            kind: 'apply',
            ticket: 'COD-9',
            pr: 5,
            target: a.spec,
            result: 'applied',
            reason: null
          },
          {
            event_id: 'apply:COD-9:c1:1',
            kind: 'apply',
            ticket: 'COD-9',
            pr: 5,
            target: b.spec,
            result: 'refused',
            reason: 'nope'
          }
        ]);
      });

      it.skipIf(!canRun)('records nothing for a waiting item', () => {
        expect(list([a], { [a.spec]: 'wait' }).own).toEqual([]);
      });
    });

    it.skipIf(!canRun)('is done with a summary when all applied', () => {
      const r = list([a, b], {
        [a.spec]: 'applied 2026-11-20T07:12Z',
        [b.spec]: 'applied already 2'
      });
      expect(r.out.apply.items.map((i) => i.status)).toEqual([
        'applied',
        'applied'
      ]);
      expect(r.out.apply.done).toBe(true);
      expect(r.ticks).toEqual([
        'c1 restart cdwr-cms 2026-11-20T07:12Z true',
        'c1 restart cdwr-headless-moon already 2 true'
      ]);
      expect(r.notices).toEqual([
        'info|COD-9 merged: applied restart cdwr-cms, restart cdwr-headless-moon (already 2); nothing left for you'
      ]);
    });

    it.skipIf(!canRun)(
      'leaves a waiting entry pending without a notice',
      () => {
        const r = list([a, b], { [a.spec]: 'wait', [b.spec]: 'applied x' });
        expect(r.out.apply.items.map((i) => i.status)).toEqual([
          'pending',
          'pending'
        ]);
        expect(r.out.apply.done).toBe(false);
        expect(r.ticks).toEqual([]);
        expect(r.notices).toEqual([]);
      }
    );

    it.skipIf(!canRun)('runs nothing more when watch.json is not saved', () => {
      const r = list(
        [a, b],
        { [a.spec]: 'applied x', [b.spec]: 'applied y' },
        { saveRc: 1 }
      );
      expect(r.items).toEqual([a.spec]);
      expect(r.ticks).toEqual([]);
      expect(r.out.apply.items.map((i) => i.status)).toEqual([
        'applied',
        'pending'
      ]);
      expect(r.notices).toEqual([]);
    });

    it.skipIf(!canRun)(
      'keeps a tick Linear did not take for the next run, and tells once',
      () => {
        const first = list([a], { [a.spec]: 'applied x' }, { tickRc: 1 });
        expect(first.out.apply.items[0]).toMatchObject({
          status: 'applied',
          ticked: false
        });
        expect(first.out.apply.told).toBe(true);
        expect(first.notices).toHaveLength(1);

        for (const name of ['tick.calls', 'item.calls', 'notices']) {
          rmSync(join(home, name));
        }
        const again = list(
          first.out.apply.items,
          {},
          { apply: first.out.apply }
        );
        expect(again.items).toEqual([]);
        expect(again.ticks).toEqual(['c1 restart cdwr-cms x true']);
        expect(again.out.apply.items[0]?.ticked).toBe(true);
        expect(again.notices).toEqual([]);
      }
    );

    it.skipIf(!canRun)('keeps what applied before a wait', () => {
      const r = list([a, b], { [a.spec]: 'applied x', [b.spec]: 'wait' });
      expect(r.out.apply.items.map((i) => i.status)).toEqual([
        'applied',
        'pending'
      ]);
      expect(r.out.apply.done).toBe(false);
      expect(r.ticks).toHaveLength(1);
      expect(r.notices).toEqual([]);
    });
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

// The scheduler's verdict on a desk restart or gate command, from the dry run's envelope;
// desk_platform_check prints it
describe('watch.jq platform_verdict', () => {
  const canRun = spawnSync('jq', ['--version']).status === 0;
  const dir = fileURLToPath(new URL('../../../agent-queue', import.meta.url));
  const verdict = (
    kind: string,
    args: Record<string, unknown>,
    envelope: Record<string, unknown>
  ) =>
    execFileSync(
      'jq',
      [
        '-L',
        dir,
        '-r',
        '--arg',
        'kind',
        kind,
        '--argjson',
        'args',
        JSON.stringify(args),
        'include "watch"; platform_verdict($kind; $args)'
      ],
      { input: JSON.stringify(envelope), encoding: 'utf8' }
    ).trim();
  const envelope = (json: unknown, over: Record<string, unknown> = {}) => ({
    ok: true,
    dryRun: true,
    plan: { steps: [], json },
    ...over
  });
  const SHA = 'abc1234def5678';
  const machine = (sha: string | null = SHA) => ({
    id: 'm1',
    state: 'started',
    sha
  });
  const restartState = (over: Record<string, unknown> = {}) => ({
    app: 'cdwr-cms-acme',
    environment: 'production',
    machines: [machine()],
    ...over
  });
  const restartArgs = (sha: string | null = 'abc1234') => ({
    tenant: 'acme',
    app: 'cdwr-cms-acme',
    sha
  });

  describe('restart', () => {
    it.skipIf(!canRun)('lets a restart through when the sha holds', () => {
      expect(verdict('restart', restartArgs(), envelope(restartState()))).toBe(
        'ok'
      );
    });

    it.skipIf(!canRun)('refuses a sha that has moved on', () => {
      expect(
        verdict('restart', restartArgs('1111111'), envelope(restartState()))
      ).toBe('cdwr-cms-acme runs abc1234 now, not 1111111');
    });

    it.skipIf(!canRun)(
      'lets a restart through when the desk showed no sha',
      () => {
        expect(
          verdict('restart', restartArgs(null), envelope(restartState()))
        ).toBe('ok');
      }
    );

    it.skipIf(!canRun)(
      'lets a restart through when a machine has no sha',
      () => {
        expect(
          verdict(
            'restart',
            restartArgs(),
            envelope(restartState({ machines: [machine(null)] }))
          )
        ).toBe('ok');
      }
    );

    it.skipIf(!canRun)('refuses an app without machines', () => {
      expect(
        verdict(
          'restart',
          restartArgs(),
          envelope(restartState({ machines: [] }))
        )
      ).toBe('cdwr-cms-acme has no machines');
    });

    it.skipIf(!canRun)('refuses a dry run that read another app', () => {
      expect(
        verdict(
          'restart',
          restartArgs(),
          envelope(restartState({ app: 'cdwr-cms-other' }))
        )
      ).toBe('the dry run read cdwr-cms-other, not cdwr-cms-acme');
    });

    it.skipIf(!canRun)('refuses a target that is not production', () => {
      expect(
        verdict(
          'restart',
          restartArgs(),
          envelope(restartState({ environment: 'preview' }))
        )
      ).toBe('not a production target');
    });

    it.skipIf(!canRun)(
      'refuses a dry run that failed, with its message',
      () => {
        expect(
          verdict('restart', restartArgs(), {
            ok: false,
            error: { message: 'Fly refused the token' }
          })
        ).toBe('the dry run failed: Fly refused the token');
      }
    );
  });

  describe('gate', () => {
    const app = (
      onFly: string,
      inInfisical: boolean,
      name = 'cms'
    ): Record<string, unknown> => ({
      app: name,
      flyApp: `cdwr-${name}-acme`,
      inInfisical,
      onFly
    });
    const gateState = (
      apps: Array<Record<string, unknown>>,
      over: Record<string, unknown> = {}
    ) => ({ tenant: 'acme', environment: 'production', apps, ...over });
    const args = (action: string) => ({ tenant: 'acme', action });

    it.skipIf(!canRun)('lets a close through on an open site', () => {
      expect(
        verdict(
          'gate',
          args('close'),
          envelope(gateState([app('missing', false)]))
        )
      ).toBe('ok');
    });

    it.skipIf(!canRun)('refuses a close on a closed site', () => {
      expect(
        verdict('gate', args('close'), envelope(gateState([app('set', true)])))
      ).toBe('already closed');
    });

    it.skipIf(!canRun)('lets an open through on a closed site', () => {
      expect(
        verdict('gate', args('open'), envelope(gateState([app('set', true)])))
      ).toBe('ok');
    });

    it.skipIf(!canRun)('refuses an open on an open site', () => {
      expect(
        verdict(
          'gate',
          args('open'),
          envelope(gateState([app('missing', false)]))
        )
      ).toBe('already open');
    });

    it.skipIf(!canRun)('refuses a tenant with no deployed app', () => {
      expect(
        verdict(
          'gate',
          args('close'),
          envelope(gateState([app('unreachable', false)]))
        )
      ).toBe('acme has no deployed app');
    });

    it.skipIf(!canRun)('names Infisical when it lists no app', () => {
      expect(verdict('gate', args('open'), envelope(gateState([])))).toBe(
        'Infisical lists no app for acme'
      );
    });

    it.skipIf(!canRun)('names Fly and its error when it refused', () => {
      expect(
        verdict(
          'gate',
          args('open'),
          envelope(
            gateState([
              { ...app('unreachable', false), flyError: 'Error: unauthorized' }
            ])
          )
        )
      ).toBe('Fly refused cdwr-cms-acme: Error: unauthorized');
    });

    it.skipIf(!canRun)('counts the other apps Fly refused', () => {
      expect(
        verdict(
          'gate',
          args('open'),
          envelope(
            gateState([
              { ...app('unreachable', false), flyError: 'Error: unauthorized' },
              {
                ...app('unreachable', false, 'headless'),
                flyError: 'Error: unauthorized'
              }
            ])
          )
        )
      ).toBe('Fly refused cdwr-cms-acme: Error: unauthorized (+1 more)');
    });

    it.skipIf(!canRun)('cuts a long Fly refusal to 160 characters', () => {
      const out = verdict(
        'gate',
        args('open'),
        envelope(
          gateState([
            { ...app('unreachable', false), flyError: 'x'.repeat(160) }
          ])
        )
      );
      expect(out.startsWith('Fly refused cdwr-cms-acme: xxx')).toBe(true);
      expect(out).toHaveLength(160);
      expect(out.endsWith('…')).toBe(true);
    });

    it.skipIf(!canRun)(
      'lets a gate through when one app is live beside one Fly refused',
      () => {
        expect(
          verdict(
            'gate',
            args('close'),
            envelope(
              gateState([
                app('missing', false),
                {
                  ...app('unreachable', false, 'headless'),
                  flyError: 'Error: unauthorized'
                }
              ])
            )
          )
        ).toBe('ok');
      }
    );

    it.skipIf(!canRun)('refuses a dry run that read another tenant', () => {
      expect(
        verdict(
          'gate',
          args('close'),
          envelope(gateState([app('missing', false)], { tenant: 'other' }))
        )
      ).toBe('the dry run read other, not acme');
    });
  });
});

describe('run.sh devlog session', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  let home: string;

  const day = (daysAgo: number) => {
    const d = new Date(Date.now() - daysAgo * 86_400_000);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
  };

  const gate = (env: { days?: string; hour: string }, stamp?: string) => {
    if (stamp) writeFileSync(join(home, 'devlog-ran-on'), `${stamp}\n`);
    return spawnSync(
      'zsh',
      [
        '-c',
        [
          `HOME_DIR="${home}"`,
          `DEVLOG_DAYS="${env.days ?? '7'}"`,
          `SUGGEST_HOUR="${env.hour}"`,
          fn('stamp_age'),
          fn('devlog_gate'),
          'devlog_gate'
        ].join('\n')
      ],
      { encoding: 'utf8' }
    ).stdout.trim();
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'devlog-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it.skipIf(!hasZsh)('is off when the interval is 0 or not a number', () => {
    expect(gate({ days: '0', hour: '0' })).toBe('off');
    expect(gate({ days: 'weekly', hour: '0' })).toBe('off');
  });

  it.skipIf(!hasZsh)('is done for the week after a run', () => {
    expect(gate({ hour: '0' }, day(0))).toBe('done, next in 7 day(s)');
  });

  it.skipIf(!hasZsh)('is due a week later, once past the hour', () => {
    expect(gate({ hour: '0' }, day(8))).toBe('due');
  });

  it.skipIf(!hasZsh)('waits for the hour', () => {
    expect(gate({ hour: '23' })).toMatch(/^(not before 23:00|due)$/);
  });

  describe('the claude call', () => {
    const run = fn('devlog_run');
    const allowed = run.slice(
      run.indexOf('--allowedTools'),
      run.indexOf(') > "$result"')
    );

    it('is read-only on Linear and Sentry, with no raw gh api', () => {
      expect(run).not.toBe('');
      expect(allowed).toContain('"$L"__get_issue');
      expect(allowed).not.toContain('save_');
      expect(allowed).not.toMatch(/Sentry/i);
      expect(allowed).not.toContain('gh api');
      expect(allowed).not.toContain('mcp__claude_ai_Claude_Docs');
    });

    it('writes only under devlog-drafts', () => {
      const writes = allowed.match(/"(?:Write|Edit)\([^"]*\)"/g) ?? [];
      expect(writes).toEqual([
        '"Write(/$HOME_DIR/devlog-drafts/**)"',
        '"Edit(/$HOME_DIR/devlog-drafts/**)"'
      ]);
    });
  });

  it('runs only from the idle block, after the suggest gate', () => {
    expect(SCRIPT.match(/\bdevlog_run\b/g)).toHaveLength(2);
    const idle = SCRIPT.slice(SCRIPT.indexOf('if [[ -z "$ready" ]]; then'));
    // Only when the review leaves the tick
    expect(idle).toContain(
      'elif [[ "$(devlog_gate)" == due ]]; then devlog_run; fi ;;'
    );
    expect(idle.indexOf('suggest_gate')).toBeLessThan(
      idle.indexOf('devlog_gate')
    );
  });

  it('runs a requested review before the suggestion gate is read', () => {
    const idle = SCRIPT.slice(SCRIPT.indexOf('if [[ -z "$ready" ]]; then'));
    const requested = idle.indexOf(
      'if [[ -e "$HOME_DIR/review-requested" ]]; then review_run; exit 0; fi'
    );
    expect(requested).toBeGreaterThan(-1);
    expect(requested).toBeLessThan(idle.indexOf('case "$gate" in'));
    // After --check, which only reports
    expect(requested).toBeGreaterThan(idle.indexOf('if $check;'));
  });

  it('reports the gate on --check, idle or not', () => {
    expect(
      SCRIPT.match(/print -r -- "devlog: \$\(devlog_gate\)"/g)
    ).toHaveLength(2);
  });
});

describe('run.sh review session', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const canRun =
    spawnSync('zsh', ['-c', 'true']).status === 0 &&
    spawnSync('jq', ['--version']).status === 0;
  let home: string;

  const day = (daysAgo: number) => {
    const d = new Date(Date.now() - daysAgo * 86_400_000);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
  };

  const gate = (
    env: { days?: string; hour: string },
    files: Record<string, string> = {}
  ) => {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(home, name), content);
    }
    return spawnSync(
      'zsh',
      [
        '-c',
        [
          `HOME_DIR="${home}"`,
          `REVIEW_DAYS="${env.days ?? '1'}"`,
          `SUGGEST_HOUR="${env.hour}"`,
          fn('stamp_age'),
          fn('review_gate'),
          'review_gate'
        ].join('\n')
      ],
      { encoding: 'utf8' }
    ).stdout.trim();
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'review-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  describe('the gate', () => {
    it.skipIf(!canRun)('is off when the interval is 0 or not a number', () => {
      expect(gate({ days: '0', hour: '0' })).toBe('off');
      expect(gate({ days: 'daily', hour: '0' })).toBe('off');
    });

    it.skipIf(!canRun)('has run today after a run', () => {
      expect(gate({ hour: '0' }, { 'review-ran-on': `${day(0)}\n` })).toBe(
        'ran today'
      );
    });

    it.skipIf(!canRun)('waits out a longer interval', () => {
      expect(
        gate({ days: '3', hour: '0' }, { 'review-ran-on': `${day(1)}\n` })
      ).toBe('done, next in 2 day(s)');
    });

    it.skipIf(!canRun)('waits for the hour', () => {
      expect(gate({ hour: '24' })).toBe('not before 24:00');
    });

    it.skipIf(!canRun)(
      'is due past the hour, with no stamp or an old one',
      () => {
        expect(gate({ hour: '0' })).toBe('due');
        expect(gate({ hour: '0' }, { 'review-ran-on': `${day(2)}\n` })).toBe(
          'due'
        );
      }
    );

    it.skipIf(!canRun)(
      'is requested by a file, whatever the hour, the days or a run today',
      () => {
        const files = {
          'review-requested': '',
          'review-ran-on': `${day(0)}\n`
        };
        expect(gate({ hour: '24' }, files)).toBe('requested');
        expect(gate({ days: '0', hour: '24' }, files)).toBe('requested');
      }
    );
  });

  describe('the claude call', () => {
    const run = fn('review_run');
    const allowed = run.slice(
      run.indexOf('--allowedTools'),
      run.indexOf(') > "$result"')
    );

    it('is read-only on Linear, with no raw gh api', () => {
      expect(run).not.toBe('');
      expect(allowed).toContain('"$L"__get_issue');
      expect(allowed).not.toContain('save_');
      expect(allowed).not.toContain('gh api');
    });

    it('denies the secret paths', () => {
      const denied = run.slice(
        run.indexOf('--disallowedTools'),
        run.indexOf('--tools')
      );
      for (const rule of [
        '"Read(**/.env*)"',
        '"Read(//**/.cdwr/*.*)"',
        '"Read(//**/.claude.json)"',
        '"Read(//run/agent/**)"',
        '"Read(/$HOME_DIR/linear.token*)"'
      ]) {
        expect(denied).toContain(rule);
      }
    });

    it('writes only the out file and its taste file', () => {
      const writes = allowed.match(/"(?:Write|Edit)\([^"]*\)"/g) ?? [];
      expect(writes).toEqual([
        '"Write(/$out)"',
        '"Edit(/$out)"',
        '"Write(/$MEMORY_DIR/feedback_review_taste.md)"',
        '"Edit(/$MEMORY_DIR/feedback_review_taste.md)"'
      ]);
    });
  });

  // A trusted checkout (COD-798) brings the project's force-push.sh allow rule into every run;
  // the runs that only read and suggest deny it, and a deny wins over an allow
  it.each(['suggest_run', 'devlog_run', 'review_run'])(
    '%s denies force-push.sh',
    (name) => {
      const run = fn(name);
      const from = run.indexOf('--disallowedTools');
      const denied = run.slice(from, run.indexOf('--tools "', from));
      expect(denied).toContain('"Bash(*force-push.sh*)"');
    }
  );

  it('takes the idle tick after the suggestion and before the devlog', () => {
    expect(SCRIPT.match(/\breview_run\b/g)).toHaveLength(3);
    const idle = SCRIPT.slice(SCRIPT.indexOf('if [[ -z "$ready" ]]; then'));
    expect(idle).toContain('if [[ "$review_state" == due ]]');
    expect(idle.indexOf('suggest_gate')).toBeLessThan(
      idle.indexOf('review_gate')
    );
    expect(idle.indexOf('review_gate')).toBeLessThan(
      idle.indexOf('devlog_gate')
    );
  });

  it('reports the gate on --check, idle or not', () => {
    expect(
      SCRIPT.match(/print -r -- "review: \$\(review_gate\)"/g)
    ).toHaveLength(2);
  });

  describe('a run', () => {
    // review_run over stubs: claude prints the given result, node stands in for review-check
    const review = (opts: {
      result?: string;
      check?: 'pass' | 'fail';
      store?: 'pass' | 'fail';
      limited?: boolean;
      files?: Record<string, string>;
    }) => {
      const t = (name: string) => join(home, `t-${name}`);
      for (const [name, content] of Object.entries(opts.files ?? {})) {
        writeFileSync(join(home, name), content);
      }
      mkdirSync(join(home, 'logs'), { recursive: true });
      // The plan's session limit: an error result and exit 1, with no apostrophe for the quoting
      const result = JSON.stringify(
        opts.limited
          ? {
              is_error: true,
              api_error: 'usage_limit_reached',
              result: 'Session limit reached · resets 7:10am (UTC)',
              total_cost_usd: 0,
              num_turns: 1
            }
          : {
              result: opts.result ?? 'Done.\nREVIEWED 4 actions',
              total_cost_usd: 1.2,
              num_turns: 7
            }
      );
      const script = [
        `source "${fileURLToPath(new URL('../../../agent-queue/lib.sh', import.meta.url))}"`,
        `HOME_DIR="${home}"; REPO="${home}"; LOGS="${home}/logs"; MEMORY_DIR=""`,
        'REVIEW_BUDGET_USD=5; L=linear; claude_env=(runenv); LINEAR_MCP_ARGS=()',
        // Stands in for env: drops the NAME=value word and calls the claude stub
        'runenv() { shift; "$@"; }',
        `queue_view='{"tree":[]}'`,
        'linear_ok() { return 0; }',
        'to_main() { :; }',
        'gh_identity_or_note() { :; }',
        'notify() { :; }',
        'telemetry_host() { print nuc; }',
        `note() { print -r -- "$*" >> "${t('note')}"; }`,
        `record() { print -r -- "$*" >> "${t('record')}"; }`,
        `notice() { print -r -- "$1|$2" >> "${t('notice')}"; }`,
        `claude() { print -r -- '${result}'; ${opts.limited ? 'return 1' : 'return 0'}; }`,
        `supabase_select() { print -r -- "$*" >> "${t('select')}"; case "$1" in
          review_dismissals) print -r -- '[{"finding_id":"a:COD-1:0123abcd","at":"2026-11-01T08:00:00Z","note":"fine"},{"finding_id":"b:COD-2:0123abcd","at":"2026-11-02T08:00:00Z","note":null}]' ;;
          *) print -r -- '[{"findings":[{"id":"a:COD-1:0123abcd","ticket":"COD-1","kind":"a","key":"k","severity":"note","evidence":[],"fix":"do it"}]}]' ;;
        esac; }`,
        `supabase_insert_checked() { print -r -- "$1|$2" >> "${t('insert')}"; ${
          opts.store === 'fail' ? 'return 1' : 'return 0'
        }; }`,
        `node() { print -r -- "$*" >> "${t('node')}"; ${
          opts.check === 'fail'
            ? 'print -r -- \'{"ok":false,"error":{"message":"failed: action 2 has no ticket"}}\'; return 1'
            : 'print -r -- \'{"ok":true,"result":{"host":"nuc","brief":"b"}}\''
        }; }`,
        // A one-liner in run.sh, so fn() can't cut it out
        'review_line() { print -r -- "$(date +%F) · $*" > "$HOME_DIR/review-line"; }',
        fn('run_outcome'),
        fn('review_run'),
        'review_run'
      ].join('\n');
      const r = spawnSync('zsh', ['-c', script], {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', HOME: home }
      });
      const lines = (name: string) =>
        existsSync(t(name))
          ? readFileSync(t(name), 'utf8').trim().split('\n')
          : [];
      return {
        stderr: r.stderr,
        inserts: lines('insert'),
        records: lines('record'),
        nodes: lines('node'),
        selects: lines('select'),
        notices: lines('notice')
      };
    };
    const file = (name: string) =>
      existsSync(join(home, name))
        ? readFileSync(join(home, name), 'utf8').trim()
        : null;

    it.skipIf(!canRun)(
      'stores the row when the check passes, and stamps the run',
      () => {
        const r = review({ files: { 'review-requested': '' } });
        expect(r.inserts).toEqual(['reviews|{"host":"nuc","brief":"b"}']);
        expect(r.nodes).toHaveLength(1);
        expect(r.nodes[0]).toMatch(
          /review-check .*review-out\.json --host nuc --cost 1\.2 --model opus --json$/
        );
        expect(r.records.join('\n')).not.toContain('warn');
        expect(file('review-requested')).toBeNull();
        expect(file('review-ran-on')).toBe(day(0));
        expect(file('review-ran-at')).toMatch(/^\d+$/);
        expect(file('review-line')).toMatch(
          / · ran \d\d:\d\d, 4 actions, \$1\.20$/
        );
        expect(file('review-view.json')).toBe('{"tree":[]}');
        expect(r.selects[0]).toMatch(
          /^review_dismissals at=gte\.\d{4}-\d\d-\d\d/
        );
      }
    );

    it.skipIf(!canRun)(
      'hands over 90 days of dismissals, each with the finding it names',
      () => {
        const r = review({});
        const since = new Date(Date.now() - 90 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        expect(r.selects[0]).toContain(`at=gte.${since}`);
        expect(r.selects[1]).toMatch(
          /^reviews at=gte\.[\d-]+&select=findings$/
        );
        expect(r.selects[1]).toContain(`at=gte.${since}`);
        expect(JSON.parse(file('review-dismissed.json') ?? '')).toEqual([
          {
            finding_id: 'a:COD-1:0123abcd',
            at: '2026-11-01T08:00:00Z',
            note: 'fine',
            ticket: 'COD-1',
            kind: 'a',
            key: 'k',
            fix: 'do it'
          },
          {
            finding_id: 'b:COD-2:0123abcd',
            at: '2026-11-02T08:00:00Z',
            note: null
          }
        ]);
        expect(file('review-dismissals.tmp')).toBeNull();
      }
    );

    it.skipIf(!canRun)(
      'warns and does not report success when the store fails',
      () => {
        const r = review({ store: 'fail' });
        expect(r.inserts).toHaveLength(1);
        expect(r.records).toEqual(['warn  review: not stored']);
        expect(file('review-line')).toMatch(/ · failed: not stored$/);
        expect(file('review-line')).not.toContain('actions');
      }
    );

    it.skipIf(!canRun)('stores nothing and warns when the check fails', () => {
      const r = review({ check: 'fail' });
      expect(r.inserts).toEqual([]);
      expect(r.records).toEqual(['warn  review: action 2 has no ticket']);
      expect(file('review-line')).toMatch(/ · failed: action 2 has no ticket$/);
    });

    it.skipIf(!canRun)('stores nothing and warns on a failed: verdict', () => {
      const r = review({ result: 'failed: no queue to read' });
      expect(r.inserts).toEqual([]);
      expect(r.nodes).toEqual([]);
      expect(r.records[0]).toMatch(/^warn {2}review: no queue to read/);
    });

    it.skipIf(!canRun)('stores nothing and warns without a verdict', () => {
      const r = review({ result: 'all done' });
      expect(r.inserts).toEqual([]);
      expect(r.records).toEqual([
        expect.stringMatching(/^warn {2}review: no verdict/)
      ]);
      expect(file('review-line')).toMatch(/ · no verdict$/);
    });

    it.skipIf(!canRun)(
      'records limited, not a failure, and holds the claude runs',
      () => {
        const r = review({ limited: true });
        expect(r.records).toHaveLength(1);
        expect(r.records[0]).toMatch(
          /^limited {2}review: Session limit reached · resets 7:10am \(UTC\), log /
        );
        expect(r.records.join('\n')).not.toContain('failed');
        expect(r.notices).toEqual([
          expect.stringMatching(
            /^info\|Agent queue: session limit reached, launches held until \d\d:\d\d UTC$/
          )
        ]);
        expect(r.inserts).toEqual([]);
        expect(r.nodes).toEqual([]);
        const hold = JSON.parse(file('limited-until.json') ?? '') as {
          until: number;
        };
        expect(hold.until).toBeGreaterThan(Date.now() / 1000);
        expect(file('review-line')).toMatch(
          / · session limit, runs after the reset$/
        );
      }
    );

    it.skipIf(!canRun)(
      'puts the stamps back after a limit, and a desk request with them',
      () => {
        const asked = review({
          limited: true,
          files: { 'review-requested': '' }
        });
        expect(asked.stderr).toBe('');
        expect(file('review-ran-on')).toBeNull();
        expect(file('review-ran-at')).toBeNull();
        expect(file('review-requested')).toBe('');
      }
    );

    it.skipIf(!canRun)('leaves no request behind when none was made', () => {
      review({ limited: true });
      expect(file('review-ran-on')).toBeNull();
      expect(file('review-requested')).toBeNull();
    });

    it.skipIf(!canRun)('tells of a hold once', () => {
      review({ limited: true });
      const again = review({ limited: true });
      // The notices file accumulates: the second run adds none
      expect(again.notices).toHaveLength(1);
    });
  });
});

// A limit never ran the session, so the claude runs give their stamps back and the idle tick waits
describe('run.sh session limit', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';

  it('removes the suggest and devlog stamp of a limited run', () => {
    expect(fn('suggest_run')).toContain(
      'limited) rm -f "$HOME_DIR/suggest-ran-on"'
    );
    expect(fn('devlog_run')).toContain(
      'rm -f "$HOME_DIR/devlog-ran-on"; devlog_line'
    );
    expect(fn('devlog_run')).toContain('if [[ "$outcome" == limited ]]');
  });

  it('sets the outcome in run_outcome before the cap and failure branches', () => {
    const run = fn('run_outcome');
    expect(run).toContain('outcome=limited');
    expect(run.indexOf('limit_hold "$result"')).toBeLessThan(
      run.indexOf('error_max_budget_usd')
    );
    expect(run.indexOf('outcome=limited')).toBeLessThan(
      run.indexOf('outcome=failed')
    );
  });

  it('starts no claude run on an idle tick while the limit holds', () => {
    const idle = SCRIPT.slice(SCRIPT.indexOf('if [[ -z "$ready" ]]; then'));
    const held = idle.indexOf('if limit_at="$(limit_held)"; then note');
    expect(held).toBeGreaterThan(idle.indexOf('if $check;'));
    expect(held).toBeLessThan(idle.indexOf('review-requested'));
    expect(held).toBeLessThan(idle.indexOf('case "$gate" in'));
  });

  it('holds planning too, after the --check report', () => {
    const at = SCRIPT.indexOf('skip: session limit, planning held until');
    expect(at).toBeGreaterThan(SCRIPT.lastIndexOf('would plan one of'));
    expect(at).toBeLessThan(SCRIPT.indexOf('to_main planning'));
  });

  it('reports the hold on --check, idle or not', () => {
    expect(
      SCRIPT.match(/print -r -- "limit: claude runs held until \$limit_at"/g)
    ).toHaveLength(2);
  });

  it('hands the launch guard the lift time', () => {
    expect(SCRIPT).toContain('limited_until="$(limit_held || true)"');
    expect(SCRIPT).toContain(
      'limitedUntil: (if $limited == "" then null else $limited end)'
    );
  });
});

describe('run.sh platform step', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  const CREDS = {
    FLY_API_TOKEN: 'fly-secret',
    PLATFORM_DATABASE_URL: 'postgres://db-secret',
    PLATFORM_INFISICAL_CLIENT_ID: 'inf-id',
    PLATFORM_INFISICAL_CLIENT_SECRET: 'inf-secret',
    PLATFORM_INFISICAL_PROJECT_ID: 'inf-project',
    PLATFORM_SENTRY_AUTH_TOKEN: 'sentry-secret',
    PLATFORM_SENTRY_ORG: 'sentry-org',
    PLATFORM_UMAMI_URL: 'https://umami.test',
    PLATFORM_UMAMI_API_KEY: 'umami-secret'
  };
  let root: string;
  let bin: string;

  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // A stub node standing in for the cdwr command: it logs its arguments and its environment
  const stubNode = (body: string) => {
    writeFileSync(
      join(bin, 'node'),
      `#!/bin/sh\necho "$@" >> "${root}/node.calls"\nenv > "${root}/node.env"\n${body}\n`
    );
    chmodSync(join(bin, 'node'), 0o755);
  };

  // One tick's record_platform, run with the given environment; the detached part is waited for
  const tick = async (
    env: Record<string, string>,
    wait = true,
    move = false
  ) => {
    const script = [
      `exec 2>>"${root}/err"`,
      'set -euo pipefail',
      `HOME_DIR="${root}"; LOGS="${root}"; REPO="${move ? `${root}/work` : root}"; check=false`,
      `note() { print -r -- "$*" >> "${root}/notes"; }`,
      `record() { print -r -- "$*" >> "${root}/records"; }`,
      'telemetry_on() { return 0; }',
      // plain shell variables, as telemetry_env leaves them after reading the .env file
      'typeset +x AGENT_SUPABASE_URL=https://supabase.test AGENT_SUPABASE_SERVICE_KEY=svc',
      'PLATFORM_VARS=(FLY_API_TOKEN PLATFORM_DATABASE_URL PLATFORM_INFISICAL_CLIENT_ID PLATFORM_INFISICAL_CLIENT_SECRET PLATFORM_INFISICAL_PROJECT_ID PLATFORM_SENTRY_AUTH_TOKEN PLATFORM_SENTRY_ORG PLATFORM_UMAMI_URL PLATFORM_UMAMI_API_KEY)',
      'DESK_VARS=(DESK_FLY_TOKEN DESK_INFISICAL_CLIENT_ID DESK_INFISICAL_CLIENT_SECRET DESK_INFISICAL_PROJECT_ID)',
      fn('unexported_env'),
      'platform_env() { unexported_env $PLATFORM_VARS; }',
      'platform_on() { [[ -n "${PLATFORM_DATABASE_URL:-}" && -n "${FLY_API_TOKEN:-}" ]]; }',
      fn('platform_warn'),
      fn('implement_live'),
      fn('implement_near'),
      fn('run_lock_live'),
      fn('take_run_lock'),
      fn('drop_run_lock'),
      fn('to_main'),
      fn('platform_move'),
      fn('record_platform'),
      'platform_env',
      'unexported_env $DESK_VARS',
      move ? 'record_platform move' : 'record_platform',
      // a sibling child process after the step, as a claude launch would be
      `env > "${root}/sibling.env"`
    ].join('\n');
    const res = spawnSync('zsh', ['-c', script], {
      env: { ...process.env, PATH: `${bin}:${process.env['PATH']}`, ...env },
      stdio: 'ignore'
    });
    expect(res.status).toBe(0);
    for (
      let i = 0;
      wait && i < 100 && existsSync(join(root, 'platform.lock'));
      i++
    )
      await sleep(50);
    expect(read('err')).toBe('');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'platform-'));
    bin = join(root, 'bin');
    mkdirSync(bin);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('runs every tick, after the move to main and before the check-in', () => {
    expect(fn('record_platform')).toContain('record_platform()');
    const at = SCRIPT.indexOf('\nrecord_platform\n');
    const lock = SCRIPT.indexOf(
      'take_run_lock $$',
      SCRIPT.indexOf('\npaused=false\n')
    );
    const toMain = SCRIPT.indexOf('to_main platform\n', lock);
    expect(lock).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(SCRIPT.indexOf('\npaused=false\n'));
    expect(at).toBeGreaterThan(lock);
    expect(at).toBeGreaterThan(toMain);
    expect(at).toBeLessThan(SCRIPT.indexOf('\nCHECKIN_ID=""'));
    // inside the unpaused block: the implementing session is checked and origin fetched first
    const live = SCRIPT.indexOf('implement_near', lock);
    const fetch = SCRIPT.indexOf('fetch -q origin', lock);
    expect(live).toBeGreaterThan(lock);
    expect(fetch).toBeGreaterThan(live);
    expect(toMain).toBeGreaterThan(fetch);
    // and the platform step moves too, in its own block
    const step = SCRIPT.indexOf('if $platform; then\n');
    expect(SCRIPT.slice(step, SCRIPT.indexOf('\nfi\n', step))).toContain(
      'record_platform move'
    );
  });

  it('runs alone with --platform: no desk commands, pause or queue lock', () => {
    expect(SCRIPT).toContain(
      'platform=false; [[ "${1:-}" == "--platform" ]] && platform=true'
    );
    expect(SCRIPT).toContain('\n$platform || apply_commands\n');
    const block =
      'if $platform; then\n  platform_due && record_platform move\n  exit 0\nfi\n';
    const at = SCRIPT.indexOf(block);
    expect(at).toBeGreaterThan(SCRIPT.indexOf('\nrecord_platform() {\n'));
    expect(at).toBeLessThan(SCRIPT.indexOf('\npaused=false\n'));
    // platform_move's own mkdir sits above; the tick's queue lock comes after the block
    expect(at).toBeLessThan(
      SCRIPT.indexOf('take_run_lock $$', SCRIPT.indexOf('\npaused=false\n'))
    );
    expect(at).toBeLessThan(SCRIPT.indexOf("trap 'st=$?; on_exit"));
  });

  it.skipIf(!hasZsh)(
    'is due unless a collection started under 5 minutes ago',
    () => {
      const due = (stamp?: string) => {
        if (stamp !== undefined)
          writeFileSync(join(root, 'platform-ran-at'), stamp);
        return spawnSync(
          'zsh',
          [
            '-c',
            [`HOME_DIR="${root}"`, fn('platform_due'), 'platform_due'].join(
              '\n'
            )
          ],
          { encoding: 'utf8' }
        ).status;
      };
      const ago = (s: number) => `${Math.floor(Date.now() / 1000) - s}\n`;
      expect(due()).toBe(0);
      expect(due(ago(60))).not.toBe(0);
      expect(due(ago(299))).not.toBe(0);
      expect(due(ago(400))).toBe(0);
      expect(due('garbage\n')).toBe(0);
    }
  );

  it.skipIf(!hasZsh)('stamps the start of each collection', async () => {
    stubNode('exit 0');
    const before = Math.floor(Date.now() / 1000);
    await tick(CREDS);
    const stamp = Number(read('platform-ran-at'));
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it.skipIf(!hasZsh)(
    'leaves the stamp alone when another collection holds the lock',
    async () => {
      stubNode('exit 0');
      mkdirSync(join(root, 'platform.lock'));
      await tick(CREDS, false);
      expect(read('platform-ran-at')).toBe('');
    }
  );

  it.skipIf(!hasZsh)('runs the command while the queue is paused', async () => {
    stubNode('exit 0');
    writeFileSync(join(root, 'paused'), '');
    await tick(CREDS);
    expect(read('node.calls')).toBe(
      'tools/cdwr/bin/cdwr.mjs agent platform-record --yes --json\n'
    );
    expect(read('records')).toBe('');
  });

  describe('with the move to main', () => {
    const git = (cwd: string, ...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
    const work = () => join(root, 'work');
    const originHead = () => git(join(root, 'origin'), 'rev-parse', 'HEAD');

    // A checkout one commit behind origin/main, fetched; node records what it sees when it runs
    const setup = (lockChanged = false) => {
      const origin = join(root, 'origin');
      mkdirSync(origin);
      git(origin, 'init', '-q', '-b', 'main');
      writeFileSync(join(origin, 'pnpm-lock.yaml'), 'a\n');
      git(origin, 'add', 'pnpm-lock.yaml');
      git(origin, 'commit', '-q', '-m', 'one');
      git(root, 'clone', '-q', origin, work());
      if (lockChanged) writeFileSync(join(origin, 'pnpm-lock.yaml'), 'b\n');
      git(origin, 'commit', '-q', '--allow-empty', '-am', 'two');
      // where to_main writes its marker
      mkdirSync(join(work(), 'node_modules'));
      writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
      chmodSync(join(bin, 'pnpm'), 0o755);
      stubNode(
        `git -C "${work()}" rev-parse HEAD > "${root}/node.head"\n` +
          `if [ -d "${root}/lock" ]; then echo held; else echo free; fi > "${root}/node.lock"`
      );
    };
    const collected = () => read('node.calls') !== '';

    it.skipIf(!hasZsh)(
      'moves the checkout before the command, without the queue lock held then or after',
      async () => {
        setup();
        const before = git(work(), 'rev-parse', 'HEAD');
        expect(before).not.toBe(originHead());
        await tick(CREDS, true, true);
        expect(read('node.head').trim()).toBe(originHead());
        expect(read('node.lock').trim()).toBe('free');
        expect(existsSync(join(root, 'lock'))).toBe(false);
        expect(read('node.calls')).toBe(
          'tools/cdwr/bin/cdwr.mjs agent platform-record --yes --json\n'
        );
      }
    );

    it.skipIf(!hasZsh)('leaves the checkout alone without move', async () => {
      setup();
      const before = git(work(), 'rev-parse', 'HEAD');
      await tick(CREDS);
      expect(collected()).toBe(true);
      expect(git(work(), 'rev-parse', 'HEAD')).toBe(before);
    });

    it.skipIf(!hasZsh)(
      'skips the move while a run holds the queue lock, and leaves the lock',
      async () => {
        setup();
        const before = git(work(), 'rev-parse', 'HEAD');
        mkdirSync(join(root, 'lock'));
        await tick(CREDS, true, true);
        expect(collected()).toBe(true);
        expect(read('node.head').trim()).toBe(before);
        expect(read('notes')).toContain('a run holds the lock');
        expect(existsSync(join(root, 'lock'))).toBe(true);
      }
    );

    it.skipIf(!hasZsh)(
      'skips the move while an implementing session runs',
      async () => {
        setup();
        const before = git(work(), 'rev-parse', 'HEAD');
        mkdirSync(join(root, 'implement.lock'));
        writeFileSync(join(root, 'implement.lock', 'pid'), `${process.pid}\n`);
        await tick(CREDS, true, true);
        expect(collected()).toBe(true);
        expect(read('node.head').trim()).toBe(before);
        expect(read('notes')).toContain('an implementing session runs');
        expect(existsSync(join(root, 'lock'))).toBe(false);
      }
    );

    it.skipIf(!hasZsh)(
      'skips the move after a launch that holds no implement.lock yet',
      async () => {
        setup();
        const before = git(work(), 'rev-parse', 'HEAD');
        writeFileSync(join(root, 'launch.json'), '{}\n');
        await tick(CREDS, true, true);
        expect(collected()).toBe(true);
        expect(read('node.head').trim()).toBe(before);
        expect(read('notes')).toContain('an implementing session runs');
      }
    );

    it.skipIf(!hasZsh)('moves once a launch is a minute old', async () => {
      setup();
      writeFileSync(join(root, 'launch.json'), '{}\n');
      const old = new Date(Date.now() - 2 * 60 * 1000);
      utimesSync(join(root, 'launch.json'), old, old);
      await tick(CREDS, true, true);
      expect(read('node.head').trim()).toBe(originHead());
    });

    it('keeps platform.lock fresh while it moves, and stops after', () => {
      const move = fn('platform_move');
      const beat = move.indexOf('touch "$HOME_DIR/platform.lock"');
      expect(beat).toBeGreaterThan(move.indexOf('take_run_lock'));
      expect(move.indexOf('for i in {1..30}; do sleep 60;')).toBeGreaterThan(
        -1
      );
      // the trap stops it on a signal, and the move stops it before the lock goes
      expect(move).toContain("trap 'kill $beat 2>/dev/null; drop_run_lock");
      const stop = move.lastIndexOf('kill $beat 2>/dev/null\n');
      expect(stop).toBeGreaterThan(move.indexOf('to_main platform quiet'));
      expect(stop).toBeLessThan(move.lastIndexOf('drop_run_lock'));
    });

    it('checks for an implementing session under the queue lock', () => {
      const move = fn('platform_move');
      expect(move.indexOf('implement_near')).toBeGreaterThan(
        move.indexOf('take_run_lock')
      );
    });

    it.skipIf(!hasZsh)(
      'notes a dirty worktree, records nothing and still collects',
      async () => {
        setup(true);
        const before = git(work(), 'rev-parse', 'HEAD');
        writeFileSync(join(work(), 'pnpm-lock.yaml'), 'dirty\n');
        await tick(CREDS, true, true);
        expect(collected()).toBe(true);
        expect(read('node.head').trim()).toBe(before);
        expect(read('notes')).toContain('worktree not clean');
        expect(read('records')).toBe('');
        expect(existsSync(join(root, 'lock'))).toBe(false);
      }
    );

    it.skipIf(!hasZsh)('notes a failed fetch and still collects', async () => {
      setup();
      const before = git(work(), 'rev-parse', 'HEAD');
      git(work(), 'remote', 'set-url', 'origin', join(root, 'missing'));
      await tick(CREDS, true, true);
      expect(collected()).toBe(true);
      expect(read('node.head').trim()).toBe(before);
      expect(read('notes')).toContain('warn: fetch failed');
      expect(read('records')).toBe('');
      expect(existsSync(join(root, 'lock'))).toBe(false);
    });
  });

  it.skipIf(!hasZsh)('skips silently without the credentials', async () => {
    stubNode('exit 0');
    const { FLY_API_TOKEN: _fly, ...noFly } = CREDS;
    const { PLATFORM_DATABASE_URL: _db, ...noDb } = CREDS;
    await tick(noFly);
    await tick(noDb);
    await tick({});
    await sleep(200);
    expect(read('node.calls')).toBe('');
    expect(read('notes')).toBe('');
    expect(existsSync(join(root, 'platform.lock'))).toBe(false);
  });

  it.skipIf(!hasZsh)(
    'passes the credentials to the command alone, never to other children',
    async () => {
      stubNode('exit 0');
      writeFileSync(
        join(root, 'env-file'),
        'PLATFORM_INFISICAL_PROJECT_ID="from-file"\n'
      );
      const { PLATFORM_INFISICAL_PROJECT_ID: _p, ...exported } = CREDS;
      await tick({
        ...exported,
        DESK_FLY_TOKEN: 'desk-secret',
        AGENT_QUEUE_ENV_FILE: join(root, 'env-file')
      });
      const node = read('node.env');
      // the desk's write credentials stay out of the platform read
      expect(node).not.toMatch(/DESK_|desk-secret/);
      for (const [key, value] of Object.entries(exported))
        expect(node).toContain(`${key}=${value}`);
      expect(node).toContain('PLATFORM_INFISICAL_PROJECT_ID=from-file');
      expect(node).toContain('AGENT_SUPABASE_URL=https://supabase.test');
      expect(node).toContain('AGENT_SUPABASE_SERVICE_KEY=svc');
      expect(node).toContain(`AGENT_QUEUE_HOME=${root}`);
      const sibling = read('sibling.env');
      expect(sibling).not.toMatch(
        /FLY_API_TOKEN|PLATFORM_|DESK_|fly-secret|db-secret|sentry-secret|umami-secret|desk-secret/
      );
    }
  );

  it.skipIf(!hasZsh)(
    'reads the desk write credentials from the env file and leaves them unexported',
    () => {
      writeFileSync(
        join(root, 'env-file'),
        [
          'DESK_FLY_TOKEN="from-file"',
          'DESK_INFISICAL_CLIENT_ID=file-id',
          'DESK_INFISICAL_CLIENT_SECRET=file-secret',
          'OTHER_VAR=ignored'
        ].join('\n') + '\n'
      );
      const script = [
        `REPO="${root}"`,
        'DESK_VARS=(DESK_FLY_TOKEN DESK_INFISICAL_CLIENT_ID DESK_INFISICAL_CLIENT_SECRET DESK_INFISICAL_PROJECT_ID)',
        fn('unexported_env'),
        'unexported_env $DESK_VARS',
        'print -r -- "$DESK_FLY_TOKEN|$DESK_INFISICAL_CLIENT_ID|$DESK_INFISICAL_CLIENT_SECRET|${OTHER_VAR:-unset}|${DESK_INFISICAL_PROJECT_ID:-unset}" > "$ROOT/vars"',
        'env > "$ROOT/sibling.env"'
      ].join('\n');
      const res = spawnSync('zsh', ['-c', script], {
        env: {
          ...process.env,
          ROOT: root,
          AGENT_QUEUE_ENV_FILE: join(root, 'env-file'),
          // already exported: it wins over the file, and is unexported
          DESK_INFISICAL_CLIENT_ID: 'from-env'
        },
        stdio: 'ignore'
      });
      expect(res.status).toBe(0);
      expect(read('vars')).toBe('from-file|from-env|file-secret|unset|unset\n');
      expect(read('sibling.env')).not.toMatch(
        /DESK_|from-file|from-env|file-secret/
      );
    }
  );

  it('keeps the Sentry and Umami reads optional', () => {
    expect(SCRIPT).toContain(
      'platform_on() { [[ -n "${PLATFORM_DATABASE_URL:-}" && -n "${FLY_API_TOKEN:-}" ]]; }'
    );
  });

  it('never exports them in the script', () => {
    expect(SCRIPT).not.toMatch(/export [^\n]*(FLY_API_TOKEN|PLATFORM_)/);
    expect(SCRIPT).toContain('typeset -g +x "$v"');
  });

  it.skipIf(!hasZsh)(
    'warns about a failed run on the next tick, once an hour',
    async () => {
      stubNode('exit 3');
      await tick(CREDS);
      // The failure is only known to the next tick
      expect(read('records')).toBe('');
      await tick(CREDS);
      expect(read('records')).toBe(
        'warn  platform: cdwr agent platform-record failed (3)\n'
      );
      await tick(CREDS);
      await tick(CREDS);
      // Noted each time, a row for the first only
      expect(read('notes').match(/warn: platform rows:/g)).toHaveLength(3);
      expect(read('records').match(/platform:/g)).toHaveLength(1);
      // The queue is never stopped: the stub ran every tick
      expect(read('node.calls').split('\n').filter(Boolean)).toHaveLength(4);
    }
  );

  it.skipIf(!hasZsh)('stops a run at its deadline and warns', async () => {
    stubNode('exec sleep 30');
    await tick({ ...CREDS, AGENT_QUEUE_PLATFORM_DEADLINE: '1' });
    expect(read('platform-status')).toBe(
      'cdwr agent platform-record timed out after 1s\n'
    );
    await tick({ ...CREDS, AGENT_QUEUE_PLATFORM_DEADLINE: '1' });
    expect(read('records')).toContain(
      'platform: cdwr agent platform-record timed out'
    );
  });

  it.skipIf(!hasZsh)(
    'lets only one collect at a time, and clears a stale lock',
    async () => {
      stubNode('exit 0');
      mkdirSync(join(root, 'platform.lock'));
      await tick(CREDS, false);
      await sleep(200);
      expect(read('node.calls')).toBe('');
      const old = new Date(Date.now() - 10 * 60 * 1000);
      utimesSync(join(root, 'platform.lock'), old, old);
      await tick(CREDS);
      expect(read('node.calls')).not.toBe('');
    }
  );
});

describe('run.sh backup step', () => {
  const fn = (name: string) =>
    SCRIPT.match(
      new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, 'm')
    )?.[0] ?? '';
  const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
  const URL = 'postgres://backup-secret';
  const today = () => new Date().toLocaleDateString('sv');
  let root: string;
  let bin: string;

  const read = (name: string) =>
    existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '';
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const calls = () => read('node.calls').split('\n').filter(Boolean).length;

  // A stub node standing in for the cdwr command
  const stubNode = (body: string) => {
    writeFileSync(
      join(bin, 'node'),
      `#!/bin/sh\necho "$@" >> "${root}/node.calls"\nenv > "${root}/node.env"\n${body}\n`
    );
    chmodSync(join(bin, 'node'), 0o755);
  };

  // One tick's record_backup, run with the given environment; the detached part is waited for
  const tick = async (env: Record<string, string>) => {
    const script = [
      `exec 2>>"${root}/err"`,
      'set -euo pipefail',
      `HOME_DIR="${root}"; REPO="${root}"; check=false`,
      `note() { print -r -- "$*" >> "${root}/notes"; }`,
      `record() { print -r -- "$*" >> "${root}/records"; }`,
      // The script's own list, so a name missing from it shows here
      SCRIPT.match(/^PLATFORM_VARS=\(.*\)$/m)?.[0] ?? '',
      fn('unexported_env'),
      'platform_env() { unexported_env $PLATFORM_VARS; }',
      fn('backup_warn'),
      fn('record_backup'),
      'platform_env',
      'record_backup',
      `env > "${root}/sibling.env"`
    ].join('\n');
    const res = spawnSync('zsh', ['-c', script], {
      env: { ...process.env, PATH: `${bin}:${process.env['PATH']}`, ...env },
      stdio: 'ignore'
    });
    expect(res.status).toBe(0);
    for (let i = 0; i < 100 && existsSync(join(root, 'backup.lock')); i++)
      await sleep(50);
    expect(read('err')).toBe('');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'backup-'));
    bin = join(root, 'bin');
    mkdirSync(bin);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('runs every tick, right after the platform step', () => {
    const at = SCRIPT.indexOf('\nrecord_backup\n');
    expect(at).toBeGreaterThan(SCRIPT.indexOf('\nrecord_platform\n'));
    expect(at).toBeLessThan(SCRIPT.indexOf('\nCHECKIN_ID=""\n'));
    expect(SCRIPT).toContain(
      'PLATFORM_DATABASE_URL PLATFORM_BACKUP_DATABASE_URL PLATFORM_INFISICAL_CLIENT_ID'
    );
    expect(SCRIPT).not.toMatch(/export [^\n]*PLATFORM_BACKUP/);
  });

  it.skipIf(!hasZsh)('runs once a night, from 02:00', async () => {
    stubNode('exit 0');
    const env = { PLATFORM_BACKUP_DATABASE_URL: URL };
    await tick({ ...env, AGENT_QUEUE_BACKUP_HOUR: '01' });
    expect(calls()).toBe(0);
    expect(read('backup-ran-on')).toBe('');
    // a leading zero is not octal
    await tick({ ...env, AGENT_QUEUE_BACKUP_HOUR: '08' });
    expect(read('node.calls')).toBe(
      'tools/cdwr/bin/cdwr.mjs agent backup --yes --json\n'
    );
    expect(read('backup-ran-on')).toBe(`${today()}\n`);
    expect(read('notes')).toContain('backup: started');
    await tick({ ...env, AGENT_QUEUE_BACKUP_HOUR: '09' });
    expect(calls()).toBe(1);
    // another day
    writeFileSync(join(root, 'backup-ran-on'), '2000-01-01\n');
    await tick({ ...env, AGENT_QUEUE_BACKUP_HOUR: '23' });
    expect(calls()).toBe(2);
  });

  it.skipIf(!hasZsh)('does nothing without the url', async () => {
    stubNode('exit 0');
    await tick({ AGENT_QUEUE_BACKUP_HOUR: '05' });
    await sleep(200);
    expect(calls()).toBe(0);
    expect(read('notes')).toBe('');
    expect(read('backup-ran-on')).toBe('');
  });

  it.skipIf(!hasZsh)(
    'passes the url to the command alone, never to other children',
    async () => {
      stubNode('exit 0');
      writeFileSync(
        join(root, 'env-file'),
        `PLATFORM_BACKUP_DATABASE_URL="${URL}"\n`
      );
      await tick({
        AGENT_QUEUE_ENV_FILE: join(root, 'env-file'),
        AGENT_QUEUE_BACKUP_HOUR: '05'
      });
      expect(read('node.env')).toContain(`PLATFORM_BACKUP_DATABASE_URL=${URL}`);
      expect(read('node.env')).toContain(`AGENT_QUEUE_HOME=${root}`);
      expect(read('sibling.env')).not.toMatch(
        /PLATFORM_BACKUP_DATABASE_URL|backup-secret/
      );
    }
  );

  it.skipIf(!hasZsh)(
    'unexports an inherited url, so only the command gets it',
    async () => {
      stubNode('exit 0');
      await tick({
        PLATFORM_BACKUP_DATABASE_URL: URL,
        AGENT_QUEUE_BACKUP_HOUR: '05'
      });
      expect(read('node.env')).toContain(`PLATFORM_BACKUP_DATABASE_URL=${URL}`);
      expect(read('sibling.env')).not.toMatch(
        /PLATFORM_BACKUP_DATABASE_URL|backup-secret/
      );
    }
  );

  it.skipIf(!hasZsh)(
    'warns about a failed run once, and clears it',
    async () => {
      stubNode('exit 3');
      const env = {
        PLATFORM_BACKUP_DATABASE_URL: URL,
        AGENT_QUEUE_BACKUP_HOUR: '05'
      };
      await tick(env);
      expect(read('backup-failed')).toBe('cdwr agent backup failed (3)\n');
      expect(read('records')).toBe('');
      // the same day: no new run, the failure is warned and removed
      await tick(env);
      expect(read('records')).toBe(
        'warn  backup: cdwr agent backup failed (3)\n'
      );
      expect(read('notes')).toContain(
        'warn: backup: cdwr agent backup failed (3)'
      );
      expect(existsSync(join(root, 'backup-failed'))).toBe(false);
      expect(calls()).toBe(1);
    }
  );
});
