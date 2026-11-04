import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../agent-queue/force-push.sh', import.meta.url)
);

const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

const BRANCH = 'cod-705-let-attended-sessions-force-push';
const SHA = '0123456789abcdef0123456789abcdef01234567';

describe.skipIf(!hasZsh)('force-push.sh', () => {
  let dir: string;
  let bin: string;
  let wt: string;
  let calls: string;

  // A git that records each call and has `checkedOut` checked out
  const fakeGit = (checkedOut: string | null): void => {
    const head =
      checkedOut === null ? 'exit 1' : `echo '${checkedOut}'; exit 0`;
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\ncase "$*" in *symbolic-ref*) ${head};; esac\n`
    );
    chmodSync(join(bin, 'git'), 0o755);
  };

  const run = (...args: string[]) =>
    spawnSync('zsh', [SCRIPT_PATH, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` }
    });

  const pushes = (): string[] =>
    existsSync(calls)
      ? readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .filter((line) => line.includes(' push '))
      : [];

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'force-push-sh-')));
    bin = join(dir, 'bin');
    wt = join(dir, 'codeware-cod-705');
    calls = join(dir, 'calls');
    mkdirSync(bin);
    mkdirSync(wt);
    fakeGit(BRANCH);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('pushes the checked-out branch with a lease on the old head', () => {
    const result = run(wt, BRANCH, SHA);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(pushes()).toEqual([
      `-C ${wt} push --force-with-lease=refs/heads/${BRANCH}:${SHA} origin HEAD:refs/heads/${BRANCH}`
    ]);
  });

  it('resolves a relative worktree path', () => {
    const result = spawnSync(
      'zsh',
      [SCRIPT_PATH, './codeware-cod-705', BRANCH, SHA],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` }
      }
    );
    expect(result.status).toBe(0);
    expect(pushes()[0]).toContain(`-C ${wt} push`);
  });

  it.each([
    ['no arguments', []],
    ['a missing old head', ['WT', BRANCH]],
    ['an extra argument', ['WT', BRANCH, SHA, '--force']],
    ['main', ['WT', 'main', SHA]],
    ['another ticket’s branch', ['WT', 'cod-706-something', SHA]],
    ['a + refspec', ['WT', `+${BRANCH}`, SHA]],
    ['a : refspec', ['WT', `${BRANCH}:main`, SHA]],
    ['a branch with a slash', ['WT', 'cod-705-x/y', SHA]],
    ['an option for a branch', ['WT', '--force', SHA]],
    ['an uppercase branch', ['WT', 'cod-705-Upper', SHA]],
    ['a short sha', ['WT', BRANCH, SHA.slice(0, 7)]],
    ['an uppercase sha', ['WT', BRANCH, SHA.toUpperCase()]],
    ['a ref for the old head', ['WT', BRANCH, 'origin/main']],
    ['an option for the worktree', ['--force', BRANCH, SHA]],
    ['a worktree that is not a ticket’s', ['/tmp', BRANCH, SHA]]
  ])('refuses %s before any push', (_, args) => {
    const result = run(...args.map((a) => (a === 'WT' ? wt : a)));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^(usage|force-push\.sh): /);
    expect(pushes()).toEqual([]);
  });

  it('refuses a ticket worktree that does not exist', () => {
    const result = run(join(dir, 'codeware-cod-706'), 'cod-706-x', SHA);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not a ticket worktree');
    expect(pushes()).toEqual([]);
  });

  it('refuses a worktree whose ticket number only starts like the branch’s', () => {
    mkdirSync(join(dir, 'codeware-cod-7050'));
    const result = run(join(dir, 'codeware-cod-7050'), BRANCH, SHA);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not the branch of cod-7050');
    expect(pushes()).toEqual([]);
  });

  it('refuses when the worktree has another branch checked out', () => {
    fakeGit('cod-705-other');
    const result = run(wt, BRANCH, SHA);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('has cod-705-other checked out');
    expect(pushes()).toEqual([]);
  });

  it('refuses a detached HEAD', () => {
    fakeGit(null);
    const result = run(wt, BRANCH, SHA);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no branch checked out');
    expect(pushes()).toEqual([]);
  });
});
