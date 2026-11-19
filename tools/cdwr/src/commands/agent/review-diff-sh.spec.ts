import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../agent-queue/review-diff.sh', import.meta.url)
);

const SETTINGS_PATH = fileURLToPath(
  new URL('../../../../../.claude/settings.json', import.meta.url)
);

const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe('.claude/settings.json', () => {
  it('allows the review diff helper', () => {
    const allow: string[] = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
      .permissions.allow;
    expect(allow).toContain('Bash(tools/cdwr/agent-queue/review-diff.sh *)');
  });
});

const BRANCH = 'cod-705-let-the-review-read-a-file';

describe.skipIf(!hasZsh)('review-diff.sh', () => {
  let dir: string;
  let wt: string;

  const git = (cwd: string, ...args: string[]): string => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'spec',
        GIT_AUTHOR_EMAIL: 'spec@example.test',
        GIT_COMMITTER_NAME: 'spec',
        GIT_COMMITTER_EMAIL: 'spec@example.test'
      }
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };

  const run = (...args: string[]) =>
    spawnSync('zsh', [SCRIPT_PATH, ...args], { encoding: 'utf8' });

  // An origin with main holding one file, cloned into a ticket worktree on the ticket's branch
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-diff-sh-')));
    const seed = join(dir, 'seed');
    mkdirSync(seed);
    git(seed, 'init', '-q', '-b', 'main');
    writeFileSync(join(seed, 'a.txt'), 'one\n');
    git(seed, 'add', 'a.txt');
    git(seed, 'commit', '-q', '-m', 'seed');
    git(dir, 'clone', '-q', '--bare', seed, 'origin.git');
    wt = join(dir, 'codeware-cod-705');
    git(dir, 'clone', '-q', join(dir, 'origin.git'), wt);
    git(wt, 'checkout', '-q', '-b', BRANCH);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes one diff against the merge base, uncommitted and untracked changes included', () => {
    writeFileSync(join(wt, 'a.txt'), 'two\n');
    git(wt, 'commit', '-q', '-am', 'committed change');
    writeFileSync(join(wt, 'a.txt'), 'three\n');
    writeFileSync(join(wt, 'b.txt'), 'staged\n');
    git(wt, 'add', 'b.txt');
    writeFileSync(join(wt, 'c.txt'), 'untracked\n');
    const result = run(wt);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const out = result.stdout.trim();
    expect(out).toBe(join(wt, '.git', 'review.diff'));
    const diff = readFileSync(out, 'utf8');
    // The net change, never the committed intermediate state as its own hunk
    expect(diff).toContain('-one\n+three');
    expect(diff).not.toContain('+two');
    expect(diff).toContain('+staged');
    expect(diff).toContain('+untracked');
    expect(
      readdirSync(join(wt, '.git')).filter((f) => f.startsWith('review.diff.'))
    ).toEqual([]);
  });

  it("writes into a linked worktree's own git dir", () => {
    const main = join(dir, 'codeware-main');
    git(dir, 'clone', '-q', join(dir, 'origin.git'), main);
    const linked = join(dir, 'codeware-cod-706');
    git(main, 'worktree', 'add', '-q', '-b', 'cod-706-linked', linked);
    writeFileSync(join(linked, 'a.txt'), 'linked\n');
    const result = run(linked);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      join(main, '.git', 'worktrees', 'codeware-cod-706', 'review.diff')
    );
    expect(readFileSync(result.stdout.trim(), 'utf8')).toContain('+linked');
  });

  it('still writes the diff when the fetch fails, and says so', () => {
    writeFileSync(join(wt, 'a.txt'), 'offline\n');
    rmSync(join(dir, 'origin.git'), { recursive: true, force: true });
    const result = run(wt);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('fetch failed');
    expect(readFileSync(result.stdout.trim(), 'utf8')).toContain('+offline');
  });

  it('resolves a relative worktree path', () => {
    const result = spawnSync('zsh', [SCRIPT_PATH, 'codeware-cod-705'], {
      cwd: dir,
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(join(wt, '.git', 'review.diff'));
  });

  it('refuses a path that is not a ticket worktree', () => {
    const result = run(join(dir, 'seed'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not a ticket worktree');
  });

  it('refuses a worktree with another branch checked out', () => {
    git(wt, 'checkout', '-q', 'main');
    const result = run(wt);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not a branch of cod-705');
    expect(existsSync(join(wt, '.git', 'review.diff'))).toBe(false);
  });

  it('takes one argument', () => {
    expect(run().status).toBe(2);
    expect(run(wt, 'extra').status).toBe(2);
  });
});
