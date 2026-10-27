import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
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

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../agent-queue/implement.sh', import.meta.url)
);
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');
const code = SCRIPT.split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe('implement.sh', () => {
  it('stops on the first error', () => {
    expect(SCRIPT).toMatch(/^set -euo pipefail$/m);
  });

  // Max subscription only
  it('never lets an API key or a cloud provider take over billing', () => {
    expect(SCRIPT).toMatch(/^unset ANTHROPIC_API_KEY .*$/m);
  });

  it('denies by default and caps the session', () => {
    expect(code).toContain('--permission-mode dontAsk');
    expect(code).toContain('--max-budget-usd');
  });

  it('never skips permissions', () => {
    expect(code).not.toContain('--dangerously-skip-permissions');
    expect(code).not.toContain('bypassPermissions');
  });

  it('writes only into the ticket worktrees', () => {
    const rules = [...code.matchAll(/"((?:Edit|Write)\([^"]*\))"/g)].map(
      ([, rule]) => rule
    );
    expect(rules).toEqual(['Edit($WT)', 'Write($WT)']);
    expect(code).toMatch(/^WT="\/\$\{REPO:h\}\/codeware-cod-\*\/\*\*"$/m);
    expect(code).not.toMatch(/\b(Edit|Write)\((?!\$WT\))/);
  });

  // The identity comes from github-app.sh beside the script, and before the budget reservation
  it('acts as the GitHub App, read from the agent checkout, or does not start', () => {
    expect(code).toContain('source "${0:A:h}/github-app.sh"');
    expect(code).toContain('app_env "$REPO/tools/cdwr/.env" && app_session');
    expect(code.indexOf('app_session')).toBeLessThan(
      code.indexOf('ledger "$BUDGET_USD" reserve')
    );
    expect(code).not.toContain('gh auth');
  });

  it('allows no bare Bash', () => {
    expect(code).not.toMatch(/"Bash"/);
    expect(code).not.toMatch(/\bBash(\(\*\))?(\s|"|$)/m);
    expect(code).not.toContain('Bash(*)');
  });

  it('runs one session at a time behind implement.lock', () => {
    expect(code).toContain('LOCK="$HOME_DIR/implement.lock"');
    expect(code).toContain('mkdir "$LOCK"');
    // Owned by pid: only the owner removes it
    expect(code).toContain('print -r -- "$$" > "$LOCK/pid"');
    expect(code).toContain(
      `[[ "$(cat "$LOCK/pid" 2>/dev/null)" == "$$" ]] && rm -rf "$LOCK"`
    );
  });

  it('keeps the spend ledger the daily cap reads', () => {
    expect(code).toContain(`'{day: $day, ticket: $t, cost: $c, kind: $k}'`);
    expect(code).toContain('ledger "$BUDGET_USD" reserve');
    expect(code).toContain('>> "$HOME_DIR/implement-spend.jsonl"');
  });

  it.each([
    'Bash(git -c *)',
    'Bash(git * config *)',
    'Bash(git * push *:main*)',
    'Bash(git * push * --force)',
    'Bash(pnpm * nx exec*)',
    'Bash(gh pr merge*)',
    'Bash(gh api * -X *)',
    'Bash(gh api graphql*)',
    'Bash(gh api * -f *)',
    'Bash(gh api * --input*)',
    'Bash(gh api *@*)'
  ])('denies the escape %s', (rule) => {
    expect(code).toContain(`"${rule}"`);
    expect(code).toContain('"${DENY[@]}"');
  });

  describe.skipIf(!hasZsh)('run', () => {
    let dir: string;
    let bin: string;
    let queueHome: string;
    let calls: string;

    let scripts: string;

    const fakeClaude = (exit: number, output: string): void => {
      writeFileSync(
        join(bin, 'claude'),
        `#!/bin/sh\necho "called $GH_TOKEN $GIT_AUTHOR_NAME" >> "${calls}"\nprintf '%s' '${output}'\nexit ${exit}\n`
      );
      chmodSync(join(bin, 'claude'), 0o755);
    };

    // github-app.sh beside the script, stubbed: the real one has its own spec
    const fakeApp = (refusal?: string): void => {
      writeFileSync(
        join(scripts, 'github-app.sh'),
        refusal === undefined
          ? `app_env() { [[ -r "$1" ]]; }\napp_session() { export GH_TOKEN=ghs_stub GIT_AUTHOR_NAME='codeware-agent[bot]'; }\n`
          : `app_env() { [[ -r "$1" ]]; }\napp_session() { print -ru2 -- "github app: ${refusal}"; return 1; }\n`
      );
    };

    const start = (extraEnv: Record<string, string> = {}) =>
      spawnSync('zsh', [join(scripts, 'implement.sh'), 'COD-1 answered'], {
        encoding: 'utf8',
        env: {
          ...extraEnv,
          PATH: `${bin}:${process.env['PATH'] ?? ''}`,
          // No Slack hook under this home
          HOME: join(dir, 'home'),
          AGENT_QUEUE_HOME: queueHome,
          AGENT_QUEUE_REPO: join(dir, 'ws', 'codeware-agent')
        }
      });

    const rows = (file: string): Record<string, unknown>[] =>
      readFileSync(join(queueHome, file), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

    const today = (): string =>
      spawnSync('date', ['+%F'], { encoding: 'utf8' }).stdout.trim();

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'implement-sh-'));
      bin = join(dir, 'bin');
      queueHome = join(dir, 'queue');
      calls = join(dir, 'calls');
      scripts = join(dir, 'scripts');
      mkdirSync(bin);
      mkdirSync(scripts);
      mkdirSync(join(dir, 'home'));
      mkdirSync(join(dir, 'ws', 'codeware-agent', 'tools', 'cdwr'), {
        recursive: true
      });
      writeFileSync(
        join(dir, 'ws', 'codeware-agent', 'tools', 'cdwr', '.env'),
        ''
      );
      copyFileSync(SCRIPT_PATH, join(scripts, 'implement.sh'));
      copyFileSync(
        fileURLToPath(
          new URL('../../../agent-queue/telemetry.sh', import.meta.url)
        ),
        join(scripts, 'telemetry.sh')
      );
      fakeApp();
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('records the spend and an implemented row, then frees the lock', () => {
      fakeClaude(0, '{"total_cost_usd":1.5,"num_turns":3,"result":"ok"}');
      const result = start();
      expect(result.status).toBe(0);
      // The session gets the app's token and commits as the bot
      expect(readFileSync(calls, 'utf8')).toBe(
        'called ghs_stub codeware-agent[bot]\n'
      );
      expect(rows('implement-spend.jsonl')).toEqual([
        { day: today(), ticket: 'COD-1', cost: 15, kind: 'reserve' },
        { day: today(), ticket: 'COD-1', cost: -13.5, kind: 'settle' }
      ]);
      expect(rows('runs.jsonl').map((r) => r['outcome'])).toEqual([
        'launched',
        'implemented'
      ]);
      expect(existsSync(join(queueHome, 'implement.lock'))).toBe(false);
    });

    it('does not start without the app identity, and reserves nothing', () => {
      fakeClaude(0, '{}');
      fakeApp('AGENT_GITHUB_APP_ID missing or not a number');
      const result = start();
      expect(result.status).toBe(1);
      expect(existsSync(calls)).toBe(false);
      expect(existsSync(join(queueHome, 'implement-spend.jsonl'))).toBe(false);
      expect(rows('runs.jsonl')).toEqual([
        expect.objectContaining({
          outcome: 'failed',
          ticket: 'COD-1',
          detail:
            'COD-1 answered · github app: AGENT_GITHUB_APP_ID missing or not a number'
        })
      ]);
      expect(existsSync(join(queueHome, 'implement.lock'))).toBe(false);
    });

    it('exits quietly when a session holds the lock', () => {
      fakeClaude(0, '{}');
      mkdirSync(join(queueHome, 'implement.lock'), { recursive: true });
      const result = start();
      expect(result.status).toBe(0);
      expect(existsSync(calls)).toBe(false);
      expect(existsSync(join(queueHome, 'implement-spend.jsonl'))).toBe(false);
      // Not ours to remove
      expect(existsSync(join(queueHome, 'implement.lock'))).toBe(true);
    });

    describe('telemetry', () => {
      // A curl that records one line of arguments per call
      const fakeCurl = (): string => {
        const log = join(dir, 'curl.log');
        writeFileSync(
          join(bin, 'curl'),
          `#!/bin/sh\ncat > /dev/null\nprintf '%s\\n' "$*" >> "${log}"\nfor a in "$@"; do last="$a"; done\nprintf '%s\\n' "$@" | grep -A1 -x -- '-d' | tail -1 >> "${log}.body"\n`
        );
        chmodSync(join(bin, 'curl'), 0o755);
        return log;
      };
      const env = {
        AGENT_SUPABASE_URL: 'https://x.supabase.co',
        AGENT_SUPABASE_SERVICE_KEY: 'sb_secret_abc'
      };

      it('posts one runs row for the launch', () => {
        const log = fakeCurl();
        fakeClaude(0, '{"total_cost_usd":1.5,"num_turns":3,"result":"ok"}');
        expect(start(env).status).toBe(0);
        const calls = readFileSync(log, 'utf8').trim().split('\n');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('https://x.supabase.co/rest/v1/runs');
        expect(calls[0]).not.toContain('sb_secret_abc');
        const body = JSON.parse(
          readFileSync(`${log}.body`, 'utf8').trim()
        ) as Record<string, unknown>;
        expect(body).toMatchObject({
          outcome: 'implemented',
          ticket: 'COD-1',
          attended: false,
          job: { kind: 'implement', interval: null, limit: null }
        });
        expect(typeof body['host']).toBe('string');
        expect(body['started_at']).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z$/);
        expect(body['finished_at']).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z$/);
      });

      it('keeps the key out of the session, handing it only the path of the env file', () => {
        fakeCurl();
        const envLog = join(dir, 'claude-env');
        writeFileSync(
          join(bin, 'claude'),
          `#!/bin/sh\nenv > "${envLog}"\nprintf '%s' '{}'\n`
        );
        chmodSync(join(bin, 'claude'), 0o755);
        const envFile = join(
          dir,
          'ws',
          'codeware-agent',
          'tools',
          'cdwr',
          '.env'
        );
        writeFileSync(
          envFile,
          'AGENT_SUPABASE_URL=https://x.supabase.co\nAGENT_SUPABASE_SERVICE_KEY=filekey\n'
        );
        start();
        // Exported by the caller too: still not inherited
        start({ AGENT_SUPABASE_SERVICE_KEY: 'envkey' });
        const seen = readFileSync(envLog, 'utf8');
        expect(seen).not.toContain('AGENT_SUPABASE_SERVICE_KEY');
        expect(seen).not.toContain('filekey');
        expect(seen).not.toContain('envkey');
        expect(seen).toContain(`AGENT_QUEUE_ENV_FILE=${envFile}`);
      });

      it('sends nothing without the env vars', () => {
        const log = fakeCurl();
        fakeClaude(0, '{}');
        expect(start().status).toBe(0);
        expect(existsSync(log)).toBe(false);
      });
    });

    it('records a cap when the session hits its budget', () => {
      fakeClaude(1, '{"subtype":"error_max_budget_usd","total_cost_usd":15}');
      start();
      const outcomes = rows('runs.jsonl').map((r) => r['outcome']);
      expect(outcomes.at(-1)).toBe('cap');
      expect(rows('implement-spend.jsonl')).toEqual([
        { day: today(), ticket: 'COD-1', cost: 15, kind: 'reserve' }
      ]);
      expect(existsSync(join(queueHome, 'implement.lock'))).toBe(false);
    });

    it('records a failure on any other exit', () => {
      fakeClaude(2, '{"subtype":"error_during_execution"}');
      start();
      expect(rows('runs.jsonl').at(-1)?.['outcome']).toBe('failed');
    });

    it('charges the full budget when the session leaves no result', () => {
      fakeClaude(137, '');
      start();
      // The reservation stands: no settle row
      expect(rows('implement-spend.jsonl')).toEqual([
        { day: today(), ticket: 'COD-1', cost: 15, kind: 'reserve' }
      ]);
    });
  });
});
