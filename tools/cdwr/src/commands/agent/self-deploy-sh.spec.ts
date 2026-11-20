import { spawnSync } from 'node:child_process';
import {
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

const SCRIPT = fileURLToPath(
  new URL('../../../../../apps/agent-host/nuc/self-deploy.sh', import.meta.url)
);

const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
const hasJq = spawnSync('jq', ['--version']).status === 0;
const hasGnuDate =
  spawnSync('date', ['-u', '-d', '@0', '+%Y']).stdout?.toString().trim() ===
  '1970';

const GATE = '/opt/agent-queue/deploy-gate.sh';

// Answers like the docker CLI from files the test writes, and logs every call
const FAKE_DOCKER = `#!/bin/bash
d="$FAKE_DIR"
echo "$*" >> "$d/docker.log"
case "$1" in
  inspect) cat "$d/running" 2>/dev/null || echo true ;;
  compose)
    shift
    env=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --env-file) env="$2"; shift 2 ;;
        pull|up) break ;;
        *) shift ;;
      esac
    done
    echo "compose-$1 tag=$(sed -n 's/^AGENT_IMAGE_TAG=//p' "$env")" >> "$d/docker.log"
    if [ "$1" = pull ] && [ -e "$d/pull-fail" ]; then exit 1; fi
    if [ "$1" = up ] && [ -e "$d/up-fail" ]; then exit 1; fi
    ;;
  exec)
    shift
    [ "$1" = -i ] && shift
    shift
    if [ "$1" = test ]; then [ ! -e "$d/no-gate" ]; exit; fi
    [ "$1" = /opt/agent-host/secrets.sh ] && echo secrets >> "$d/secrets.log" && shift
    shift
    sub="$1"
    shift
    case "$sub" in
      state) cat "$d/state" 2>/dev/null || echo none ;;
      pause) cat "$d/pause-out" 2>/dev/null || echo created ;;
      job) cat "$d/job.json" 2>/dev/null; exit 0 ;;
      record) cat >> "$d/record.log"; echo >> "$d/record.log" ;;
      notify) echo "$*" >> "$d/notify.log" ;;
    esac
    ;;
esac
exit 0
`;

// Serves the runs of the build workflow and the compose file at a sha
const FAKE_CURL = `#!/bin/bash
d="$FAKE_DIR"
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -H|--max-time) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" >> "$d/curl.log"
case "$url" in
  *actions/workflows*)
    [ -e "$d/runs-fail" ] && exit 22
    cat "$d/runs.json"
    ;;
  *compose.yaml)
    [ -e "$d/compose-fail" ] && exit 22
    if [ -n "$out" ]; then echo "compose from $url" > "$out"; else echo "compose from $url"; fi
    ;;
  *) exit 22 ;;
esac
`;

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const PREV = 'c'.repeat(40);
const OLD_TAG = 'sha-aaaaaaa';
const NEW_TAG = 'sha-bbbbbbb';
const PREV_TAG = 'sha-ccccccc';

const iso = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

describe.skipIf(!hasBash || !hasJq || !hasGnuDate)('self-deploy.sh', () => {
  let root: string;
  let dir: string;
  let fake: string;

  const at = 1_800_000_000;

  const path = (name: string) => join(dir, name);
  const fakePath = (name: string) => join(fake, name);
  const read = (file: string) => readFileSync(file, 'utf8');
  const lines = (file: string) =>
    existsSync(file) ? read(file).split('\n').filter(Boolean) : [];
  const dockerLog = () => lines(fakePath('docker.log'));
  const selfState = () =>
    JSON.parse(read(path('self-deploy.json'))) as Record<string, unknown>;
  const records = () =>
    lines(fakePath('record.log')).map(
      (l) => JSON.parse(l) as Record<string, unknown>
    );
  const deployed = () => dockerLog().some((l) => l.startsWith('compose-up'));

  /** The newest green build, behind a newer commit's run when `newer` says how that one stands */
  const runs = (newest: string, newer: 'busy' | 'failed' | null = null) =>
    writeFileSync(
      fakePath('runs.json'),
      JSON.stringify({
        workflow_runs: [
          ...(newer === 'busy'
            ? [
                {
                  status: 'in_progress',
                  conclusion: null,
                  head_sha: 'f'.repeat(40)
                }
              ]
            : []),
          ...(newer === 'failed'
            ? [
                {
                  status: 'completed',
                  conclusion: 'failure',
                  head_sha: 'e'.repeat(40)
                }
              ]
            : []),
          { status: 'completed', conclusion: 'success', head_sha: newest },
          {
            status: 'completed',
            conclusion: 'failure',
            head_sha: '9'.repeat(40)
          }
        ]
      })
    );

  const checking = (extra: Record<string, unknown> = {}) => {
    writeFileSync(path('image.env'), `AGENT_IMAGE_TAG=${OLD_TAG}\n`);
    writeFileSync(path('image.env.previous'), `AGENT_IMAGE_TAG=${PREV_TAG}\n`);
    writeFileSync(path('compose.yaml.previous'), 'previous compose\n');
    writeFileSync(
      path('self-deploy.json'),
      JSON.stringify({
        phase: 'checking',
        tag: OLD_TAG,
        previous: PREV_TAG,
        sha: OLD,
        at,
        ...extra
      })
    );
  };

  const job = (differs: string[] | null, when = at + 60, sha = OLD) =>
    writeFileSync(
      fakePath('job.json'),
      JSON.stringify({ at: iso(when), imageSha: sha, differs })
    );

  const tick = (env: Record<string, string> = {}) =>
    spawnSync('bash', [SCRIPT], {
      env: {
        PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
        HOME: root,
        FAKE_DIR: fake,
        SELF_DEPLOY_DIR: dir,
        SELF_DEPLOY_API: 'https://api.test',
        SELF_DEPLOY_RAW: 'https://raw.test',
        SELF_DEPLOY_WAIT_SECONDS: '0',
        SELF_DEPLOY_POLL_SECONDS: '0',
        ...env
      },
      encoding: 'utf8'
    });

  const gateCalls = (sub: string) =>
    dockerLog().filter((l) => l.endsWith(`${GATE} ${sub}`));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'self-deploy-sh-'));
    dir = join(root, 'deploy');
    fake = join(root, 'fake');
    const bin = join(root, 'bin');
    mkdirSync(dir);
    mkdirSync(fake);
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 });
    writeFileSync(join(bin, 'curl'), FAKE_CURL, { mode: 0o755 });
    writeFileSync(path('image.env'), `AGENT_IMAGE_TAG=${OLD_TAG}\n`);
    writeFileSync(path('compose.yaml'), 'current compose\n');
    runs(OLD);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('a new build', () => {
    it('does nothing when the newest build is the running tag', () => {
      const result = tick();
      expect(result.status).toBe(0);
      expect(dockerLog()).toEqual([]);
      expect(existsSync(path('self-deploy.json'))).toBe(false);
    });

    it('does nothing before the first deploy by hand', () => {
      rmSync(path('compose.yaml'));
      runs(NEW);
      const result = tick();
      expect(result.stdout).toContain('no deploy');
      expect(dockerLog()).toEqual([]);
    });

    it('pauses, swaps the files, pulls, starts, resumes and starts checking', () => {
      runs(NEW);
      const result = tick({ SELF_DEPLOY_NOW: String(at) });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`deployed ${NEW_TAG} (was ${OLD_TAG})`);

      expect(read(path('image.env.previous'))).toBe(
        `AGENT_IMAGE_TAG=${OLD_TAG}\n`
      );
      expect(read(path('compose.yaml.previous'))).toBe('current compose\n');
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${NEW_TAG}\n`);
      expect(read(path('compose.yaml'))).toBe(
        `compose from https://raw.test/codeware-sthlm/cdwr/${NEW}/apps/agent-host/compose.yaml\n`
      );
      expect(existsSync(path('compose.yaml.next'))).toBe(false);

      const log = dockerLog();
      const at_ = (needle: string) => log.findIndex((l) => l.includes(needle));
      expect(at_('pause')).toBeGreaterThan(-1);
      expect(at_('compose-pull')).toBeGreaterThan(at_('pause'));
      expect(log[at_('compose-pull')]).toBe(`compose-pull tag=${NEW_TAG}`);
      expect(log[at_('compose-up')]).toBe(`compose-up tag=${NEW_TAG}`);
      expect(at_('compose-up')).toBeGreaterThan(at_('compose-pull'));
      expect(at_(`${GATE} unpause`)).toBeGreaterThan(at_('compose-up'));
      expect(log.some((l) => l.includes('up -d agent'))).toBe(true);
      expect(log.some((l) => l.includes('pull agent'))).toBe(true);

      expect(selfState()).toMatchObject({
        phase: 'checking',
        tag: NEW_TAG,
        previous: OLD_TAG,
        sha: NEW,
        at
      });
      expect(records().at(-1)).toEqual({
        tag: NEW_TAG,
        previous: OLD_TAG,
        at: iso(at),
        by: 'self',
        phase: 'checking',
        reason: null,
        failed: null
      });
    });

    it('does not deploy under a pause made by hand, and leaves it', () => {
      runs(NEW);
      writeFileSync(fakePath('pause-out'), 'kept\n');
      const result = tick({ SELF_DEPLOY_NOW: String(at) });
      expect(result.stdout).toContain('paused by hand');
      expect(deployed()).toBe(false);
      expect(gateCalls('unpause')).toEqual([]);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
      expect(existsSync(path('compose.yaml.next'))).toBe(false);
    });

    it('does not deploy when the pause fails', () => {
      runs(NEW);
      writeFileSync(fakePath('pause-out'), '');
      const result = tick({ SELF_DEPLOY_NOW: String(at) });
      expect(result.stdout).toContain('could not pause the queue');
      expect(deployed()).toBe(false);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
      expect(existsSync(path('compose.yaml.next'))).toBe(false);
    });

    it('leaves everything when the queue stays working', () => {
      runs(NEW);
      writeFileSync(fakePath('state'), 'working\n');
      const result = tick({ SELF_DEPLOY_NOW: String(at) });
      expect(result.stdout).toContain('stayed busy');
      expect(deployed()).toBe(false);
      expect(gateCalls('unpause')).toHaveLength(1);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
      expect(read(path('compose.yaml'))).toBe('current compose\n');
      expect(existsSync(path('image.env.previous'))).toBe(false);
      expect(existsSync(path('compose.yaml.next'))).toBe(false);
    });

    it('goes on while the queue only waits', () => {
      runs(NEW);
      writeFileSync(fakePath('state'), 'waiting\n');
      tick({ SELF_DEPLOY_NOW: String(at) });
      expect(deployed()).toBe(true);
    });

    it('does not deploy when the running image has no deploy-gate.sh', () => {
      runs(NEW);
      writeFileSync(fakePath('no-gate'), '');
      const result = tick();
      expect(result.stdout).toContain('no deploy-gate.sh');
      expect(gateCalls('pause')).toEqual([]);
      expect(deployed()).toBe(false);
    });

    it('does not deploy when the container is not running', () => {
      runs(NEW);
      writeFileSync(fakePath('running'), 'false\n');
      const result = tick();
      expect(result.stdout).toContain('is not running');
      expect(deployed()).toBe(false);
    });

    it('restores the files and resumes when the pull fails', () => {
      runs(NEW);
      writeFileSync(fakePath('pull-fail'), '');
      const result = tick({ SELF_DEPLOY_NOW: String(at) });
      expect(result.stdout).toContain('pull');
      expect(deployed()).toBe(false);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
      expect(read(path('compose.yaml'))).toBe('current compose\n');
      expect(gateCalls('unpause')).toHaveLength(1);
      expect(existsSync(path('self-deploy.json'))).toBe(false);
    });

    it('does not pause when compose.yaml cannot be fetched', () => {
      runs(NEW);
      writeFileSync(fakePath('compose-fail'), '');
      const result = tick();
      expect(result.stdout).toContain('could not fetch compose.yaml');
      expect(gateCalls('pause')).toEqual([]);
      expect(existsSync(path('compose.yaml.next'))).toBe(false);
    });

    it('does nothing when the builds cannot be read', () => {
      writeFileSync(fakePath('runs-fail'), '');
      const result = tick();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('could not read the image builds');
      expect(dockerLog()).toEqual([]);
    });

    it('skips a tag that was rolled back', () => {
      runs(NEW);
      writeFileSync(
        path('self-deploy.json'),
        JSON.stringify({ phase: 'rolled-back', failed: [NEW_TAG] })
      );
      const result = tick();
      expect(result.stdout).toContain('was rolled back once');
      expect(dockerLog()).toEqual([]);
    });
  });

  describe('the deploy lock', () => {
    // flock(1) holds deploy.lock around the tick, as `cdwr agent deploy` does over ssh
    const tickUnderLock = (env: Record<string, string> = {}) =>
      spawnSync('flock', [path('deploy.lock'), 'bash', SCRIPT], {
        env: {
          PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
          HOME: root,
          FAKE_DIR: fake,
          SELF_DEPLOY_DIR: dir,
          SELF_DEPLOY_API: 'https://api.test',
          SELF_DEPLOY_RAW: 'https://raw.test',
          SELF_DEPLOY_WAIT_SECONDS: '0',
          SELF_DEPLOY_POLL_SECONDS: '0',
          ...env
        },
        encoding: 'utf8'
      });

    it('skips a new build while a deploy by hand holds it', () => {
      runs(NEW);
      const result = tickUnderLock({ SELF_DEPLOY_NOW: String(at) });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('a deploy by hand holds');
      expect(dockerLog()).toEqual([]);
      expect(deployed()).toBe(false);
    });

    it('skips the check, so no rollback runs beside a deploy by hand', () => {
      checking();
      const result = tickUnderLock({
        SELF_DEPLOY_NOW: String(at + 7200)
      });
      expect(result.stdout).toContain('a deploy by hand holds');
      expect(dockerLog()).toEqual([]);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
    });

    it('deploys once the lock is free, and leaves the lock file', () => {
      runs(NEW);
      tick({ SELF_DEPLOY_NOW: String(at) });
      expect(deployed()).toBe(true);
      expect(existsSync(path('deploy.lock'))).toBe(true);
    });
  });

  describe('a hold from cdwr agent deploy --tag', () => {
    it('keeps the running tag while the newest build is the held one', () => {
      runs(NEW);
      writeFileSync(path('hold'), `${NEW_TAG}\n`);
      const result = tick();
      expect(result.stdout).toContain('held on');
      expect(deployed()).toBe(false);
      expect(existsSync(path('hold'))).toBe(true);
    });

    it('ends when main built past it, and deploys', () => {
      runs(NEW);
      writeFileSync(path('hold'), 'sha-0000000\n');
      tick({ SELF_DEPLOY_NOW: String(at) });
      expect(existsSync(path('hold'))).toBe(false);
      expect(deployed()).toBe(true);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${NEW_TAG}\n`);
    });
  });

  describe('checking', () => {
    it('is ok on a fresh job from the new image without differences', () => {
      checking();
      job([]);
      const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
      expect(result.stdout).toContain('is healthy');
      expect(selfState()).toMatchObject({ phase: 'ok', tag: OLD_TAG });
      expect(records().at(-1)).toMatchObject({
        tag: OLD_TAG,
        previous: PREV_TAG,
        at: iso(at),
        by: 'self',
        phase: 'ok'
      });
      expect(deployed()).toBe(false);
    });

    it('is ok on a fresh job that could not read main', () => {
      checking();
      job(null);
      const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
      expect(result.stdout).toContain('main was unreadable');
      expect(selfState()).toMatchObject({ phase: 'ok', tag: OLD_TAG });
      expect(deployed()).toBe(false);
    });

    it('waits while it differs and main has no newer run, since that run may not have fetched', () => {
      checking();
      job(['run.sh']);
      runs(OLD);
      const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
      expect(result.stdout).toContain(
        'waiting for a run that reads main again'
      );
      expect(selfState()).toMatchObject({ phase: 'checking' });
      expect(deployed()).toBe(false);
    });

    it('rolls back when it still differs at the deadline and main has no newer run', () => {
      checking();
      job(['run.sh']);
      runs(OLD);
      const result = tick({ SELF_DEPLOY_NOW: String(at + 1300) });
      expect(result.stdout).toContain('rolling back');
      expect(lines(fakePath('secrets.log'))).toHaveLength(1);
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${PREV_TAG}\n`);
      expect(read(path('compose.yaml'))).toBe('previous compose\n');
      expect(dockerLog()).toContain(`compose-up tag=${PREV_TAG}`);
      expect(selfState()).toMatchObject({
        phase: 'rolled-back',
        tag: PREV_TAG,
        previous: OLD_TAG,
        failed: [OLD_TAG]
      });
      expect(lines(fakePath('notify.log'))[0]).toContain(
        `agent-host rolled back ${OLD_TAG} to ${PREV_TAG}`
      );
      expect(lines(fakePath('notify.log'))[0]).toContain('run.sh');
      expect(records().at(-1)).toMatchObject({
        tag: PREV_TAG,
        previous: OLD_TAG,
        phase: 'rolled-back',
        failed: OLD_TAG,
        by: 'self'
      });
    });

    it.each(['busy', 'failed'] as const)(
      'is ok while it differs and a newer commit’s build is %s, and stays on its tag',
      (newer) => {
        checking();
        job(['run.sh']);
        runs(OLD, newer);
        const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
        expect(result.stdout).toContain(
          newer === 'busy' ? 'main built fffffff' : 'main built eeeeeee'
        );
        expect(selfState()).toMatchObject({ phase: 'ok', tag: OLD_TAG });
        expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
        expect(deployed()).toBe(false);
      }
    );

    it('is ok and deploys the newer build when main built past it', () => {
      checking();
      job(['run.sh']);
      runs(NEW);
      const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
      expect(result.stdout).toContain('main built');
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${NEW_TAG}\n`);
      expect(selfState()).toMatchObject({
        phase: 'checking',
        tag: NEW_TAG,
        previous: OLD_TAG
      });
      const phases = records().map((r) => r['phase']);
      expect(phases).toEqual(['ok', 'checking']);
    });

    it('waits when the first run is not in yet', () => {
      checking();
      const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
      expect(result.stdout).toContain('waiting for its first run');
      expect(selfState()).toMatchObject({ phase: 'checking' });
      expect(dockerLog().some((l) => l.startsWith('compose'))).toBe(false);
    });

    it('ignores a job from before the deploy or from another image', () => {
      checking();
      job([], at - 60);
      expect(tick({ SELF_DEPLOY_NOW: String(at + 300) }).stdout).toContain(
        'waiting for its first run'
      );
      job([], at + 60, PREV);
      expect(tick({ SELF_DEPLOY_NOW: String(at + 300) }).stdout).toContain(
        'waiting for its first run'
      );
      expect(selfState()).toMatchObject({ phase: 'checking' });
    });

    it('rolls back when no fresh job shows up within the time', () => {
      checking();
      const result = tick({ SELF_DEPLOY_NOW: String(at + 1300) });
      expect(result.stdout).toContain('no healthy run within 20 minutes');
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${PREV_TAG}\n`);
      expect(selfState()).toMatchObject({ phase: 'rolled-back' });
    });

    it('honours SELF_DEPLOY_CHECK_SECONDS', () => {
      checking();
      tick({
        SELF_DEPLOY_NOW: String(at + 400),
        SELF_DEPLOY_CHECK_SECONDS: '300'
      });
      expect(selfState()).toMatchObject({ phase: 'rolled-back' });
    });

    it('rolls back when the container is not running after two minutes', () => {
      checking();
      writeFileSync(fakePath('running'), 'false\n');
      const result = tick({ SELF_DEPLOY_NOW: String(at + 150) });
      expect(result.stdout).toContain('the container is not running');
      expect(selfState()).toMatchObject({ phase: 'rolled-back' });
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${PREV_TAG}\n`);
    });

    it('gives a restarting container two minutes', () => {
      checking();
      writeFileSync(fakePath('running'), 'false\n');
      const result = tick({ SELF_DEPLOY_NOW: String(at + 60) });
      expect(result.stdout).toContain('is not running yet');
      expect(selfState()).toMatchObject({ phase: 'checking' });
    });

    it('is superseded when image.env was changed by hand', () => {
      checking();
      writeFileSync(path('image.env'), 'AGENT_IMAGE_TAG=sha-ddddddd\n');
      runs('d'.repeat(40));
      const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
      expect(result.stdout).toContain('a deploy by hand took over');
      expect(selfState()).toMatchObject({ phase: 'superseded' });
      expect(deployed()).toBe(false);
    });

    it('does not roll back a second time after a rollback', () => {
      checking();
      tick({ SELF_DEPLOY_NOW: String(at + 1300) });
      const before = dockerLog().length;
      runs(OLD);
      const result = tick({ SELF_DEPLOY_NOW: String(at + 1400) });
      expect(result.stdout).toContain('was rolled back once');
      expect(dockerLog()).toHaveLength(before);
    });

    it('goes stuck, not rolled back, when the previous image does not start', () => {
      checking();
      writeFileSync(fakePath('up-fail'), '');
      tick({ SELF_DEPLOY_NOW: String(at + 1300) });
      expect(selfState()).toMatchObject({
        phase: 'stuck',
        tag: OLD_TAG,
        failed: [OLD_TAG]
      });
      expect(records().at(-1)).toMatchObject({ tag: OLD_TAG, phase: 'stuck' });
      expect(String(records().at(-1)?.['reason'])).toContain(
        `the rollback to ${PREV_TAG} did not start`
      );
      expect(lines(fakePath('notify.log'))[0]).toContain('did not start');
    });

    it('goes stuck when there are no previous files to roll back to', () => {
      checking();
      rmSync(path('image.env.previous'));
      tick({ SELF_DEPLOY_NOW: String(at + 1300) });
      expect(selfState()).toMatchObject({ phase: 'stuck', tag: OLD_TAG });
      expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
      expect(records().at(-1)).toMatchObject({ tag: OLD_TAG, phase: 'stuck' });
      expect(lines(fakePath('notify.log'))[0]).toContain(
        'no previous files to roll back to'
      );
    });
  });
});
