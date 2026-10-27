import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/session-start.sh', import.meta.url)
);

// The queue scripts run on macOS only; a CI runner without zsh skips them
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe.skipIf(!hasZsh)('session-start.sh', () => {
  let root: string;
  let origin: string;
  let work: string;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'commit.gpgsign=false',
        ...args
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  const commit = (cwd: string, message: string) =>
    git(cwd, 'commit', '-q', '--allow-empty', '-m', message);
  const run = (extra: Record<string, string> = {}) =>
    spawnSync('zsh', [SCRIPT], {
      input: '{}',
      env: {
        ...process.env,
        AGENT_QUEUE_SESSION_KIND: '',
        AGENT_QUEUE_ENV_FILE: '',
        CLAUDE_PROJECT_DIR: work,
        ...extra
      },
      encoding: 'utf8'
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'session-start-'));
    origin = join(root, 'origin.git');
    work = join(root, 'work');
    const seed = join(root, 'seed');
    mkdirSync(seed);
    git(seed, 'init', '-q', '-b', 'main');
    commit(seed, 'one');
    git(root, 'clone', '-q', '--bare', seed, origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'switch', '-q', '--detach', 'origin/main');
    // Two more commits on origin that the checkout has not fetched
    git(seed, 'remote', 'add', 'origin', origin);
    commit(seed, 'two');
    commit(seed, 'three');
    git(seed, 'push', '-q', 'origin', 'main');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('says how far behind a detached checkout is', () => {
    const result = run();
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.systemMessage).toContain('2 commits behind origin/main');
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('2 commits');
  });

  it.each<Record<string, string>>([
    { AGENT_QUEUE_SESSION_KIND: 'implement' },
    { AGENT_QUEUE_ENV_FILE: '/x/tools/cdwr/.env' }
  ])('is silent in a session the scheduler launched: %o', (extra) => {
    const result = run(extra);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('is silent when current', () => {
    git(work, 'fetch', '-q', 'origin', 'main');
    git(work, 'switch', '-q', '--detach', 'origin/main');
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('is silent on a branch', () => {
    git(work, 'switch', '-q', 'main');
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('uses the existing ref when origin is unreachable', () => {
    // Make the ref know about the new commits, then lose the remote
    git(work, 'fetch', '-q', 'origin', 'main');
    renameSync(origin, `${origin}.gone`);
    const result = run();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).systemMessage).toContain('2 commits');
  });
});
