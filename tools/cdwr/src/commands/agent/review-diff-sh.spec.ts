import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
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

import { requireTools } from '../../testing/require-tools';

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../agent-queue/review-diff.sh', import.meta.url)
);

const HOLD_PATHS_PATH = fileURLToPath(
  new URL('../../../agent-queue/hold-paths.txt', import.meta.url)
);

// The first line of the script's output: the path of the diff it wrote
const firstLine = (stdout: string) => stdout.trim().split('\n')[0];

const SETTINGS_PATH = fileURLToPath(
  new URL('../../../../../.claude/settings.json', import.meta.url)
);

describe('.claude/settings.json', () => {
  it('allows the review diff helper', () => {
    const allow: string[] = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
      .permissions.allow;
    expect(allow).toContain('Bash(tools/cdwr/agent-queue/review-diff.sh *)');
  });
});

const BRANCH = 'cod-705-let-the-review-read-a-file';

describe('review-diff.sh', () => {
  requireTools('zsh');

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
    mkdirSync(join(seed, 'tools/cdwr/agent-queue'), { recursive: true });
    copyFileSync(
      HOLD_PATHS_PATH,
      join(seed, 'tools/cdwr/agent-queue/hold-paths.txt')
    );
    git(seed, 'add', '.');
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
    const out = firstLine(result.stdout);
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
    expect(firstLine(result.stdout)).toBe(
      join(main, '.git', 'worktrees', 'codeware-cod-706', 'review.diff')
    );
    expect(readFileSync(firstLine(result.stdout), 'utf8')).toContain('+linked');
  });

  it('still writes the diff when the fetch fails, and says so', () => {
    writeFileSync(join(wt, 'a.txt'), 'offline\n');
    rmSync(join(dir, 'origin.git'), { recursive: true, force: true });
    const result = run(wt);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('fetch failed');
    expect(readFileSync(firstLine(result.stdout), 'utf8')).toContain(
      '+offline'
    );
  });

  it('resolves a relative worktree path', () => {
    const result = spawnSync('zsh', [SCRIPT_PATH, 'codeware-cod-705'], {
      cwd: dir,
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(firstLine(result.stdout)).toBe(join(wt, '.git', 'review.diff'));
  });

  describe('the Merge line', () => {
    const mergeLine = (stdout: string) => stdout.trim().split('\n').slice(1);

    it('prints the diff path, then one Merge line', () => {
      writeFileSync(join(wt, 'a.txt'), 'two\n');
      const result = run(wt);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim().split('\n')).toEqual([
        join(wt, '.git', 'review.diff'),
        'Merge: merging on its own: no hold path'
      ]);
    });

    it('holds a change under a hold path', () => {
      mkdirSync(join(wt, 'apps/cms/src/migrations'), { recursive: true });
      writeFileSync(join(wt, 'apps/cms/src/migrations/x.ts'), 'x\n');
      writeFileSync(join(wt, 'a.txt'), 'two\n');
      expect(mergeLine(run(wt).stdout)).toEqual([
        'Merge: held: apps/cms/src/migrations/x.ts matches apps/cms/src/migrations/** (one-way on tenant data)'
      ]);
    });

    it('holds a tracked file that is changed under a hold path', () => {
      mkdirSync(join(wt, 'libs/shared/util/csp'), { recursive: true });
      writeFileSync(join(wt, 'libs/shared/util/csp/a.ts'), 'one\n');
      git(wt, 'add', '.');
      git(wt, 'commit', '-q', '-m', 'csp');
      expect(mergeLine(run(wt).stdout)).toEqual([
        'Merge: held: libs/shared/util/csp/a.ts matches libs/shared/util/csp/** (the cms CSP)'
      ]);
    });

    it('holds when the worktree changed nothing', () => {
      expect(mergeLine(run(wt).stdout)).toEqual([
        'Merge: held: no changed file in the diff'
      ]);
    });

    it("judges by the list on origin/main, never the branch's own copy", () => {
      writeFileSync(
        join(wt, 'tools/cdwr/agent-queue/hold-paths.txt'),
        '# nothing held\n'
      );
      mkdirSync(join(wt, 'apps/cms/src/migrations'), { recursive: true });
      writeFileSync(join(wt, 'apps/cms/src/migrations/x.ts'), 'x\n');
      expect(mergeLine(run(wt).stdout)).toEqual([
        'Merge: held: apps/cms/src/migrations/x.ts matches apps/cms/src/migrations/** (one-way on tenant data), +1 more'
      ]);
    });

    it('holds when origin/main has no hold list', () => {
      git(wt, 'checkout', '-q', 'main');
      git(wt, 'rm', '-q', 'tools/cdwr/agent-queue/hold-paths.txt');
      git(wt, 'commit', '-q', '-m', 'no list');
      git(wt, 'push', '-q', 'origin', 'main');
      git(wt, 'checkout', '-q', BRANCH);
      writeFileSync(join(wt, 'a.txt'), 'two\n');
      const result = run(wt);
      expect(result.status).toBe(0);
      expect(mergeLine(result.stdout)).toEqual([
        'Merge: held: no hold list on origin/main'
      ]);
    });

    it('holds when guard.jq is missing beside the script', () => {
      const bare = join(dir, 'bare');
      mkdirSync(bare);
      copyFileSync(SCRIPT_PATH, join(bare, 'review-diff.sh'));
      writeFileSync(join(wt, 'a.txt'), 'two\n');
      const result = spawnSync('zsh', [join(bare, 'review-diff.sh'), wt], {
        encoding: 'utf8'
      });
      expect(mergeLine(result.stdout)).toEqual([
        'Merge: held: no guard.jq beside review-diff.sh'
      ]);
    });
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
