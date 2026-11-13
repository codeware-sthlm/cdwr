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

// The Bash rules of the DENY array, `Bash(...)` stripped
const denied: string[] = (/^DENY=\(\n([\s\S]*?)^\)$/m.exec(code)?.[1] ?? '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .flatMap((line) => [...line.matchAll(/"Bash\(([^"]*)\)"/g)].map((m) => m[1]));

// How Claude Code matches a Bash rule against a command: the rule is a regex with `*` as `.*`,
// anchored at both ends and spanning newlines; a rule ending in ` *` with that one star also
// matches without the trailing argument
const matches = (rule: string, command: string): boolean => {
  let source = rule
    .trim()
    .replace(/[.+?^${}()|[\]\\'"]/g, '\\$&')
    .replaceAll('*', '.*');
  if (source.endsWith(' .*') && rule.split('*').length === 2) {
    source = `${source.slice(0, -3)}( .*)?`;
  }
  return new RegExp(`^${source}$`, 's').test(command);
};
const isDenied = (command: string): boolean =>
  denied.some((rule) => matches(rule, command));

// The Bash rules of --allowedTools, `Bash(...)` stripped
const allowed: string[] = [
  ...(
    /--allowedTools \\\n([\s\S]*?)> "\$result"/.exec(code)?.[1] ?? ''
  ).matchAll(/"Bash\(([^"]*)\)"/g)
].map((m) => m[1] ?? '');

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

  // A settle after midnight must not land on the next day
  it('stamps both ledger rows with the day captured before the reservation', () => {
    const ledger = /^ledger\(\) \{\n([\s\S]*?)\n\}$/m.exec(code)?.[1];
    expect(ledger).toContain('--arg day "$DAY"');
    expect(ledger).not.toContain('date');
    expect(code.indexOf('DAY="$(date +%F)"')).toBeLessThan(
      code.indexOf('ledger "$BUDGET_USD" reserve')
    );
  });

  it.each([
    'Bash(git -c *)',
    'Bash(git * config *)',
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

  it.each(['Bash(pnpm -C * add *)', 'Bash(pnpm -C * remove *)'])(
    'changes dependencies in a worktree with %s',
    (rule) => {
      expect(code).toContain(`"${rule}"`);
    }
  );

  it('force-pushes only through force-push.sh', () => {
    expect(code).toContain('"Bash(tools/cdwr/agent-queue/force-push.sh *)"');
    expect(code).not.toMatch(/"Bash\([^"]*--force-with-lease=/);
  });

  it('reads the deny rules', () => {
    expect(denied.length).toBeGreaterThan(20);
    expect(matches('git * push * main', 'git -C /w push origin main')).toBe(
      true
    );
    expect(matches('git * push * main', 'git push origin main')).toBe(false);
  });

  it('keeps the token cache and the app credentials out of the session', () => {
    expect(code).toContain('"Read(/$HOME_DIR/linear.token*)"');
    expect(denied).toContain('*linear.token*');
    expect(denied).toContain('*linear-app.env*');
    expect(isDenied('cat /h/.cdwr/agent-queue/linear.token')).toBe(true);
    expect(isDenied('cat /h/linear-app.env')).toBe(true);
    expect(isDenied('cat "$AGENT_QUEUE_LINEAR_APP_FILE"')).toBe(true);
    expect(
      isDenied(
        'security find-generic-password -s linear-agent-queue-client-secret -w'
      )
    ).toBe(true);
  });

  const wt = '/w/codeware-cod-705';
  const branch = 'cod-705-let-attended-sessions-force-push';

  // Both the `git push` and the `git -C … push` form, each option right after `push` and later;
  // a raw push takes no option, since git also takes clusters (-uf) and abbreviations (--mi)
  it.each([
    'git push origin main',
    `git -C ${wt} push origin main`,
    `git -C ${wt} push -u origin main`,
    `git -C ${wt} push origin HEAD:main`,
    `git -C ${wt} push origin HEAD:refs/heads/main`,
    'git push --force origin HEAD',
    `git -C ${wt} push --force origin HEAD`,
    `git -C ${wt} push origin HEAD --force`,
    `git -C ${wt} push --force-with-lease=${branch}:0123abcd origin HEAD`,
    `git -C ${wt} push origin HEAD --force-with-lease`,
    `git -C ${wt} push --force-if-includes origin HEAD`,
    'git push -f origin HEAD',
    `git -C ${wt} push -f origin HEAD`,
    `git -C ${wt} push -fu origin HEAD`,
    `git -C ${wt} push origin HEAD -f`,
    `git -C ${wt} push -uf origin HEAD`,
    `git -C ${wt} push -ud origin ${branch}`,
    `git -C ${wt} push --mi origin`,
    `git -C ${wt} push origin --dele ${branch}`,
    `git -C ${wt} push --force-w=${branch}:0123abcd origin HEAD`,
    `git -C ${wt} push -u origin HEAD`,
    `git -C ${wt} push --set-upstream origin HEAD`,
    `git -C ${wt} push --no-verify origin HEAD`,
    `git -C ${wt} push -o note=a+b origin HEAD`,
    `git -C ${wt} push origin +HEAD:refs/heads/${branch}`,
    `git -C ${wt} push +HEAD:refs/heads/${branch}`,
    `git -C ${wt} push --mirror origin`,
    `git -C ${wt} push origin --delete ${branch}`,
    `git -C ${wt} push -d origin ${branch}`,
    `git -C ${wt} push origin :${branch}`,
    `git -c core.hooksPath=/x -C ${wt} push origin HEAD`,
    `git -C ${wt} config user.name x`
  ])('denies %s', (command) => {
    expect(isDenied(command)).toBe(true);
  });

  it.each([
    `git -C ${wt} push origin HEAD`,
    `git -C ${wt} push origin ${branch}`,
    `git -C ${wt} push origin HEAD:refs/heads/${branch}`,
    `git -C ${wt} push`,
    `git -C ${wt} fetch origin main`,
    `git -C ${wt} rebase origin/main`,
    `git -C ${wt} rev-parse origin/${branch}`,
    `git -C ${wt} commit -m "fix: the push of a+b"`,
    `tools/cdwr/agent-queue/force-push.sh ${wt} ${branch} 0123abcd`
  ])('leaves %s to the allow list', (command) => {
    expect(isDenied(command)).toBe(false);
  });

  // `cdwr agent exec` hands the vault's keys to what it runs in the container: Håkan's,
  // never a session's. Neither it nor ssh is on the allow list, so dontAsk denies them.
  it.each([
    'pnpm cdwr agent exec --host agent-host -- agent status',
    `pnpm -C ${wt} cdwr agent exec --host agent-host -- agent status`,
    'node tools/cdwr/bin/cdwr.mjs agent exec --host agent-host -- agent status',
    'ssh agent-host docker exec cdwr-agent /opt/agent-host/secrets.sh node tools/cdwr/bin/cdwr.mjs agent status',
    'docker exec cdwr-agent /opt/agent-host/secrets.sh env'
  ])('allows no rule for %s', (command) => {
    expect(allowed.filter((rule) => matches(rule, command))).toEqual([]);
  });

  it('reads the allow rules', () => {
    expect(allowed).toContain('pnpm cdwr agent worktree *');
    expect(allowed).toContain('tools/cdwr/agent-queue/session.sh id');
    expect(
      allowed.some((rule) => matches(rule, `git -C ${wt} push origin HEAD`))
    ).toBe(true);
  });

  it('reads a failed job log but cannot rerun it', () => {
    expect(code).toContain('"Bash(gh run view *)"');
    expect(code).not.toContain('"Bash(gh run *)"');
    expect(code).not.toContain('gh run rerun');
  });

  it.each(['Read(//run/agent/**)', 'Bash(*/run/agent/*)', 'Bash(*lib.sh*)'])(
    'denies reaching the container keys with %s',
    (rule) => {
      expect(code).toContain(`"${rule}"`);
    }
  );

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
          // Prints nothing: Linear tools are there
          AGENT_QUEUE_LINEAR_TOOLS_CMD: 'true',
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
        fileURLToPath(new URL('../../../agent-queue/lib.sh', import.meta.url)),
        join(scripts, 'lib.sh')
      );
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

    describe('a session that could not take its key', () => {
      const launchFile = (): string => join(queueHome, 'launch.json');
      const seed = (key: string, launches: number): void => {
        mkdirSync(queueHome, { recursive: true });
        writeFileSync(launchFile(), JSON.stringify({ key, launches }));
      };
      const launches = (): unknown =>
        JSON.parse(readFileSync(launchFile(), 'utf8'));
      const untried = JSON.stringify({
        total_cost_usd: 0.2,
        num_turns: 2,
        result:
          'looked around\n\nnot tried: COD-1 answered · held by another session\n'
      });

      it('gives the launch back and records untried', () => {
        seed('COD-1 answered', 1);
        fakeClaude(0, untried);
        expect(start().status).toBe(0);
        expect(launches()).toEqual({
          key: 'COD-1 answered',
          launches: 0,
          refunded: true
        });
        const last = rows('runs.jsonl').at(-1);
        expect(last).toMatchObject({ outcome: 'untried', ticket: 'COD-1' });
        expect(last?.['detail']).toContain(
          'COD-1 answered · held by another session'
        );
        expect(rows('runs.jsonl').map((r) => r['outcome'])).not.toContain(
          'implemented'
        );
      });

      it('refunds once per key', () => {
        seed('COD-1 answered', 1);
        fakeClaude(0, untried);
        start();
        expect(launches()).toEqual({
          key: 'COD-1 answered',
          launches: 0,
          refunded: true
        });
        writeFileSync(
          launchFile(),
          JSON.stringify({ key: 'COD-1 answered', launches: 2, refunded: true })
        );
        start();
        expect(launches()).toEqual({
          key: 'COD-1 answered',
          launches: 2,
          refunded: true
        });
        expect(rows('runs.jsonl').at(-1)?.['outcome']).toBe('untried');
      });

      it('records no reason given when the line has none', () => {
        seed('COD-1 answered', 1);
        fakeClaude(
          0,
          JSON.stringify({ result: 'not tried: COD-1 answered', num_turns: 1 })
        );
        start();
        expect(rows('runs.jsonl').at(-1)?.['detail']).toContain(
          'COD-1 answered · no reason given'
        );
      });

      it('takes a line naming another key for an implemented run', () => {
        seed('COD-1 answered', 1);
        fakeClaude(
          0,
          JSON.stringify({ result: 'not tried: COD-2 answered · x' })
        );
        start();
        expect(launches()).toEqual({ key: 'COD-1 answered', launches: 1 });
        expect(rows('runs.jsonl').at(-1)?.['outcome']).toBe('implemented');
      });

      it('records implemented when the result is not JSON', () => {
        seed('COD-1 answered', 1);
        fakeClaude(0, 'plain text');
        expect(start().status).toBe(0);
        expect(rows('runs.jsonl').at(-1)?.['outcome']).toBe('implemented');
      });

      it('never goes below zero', () => {
        seed('COD-1 answered', 0);
        fakeClaude(0, untried);
        start();
        expect(launches()).toEqual({
          key: 'COD-1 answered',
          launches: 0,
          refunded: true
        });
      });

      it('leaves the launch of another key alone', () => {
        seed('COD-9 answered', 2);
        fakeClaude(0, untried);
        start();
        expect(launches()).toEqual({ key: 'COD-9 answered', launches: 2 });
        expect(rows('runs.jsonl').at(-1)?.['outcome']).toBe('untried');
      });

      it('counts a normal result as implemented and keeps the launches', () => {
        seed('COD-1 answered', 1);
        fakeClaude(0, '{"total_cost_usd":1,"num_turns":3,"result":"done"}');
        start();
        expect(launches()).toEqual({ key: 'COD-1 answered', launches: 1 });
        expect(rows('runs.jsonl').at(-1)?.['outcome']).toBe('implemented');
      });
    });

    it('hands the session its key in the prompt', () => {
      const argv = join(dir, 'argv');
      writeFileSync(
        join(bin, 'claude'),
        `#!/bin/sh\nprintf '%s\\n' "$@" > "${argv}"\nprintf '%s' '{}'\n`
      );
      chmodSync(join(bin, 'claude'), 0o755);
      expect(start().status).toBe(0);
      expect(readFileSync(argv, 'utf8').split('\n')).toContain(
        '/work-queue implement-only once key="COD-1 answered"'
      );
    });

    it('settles on the reservation day when the session ends after midnight', () => {
      // A date whose day turns over while the session runs; every other format is the real one
      const dayFile = join(dir, 'day');
      const realDate = spawnSync('sh', ['-c', 'command -v date'], {
        encoding: 'utf8'
      }).stdout.trim();
      writeFileSync(dayFile, '2026-10-31\n');
      writeFileSync(
        join(bin, 'date'),
        `#!/bin/sh\nif [ "$1" = "+%F" ]; then cat "${dayFile}"; else exec "${realDate}" "$@"; fi\n`
      );
      chmodSync(join(bin, 'date'), 0o755);
      writeFileSync(
        join(bin, 'claude'),
        `#!/bin/sh\necho 2026-11-01 > "${dayFile}"\nprintf '%s' '{"total_cost_usd":6.5,"num_turns":3,"result":"ok"}'\n`
      );
      chmodSync(join(bin, 'claude'), 0o755);
      expect(start().status).toBe(0);
      expect(rows('implement-spend.jsonl')).toEqual([
        { day: '2026-10-31', ticket: 'COD-1', cost: 15, kind: 'reserve' },
        { day: '2026-10-31', ticket: 'COD-1', cost: -8.5, kind: 'settle' }
      ]);
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

    describe('Linear tools', () => {
      const argvFile = (): string => join(dir, 'argv');
      const envFile = (): string => join(dir, 'claude-env');
      const fakeArgvClaude = (): void => {
        writeFileSync(
          join(bin, 'claude'),
          `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvFile()}"\nenv > "${envFile()}"\nprintf '%s' '{}'\n`
        );
        chmodSync(join(bin, 'claude'), 0o755);
      };

      it('does not start without them, and reserves nothing', () => {
        fakeClaude(0, '{}');
        const result = start({
          AGENT_QUEUE_LINEAR_TOOLS_CMD:
            'print -r -- "key: Linear MCP answered 401"'
        });
        expect(result.status).toBe(1);
        expect(existsSync(calls)).toBe(false);
        expect(existsSync(join(queueHome, 'implement-spend.jsonl'))).toBe(
          false
        );
        expect(rows('runs.jsonl')).toEqual([
          expect.objectContaining({
            outcome: 'failed',
            ticket: 'COD-1',
            detail: expect.stringContaining('no Linear tools') as string
          })
        ]);
        expect(existsSync(join(queueHome, 'implement.lock'))).toBe(false);
      });

      it('uses the connector when asked for', () => {
        fakeArgvClaude();
        expect(start({ AGENT_QUEUE_LINEAR_MCP: 'connector' }).status).toBe(0);
        const argv = readFileSync(argvFile(), 'utf8');
        expect(argv).toContain('mcp__claude_ai_Linear__get_issue');
        expect(argv).not.toContain('--mcp-config');
      });

      it('signs its own server with the key, which stays out of argv and the config', () => {
        fakeArgvClaude();
        const keyFile = join(dir, 'linear.key');
        writeFileSync(keyFile, 'sekret\n');
        const result = start({
          AGENT_QUEUE_LINEAR_MCP: 'key',
          AGENT_QUEUE_LINEAR_KEY: 'sekret',
          AGENT_QUEUE_LINEAR_KEY_FILE: keyFile
        });
        expect(result.status).toBe(0);
        expect(readFileSync(envFile(), 'utf8')).not.toContain(
          'AGENT_QUEUE_LINEAR_KEY='
        );
        expect(readFileSync(envFile(), 'utf8')).not.toContain('sekret');
        const argv = readFileSync(argvFile(), 'utf8');
        const config = join(queueHome, 'linear-mcp.json');
        expect(argv).toContain(
          `--strict-mcp-config\n--mcp-config\n${config}\n`
        );
        expect(argv).toContain('mcp__agent_linear__get_issue');
        expect(argv).not.toContain('mcp__claude_ai_Linear');
        expect(argv).not.toContain('sekret');
        const json = readFileSync(config, 'utf8');
        expect(json).toContain('headersHelper');
        expect(json).not.toContain('${AGENT_QUEUE_LINEAR_KEY}');
        expect(json).not.toContain('sekret');
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
