import { spawnSync } from 'node:child_process';
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

  it('allows no bare Bash', () => {
    expect(code).not.toMatch(/"Bash"/);
    expect(code).not.toMatch(/\bBash(\(\*\))?(\s|"|$)/m);
    expect(code).not.toContain('Bash(*)');
  });

  it('runs one session at a time behind implement.lock', () => {
    expect(code).toContain('mkdir "$HOME_DIR/implement.lock"');
    expect(code).toContain('rmdir "$HOME_DIR/implement.lock"');
  });

  it('keeps the spend ledger the daily cap reads', () => {
    expect(code).toContain(`'{day: $day, ticket: $t, cost: $c}'`);
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
    'Bash(gh api graphql *mergePullRequest*)'
  ])('denies the escape %s', (rule) => {
    expect(code).toContain(`"${rule}"`);
    expect(code).toContain('"${DENY[@]}"');
  });

  describe.skipIf(!hasZsh)('run', () => {
    let dir: string;
    let bin: string;
    let queueHome: string;
    let calls: string;

    const fakeClaude = (exit: number, output: string): void => {
      writeFileSync(
        join(bin, 'claude'),
        `#!/bin/sh\necho called >> "${calls}"\nprintf '%s' '${output}'\nexit ${exit}\n`
      );
      chmodSync(join(bin, 'claude'), 0o755);
    };

    const start = () =>
      spawnSync('zsh', [SCRIPT_PATH, 'COD-1 answered'], {
        encoding: 'utf8',
        env: {
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
      mkdirSync(bin);
      mkdirSync(join(dir, 'home'));
      mkdirSync(join(dir, 'ws', 'codeware-agent'), { recursive: true });
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('records the spend and an implemented row, then frees the lock', () => {
      fakeClaude(0, '{"total_cost_usd":1.5,"num_turns":3,"result":"ok"}');
      const result = start();
      expect(result.status).toBe(0);
      expect(rows('implement-spend.jsonl')).toEqual([
        { day: today(), ticket: 'COD-1', cost: 1.5 }
      ]);
      expect(rows('runs.jsonl').map((r) => r['outcome'])).toEqual([
        'launched',
        'implemented'
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

    it('records a cap when the session hits its budget', () => {
      fakeClaude(1, '{"subtype":"error_max_budget_usd","total_cost_usd":15}');
      start();
      const outcomes = rows('runs.jsonl').map((r) => r['outcome']);
      expect(outcomes.at(-1)).toBe('cap');
      expect(rows('implement-spend.jsonl')).toEqual([
        { day: today(), ticket: 'COD-1', cost: 15 }
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
      expect(rows('implement-spend.jsonl').at(-1)).toMatchObject({ cost: 15 });
    });
  });
});
