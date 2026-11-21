import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readReleases } from './platform.collect';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null'
};

describe('readReleases', () => {
  let dir: string;
  let work: string;
  let origin: string;
  const sha: Record<string, string> = {};

  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgsign=false',
        ...args
      ],
      { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();

  const commit = (name: string, ...tags: string[]) => {
    git(work, 'commit', '--allow-empty', '-m', name);
    for (const tag of tags) git(work, 'tag', tag);
    sha[name] = git(work, 'rev-parse', 'HEAD');
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cdwr-releases-'));
    origin = join(dir, 'origin.git');
    work = join(dir, 'work');
    execFileSync('git', ['init', '--bare', '-b', 'main', origin], {
      env: GIT_ENV,
      stdio: 'ignore'
    });
    execFileSync('git', ['init', '-b', 'main', work], {
      env: GIT_ENV,
      stdio: 'ignore'
    });
    git(work, 'remote', 'add', 'origin', origin);
    commit('first', 'cms-1.0.0');
    commit('second', 'cms-1.1.0', 'builder-0.0.1');
    commit('preview', 'cms-1.2.0-preview.1');
    commit('newer');
    git(work, 'push', '-u', 'origin', 'main', '--tags');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the newest production tag, skipping a preview tag', async () => {
    const { fetchError, projects } = await readReleases(work, {
      cms: [sha['second'] ?? '']
    });
    expect(fetchError).toBeNull();
    expect(projects['cms']).toMatchObject({
      ok: true,
      value: { latest: 'cms-1.1.0' }
    });
  });

  it('gives each commit its newest tag and whether it holds the latest', async () => {
    const { projects } = await readReleases(work, {
      cms: [sha['first'], sha['second'], sha['preview'], sha['newer']].map(
        (s) => s ?? ''
      )
    });
    const read = projects['cms'];
    expect(read?.ok && read.value.machines).toEqual({
      [sha['first'] ?? '']: {
        ok: true,
        value: { version: 'cms-1.0.0', current: false }
      },
      // The tag sits on the commit itself
      [sha['second'] ?? '']: {
        ok: true,
        value: { version: 'cms-1.1.0', current: true }
      },
      // A preview tag is not a release
      [sha['preview'] ?? '']: {
        ok: true,
        value: { version: 'cms-1.1.0', current: true }
      },
      // A newer commit without a tag of its own is current
      [sha['newer'] ?? '']: {
        ok: true,
        value: { version: 'cms-1.1.0', current: true }
      }
    });
  });

  it('fails a commit the local git does not have, and keeps the others', async () => {
    const unknown = 'f'.repeat(40);
    const { projects } = await readReleases(work, {
      cms: [unknown, sha['second'] ?? '']
    });
    const read = projects['cms'];
    expect(read?.ok && read.value.machines[unknown]).toEqual({
      ok: false,
      reason: 'the commit is not in the local git'
    });
    expect(read?.ok && read.value.machines[sha['second'] ?? '']).toMatchObject({
      ok: true
    });
  });

  it('has no latest tag for a project with none, and counts its commits as current', async () => {
    const { projects } = await readReleases(work, {
      umami: [sha['second'] ?? '']
    });
    expect(projects['umami']).toEqual({
      ok: true,
      value: {
        latest: null,
        machines: {
          [sha['second'] ?? '']: {
            ok: true,
            value: { version: null, current: true }
          }
        }
      }
    });
  });

  it('keeps projects apart', async () => {
    const { projects } = await readReleases(work, {
      builder: [sha['newer'] ?? ''],
      cms: [sha['newer'] ?? '']
    });
    expect(projects['builder']).toMatchObject({
      ok: true,
      value: { latest: 'builder-0.0.1' }
    });
    expect(projects['cms']).toMatchObject({
      ok: true,
      value: { latest: 'cms-1.1.0' }
    });
  });

  it('runs no git without commits', async () => {
    expect(await readReleases('/nonexistent', {})).toEqual({
      fetchError: null,
      projects: {}
    });
  });

  it('starts no read past its budget', async () => {
    const { projects } = await readReleases(
      work,
      { cms: [sha['newer'] ?? ''], builder: [sha['second'] ?? ''] },
      -1
    );
    expect(projects).toEqual({
      cms: { ok: false, reason: 'out of time, read again next run' },
      builder: { ok: false, reason: 'out of time, read again next run' }
    });
  });

  it('names a failed fetch and still uses the local tags', async () => {
    git(work, 'remote', 'set-url', 'origin', join(dir, 'missing.git'));
    const { fetchError, projects } = await readReleases(work, {
      cms: [sha['newer'] ?? '']
    });
    expect(fetchError).toMatch(/^git fetch failed \(\d+\), local tags used$/);
    expect(projects['cms']).toMatchObject({
      ok: true,
      value: { latest: 'cms-1.1.0' }
    });
  });
});
