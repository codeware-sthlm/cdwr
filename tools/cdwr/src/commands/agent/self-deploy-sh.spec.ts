import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireTools } from '../../testing/require-tools';

const SCRIPT = fileURLToPath(
  new URL('../../../../../apps/agent-host/nuc/self-deploy.sh', import.meta.url)
);

const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
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
      notify) echo "$*" >> "$d/notify.log"; [ ! -e "$d/notify-fail" ] || exit 1 ;;
    esac
    ;;
esac
exit 0
`;

// Serves the runs of the build workflow and the compose file at a sha. A REST read answers with
// the status (<name>-status, 500 for <name>-fail, <name>-status-signed when the token signs it)
// and headers (<name>-headers) the test wrote, else 200. Logs every url, and whether the read was
// signed, never the token.
const FAKE_CURL = `#!/bin/bash
d="$FAKE_DIR"
out=""
head=""
url=""
auth=anon
echo "$*" >> "$d/curl.argv"
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -D) head="$2"; shift 2 ;;
    -H)
      case "$2" in @*) grep -q '^Authorization: Bearer ' "\${2#@}" && auth=signed ;; esac
      shift 2 ;;
    -w|--max-time) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" >> "$d/curl.log"
echo "$url $auth" >> "$d/auth.log"
rest() {
  status=200
  [ -e "$d/$1-fail" ] && status=500
  [ -e "$d/$1-status" ] && status="$(cat "$d/$1-status")"
  [ "$auth" = signed ] && [ -e "$d/$1-status-signed" ] && status="$(cat "$d/$1-status-signed")"
  { printf 'HTTP/2 %s\\r\\n' "$status"; awk '{ printf "%s\\r\\n", $0 }' "$d/$1-headers" 2>/dev/null; printf '\\r\\n'; } > "$head"
  case "$status" in 2??) cat "$d/$1.json" > "$out" ;; *) : > "$out" ;; esac
  printf '%s' "$status"
  [ "$status" = 000 ] && exit 28
  exit 0
}
case "$url" in
  *actions/workflows*) rest runs ;;
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
const hhmm = (seconds: number) => `${iso(seconds).slice(11, 16)}Z`;

const TOKEN = `ghp_${'A1'.repeat(12)}`;
const RUNS_URL =
  'https://api.test/repos/codeware-sthlm/cdwr/actions/workflows/agent-host-image.yml/runs?branch=main&per_page=20';

describe.skipIf(!hasBash || !hasGnuDate)(
  'self-deploy.sh',
  { timeout: 20_000 },
  () => {
    requireTools('jq');

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
      writeFileSync(
        path('image.env.previous'),
        `AGENT_IMAGE_TAG=${PREV_TAG}\n`
      );
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
          SELF_DEPLOY_TOKEN_FILE: path('github-read.token'),
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
        const at_ = (needle: string) =>
          log.findIndex((l) => l.includes(needle));
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
            SELF_DEPLOY_TOKEN_FILE: path('github-read.token'),
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
        expect(records().at(-1)).toMatchObject({
          tag: OLD_TAG,
          phase: 'stuck'
        });
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
        expect(records().at(-1)).toMatchObject({
          tag: OLD_TAG,
          phase: 'stuck'
        });
        expect(lines(fakePath('notify.log'))[0]).toContain(
          'no previous files to roll back to'
        );
      });
    });

    describe('reading GitHub', () => {
      const tokenFile = () => path('github-read.token');
      const marker = () => path('github-read.refused');
      const auth = () => lines(fakePath('auth.log'));
      const notices = () => lines(fakePath('notify.log'));
      /** The runs read answers with this status and these headers */
      const answers = (status: string, headers = '') => {
        writeFileSync(fakePath('runs-status'), status);
        writeFileSync(fakePath('runs-headers'), headers);
      };
      const hourly = (resets: number) =>
        `x-ratelimit-remaining: 0\nx-ratelimit-reset: ${resets}`;
      const reasonOf = (record: Record<string, unknown> | undefined) =>
        String(record?.['reason']);
      const anonymous = () => `read anonymously, no token in ${tokenFile()}`;
      const refusedNote = () =>
        `read anonymously, GitHub refused the token in ${tokenFile()}`;
      /** The token file with a known mtime, so a replacement can be told apart */
      const installToken = (mtime = 1_000_000) => {
        writeFileSync(tokenFile(), `${TOKEN}\n`);
        utimesSync(tokenFile(), mtime, mtime);
      };

      describe('the token', () => {
        it.each([
          ['a token', `${TOKEN}\n`, 'signed'],
          ['no file', null, 'anon'],
          ['a malformed file', 'not a token\n', 'anon'],
          ['an empty file', '', 'anon']
        ])('reads with %s as %s', (_, content, how) => {
          if (content !== null) writeFileSync(tokenFile(), content);
          const result = tick();
          expect(result.status).toBe(0);
          expect(auth()).toEqual([`${RUNS_URL} ${how}`]);
          expect(result.stdout.includes('holds no token')).toBe(
            content !== null && how === 'anon'
          );
          expect(notices()).toEqual([]);
          expect(existsSync(marker())).toBe(false);
        });

        it('is in no log, output or state file', () => {
          installToken();
          writeFileSync(fakePath('runs-status-signed'), '401');
          writeFileSync(fakePath('runs-status'), '500');
          const result = tick({
            SELF_DEPLOY_STALL_SECONDS: '0',
            SELF_DEPLOY_NOW: String(at)
          });
          // the refused token, then the stall
          expect(notices()).toHaveLength(2);
          expect(result.stdout).not.toContain(TOKEN);
          expect(result.stderr).not.toContain(TOKEN);
          const files = [dir, fake].flatMap((d) =>
            readdirSync(d)
              .filter((f) => f !== 'github-read.token')
              .map((f) => join(d, f))
          );
          expect(files.length).toBeGreaterThan(3);
          for (const f of files) expect(read(f)).not.toContain(TOKEN);
          expect(read(fakePath('curl.argv'))).toContain('-H @/dev/fd/');
        });
      });

      describe('a refused token', () => {
        beforeEach(() => {
          installToken();
          writeFileSync(fakePath('runs-status-signed'), '401');
        });

        it('reads once more without it, marks the file and tells once', () => {
          const result = tick();
          expect(result.status).toBe(0);
          expect(auth()).toEqual([`${RUNS_URL} signed`, `${RUNS_URL} anon`]);
          expect(result.stdout).not.toContain('could not read');
          expect(result.stdout).toContain(
            `GitHub refused the token in ${tokenFile()}: reading anonymously until it is replaced`
          );
          expect(read(marker())).toBe('1000000\n');
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toMatch(
            /^agent-host: GitHub refused the read-only token/
          );
          expect(existsSync(path('self-deploy.json'))).toBe(false);
        });

        it('words a failing anonymous read after it, rate limits included', () => {
          writeFileSync(fakePath('runs-status'), '500');
          const result = tick();
          expect(result.stdout).toContain(
            `could not read the image builds on main: GitHub answered 500; ${refusedNote()}\n`
          );
          rmSync(marker());
          answers('403', hourly(at + 900));
          const limited = tick({ SELF_DEPLOY_NOW: String(at) });
          expect(limited.stdout).toContain(
            `rate limited until ${hhmm(at + 900)}; ${refusedNote()}`
          );
        });

        it('is not signed with again until the file is replaced, and not told again', () => {
          tick();
          const second = tick();
          expect(auth()).toEqual([
            `${RUNS_URL} signed`,
            `${RUNS_URL} anon`,
            `${RUNS_URL} anon`
          ]);
          expect(second.stdout).not.toContain('GitHub refused');
          expect(notices()).toHaveLength(1);

          // a rate limited read says why it reads anonymously
          answers('403', hourly(at + 900));
          const limited = tick({ SELF_DEPLOY_NOW: String(at) });
          expect(limited.stdout).toContain(
            `rate limited until ${hhmm(at + 900)}; ${refusedNote()}`
          );
          rmSync(fakePath('runs-status'));
          rmSync(fakePath('runs-headers'));

          // a new token file, so it signs again
          rmSync(fakePath('runs-status-signed'));
          installToken(2_000_000);
          tick();
          expect(auth().at(-1)).toBe(`${RUNS_URL} signed`);
          expect(
            notices().filter((n) => n.startsWith('agent-host: GitHub refused'))
          ).toHaveLength(1);
        });

        it('tells again when the new token is refused too', () => {
          tick();
          installToken(2_000_000);
          tick();
          expect(auth().filter((l) => l.endsWith('signed'))).toHaveLength(2);
          expect(read(marker())).toBe('2000000\n');
          expect(
            notices().filter((n) => n.startsWith('agent-host: GitHub refused'))
          ).toHaveLength(2);
        });

        it('marks the mtime of the token file', () => {
          tick();
          expect(read(marker()).trim()).toBe(
            String(Math.floor(statSync(tokenFile()).mtimeMs / 1000))
          );
        });
      });

      describe('rate limited', () => {
        it('sends one stuck record and one notice at once when the hourly limit is used up', () => {
          answers('403', hourly(at + 900));
          const result = tick({ SELF_DEPLOY_NOW: String(at) });
          const why = `rate limited until ${hhmm(at + 900)}; ${anonymous()}`;
          expect(result.stdout).toContain(
            `could not read the image builds on main: ${why}`
          );
          expect(records()).toEqual([
            {
              tag: OLD_TAG,
              phase: 'stuck',
              reason: `GitHub reads fail: ${why}`,
              by: 'self',
              previous: null,
              failed: null,
              at: iso(at)
            }
          ]);
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toMatch(
            /^agent-host: the self-deploy cannot read GitHub \(rate limited until/
          );
          expect(notices()[0]).toContain(why);
          expect(selfState()).toMatchObject({
            readFailingSince: at,
            readNoticed: true
          });
          expect(dockerLog().some((l) => l.startsWith('compose'))).toBe(false);
        });

        it.each([
          ['429 with retry-after', '429', 'retry-after: 120', at + 120],
          ['403 with retry-after', '403', 'retry-after: 60', at + 60]
        ])(
          'names a %s but follows the 30 minute rule',
          (_, status, headers, ends) => {
            answers(status, headers);
            const result = tick({ SELF_DEPLOY_NOW: String(at) });
            const why = `rate limited until ${hhmm(ends)}; ${anonymous()}`;
            expect(result.stdout).toContain(
              `could not read the image builds on main: ${why}`
            );
            expect(records()).toEqual([]);
            expect(notices()).toEqual([]);

            // the wait counts from the tick that sends it
            tick({ SELF_DEPLOY_NOW: String(at + 1800) });
            const later = `rate limited until ${hhmm(ends + 1800)}; ${anonymous()}`;
            expect(records()).toHaveLength(1);
            expect(reasonOf(records()[0])).toBe(`GitHub reads fail: ${later}`);
            expect(notices()).toHaveLength(1);
            expect(notices()[0]).toContain(`(${later})`);
          }
        );

        it('takes the hourly limit over retry-after when both are sent', () => {
          answers(
            '403',
            `x-ratelimit-remaining: 0\nx-ratelimit-reset: ${at + 900}\nretry-after: 60`
          );
          tick({ SELF_DEPLOY_NOW: String(at) });
          expect(notices()).toHaveLength(1);
          expect(reasonOf(records()[0])).toBe(
            `GitHub reads fail: rate limited until ${hhmm(at + 900)}; ${anonymous()}`
          );
        });

        it('leaves out the anonymous hint when the token signed the read', () => {
          installToken();
          answers('403', hourly(at + 900));
          tick({ SELF_DEPLOY_NOW: String(at) });
          expect(reasonOf(records().at(-1))).toBe(
            `GitHub reads fail: rate limited until ${hhmm(at + 900)}`
          );
        });

        it('says nothing more while it lasts, then puts back the record the stall replaced', () => {
          checking();
          job([]);
          tick({ SELF_DEPLOY_NOW: String(at + 300) });
          const before = records();
          expect(before).toHaveLength(1);
          expect(before[0]).toMatchObject({ tag: OLD_TAG, phase: 'ok' });
          expect(selfState()).toMatchObject({ record: before[0] });

          answers('403', hourly(at + 900));
          tick({ SELF_DEPLOY_NOW: String(at + 400) });
          expect(records().map((r) => r['phase'])).toEqual(['ok', 'stuck']);
          expect(notices()).toHaveLength(1);

          const second = tick({ SELF_DEPLOY_NOW: String(at + 700) });
          expect(second.stdout).toContain('could not read the image builds');
          expect(records()).toHaveLength(2);
          expect(notices()).toHaveLength(1);
          expect(selfState()).toMatchObject({ readFailingSince: at + 400 });

          rmSync(fakePath('runs-status'));
          const good = tick({ SELF_DEPLOY_NOW: String(at + 1000) });
          expect(good.stdout).toContain('GitHub reads again');
          expect(records()).toHaveLength(3);
          expect(records().at(-1)).toEqual(before[0]);
          expect(selfState()).toMatchObject({
            readFailingSince: null,
            readNoticed: null
          });

          tick({ SELF_DEPLOY_NOW: String(at + 1300) });
          expect(records()).toHaveLength(3);
          expect(notices()).toHaveLength(1);
        });

        it('puts back an ok record when the saved one is for another tag', () => {
          writeFileSync(
            path('self-deploy.json'),
            JSON.stringify({
              readFailingSince: at,
              readNoticed: true,
              record: { tag: PREV_TAG, phase: 'ok' }
            })
          );
          tick({ SELF_DEPLOY_NOW: String(at + 600) });
          expect(records()).toEqual([
            {
              tag: OLD_TAG,
              phase: 'ok',
              previous: null,
              at: iso(at + 600),
              by: 'self',
              reason: null,
              failed: null
            }
          ]);
        });

        it('tries the record and notice again while the notice is not taken', () => {
          writeFileSync(fakePath('notify-fail'), '');
          answers('403', hourly(at + 900));
          const first = tick({ SELF_DEPLOY_NOW: String(at) });
          expect(first.stdout).toContain('the notice failed');
          expect(selfState()['readNoticed']).toBeUndefined();
          expect(records()).toHaveLength(1);
          expect(notices()).toHaveLength(1);

          tick({ SELF_DEPLOY_NOW: String(at + 300) });
          expect(records()).toHaveLength(2);
          expect(notices()).toHaveLength(2);

          rmSync(fakePath('notify-fail'));
          tick({ SELF_DEPLOY_NOW: String(at + 600) });
          expect(records()).toHaveLength(3);
          expect(notices()).toHaveLength(3);
          expect(selfState()).toMatchObject({ readNoticed: true });

          tick({ SELF_DEPLOY_NOW: String(at + 900) });
          expect(records()).toHaveLength(3);
          expect(notices()).toHaveLength(3);
        });
      });

      describe('a failure that is not a rate limit', () => {
        it.each([
          ['500', 'GitHub answered 500'],
          ['403', 'GitHub answered 403'],
          ['000', 'GitHub answered no answer']
        ])(
          'logs a %s each tick, bare, and notices nothing at once',
          (status, why) => {
            answers(status);
            const result = tick({ SELF_DEPLOY_NOW: String(at) });
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(
              `could not read the image builds on main: ${why}\n`
            );
            expect(records()).toEqual([]);
            expect(notices()).toEqual([]);
            expect(selfState()).toMatchObject({ readFailingSince: at });
          }
        );

        it('has no note with a token that GitHub accepted', () => {
          installToken();
          answers('500');
          const result = tick({ SELF_DEPLOY_NOW: String(at) });
          expect(result.stdout).toContain(
            'could not read the image builds on main: GitHub answered 500\n'
          );
        });

        it.each([
          ['the default', undefined, 1800],
          ['SELF_DEPLOY_STALL_SECONDS', '300', 300]
        ])('notices once it lasts %s', (_, stall, seconds) => {
          const env: Record<string, string> = stall
            ? { SELF_DEPLOY_STALL_SECONDS: stall }
            : {};
          answers('500');
          tick({ ...env, SELF_DEPLOY_NOW: String(at) });
          tick({ ...env, SELF_DEPLOY_NOW: String(at + seconds - 1) });
          expect(records()).toEqual([]);
          expect(notices()).toEqual([]);

          tick({ ...env, SELF_DEPLOY_NOW: String(at + seconds) });
          expect(records()).toEqual([
            {
              tag: OLD_TAG,
              phase: 'stuck',
              reason: 'GitHub reads fail: GitHub answered 500',
              by: 'self',
              previous: null,
              failed: null,
              at: iso(at + seconds)
            }
          ]);
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toContain(
            'agent-host: the self-deploy cannot read GitHub (GitHub answered 500)'
          );

          tick({ ...env, SELF_DEPLOY_NOW: String(at + seconds * 2) });
          expect(records()).toHaveLength(1);
          expect(notices()).toHaveLength(1);
        });

        it('forgets a failure that ended before the stall, without a record or notice', () => {
          answers('500');
          tick({ SELF_DEPLOY_NOW: String(at) });
          rmSync(fakePath('runs-status'));
          const result = tick({ SELF_DEPLOY_NOW: String(at + 60) });
          expect(result.stdout).not.toContain('GitHub reads again');
          expect(records()).toEqual([]);
          expect(notices()).toEqual([]);
          expect(selfState()).toMatchObject({ readFailingSince: null });

          answers('500');
          tick({ SELF_DEPLOY_NOW: String(at + 1800) });
          expect(notices()).toEqual([]);
        });
      });

      describe('no green build in the newest 20 runs', () => {
        beforeEach(() =>
          writeFileSync(
            fakePath('runs.json'),
            JSON.stringify({
              workflow_runs: [
                {
                  status: 'completed',
                  conclusion: 'failure',
                  head_sha: '9'.repeat(40)
                }
              ]
            })
          )
        );

        it('is logged, and is no failed read: no state, record or notice, ever', () => {
          for (const later of [0, 1800, 10_000]) {
            const result = tick({ SELF_DEPLOY_NOW: String(at + later) });
            expect(result.stdout).toContain(
              'no green build in the newest 20 runs on main'
            );
            expect(result.stdout).not.toContain('could not read');
          }
          expect(records()).toEqual([]);
          expect(notices()).toEqual([]);
          expect(existsSync(path('self-deploy.json'))).toBe(false);
        });

        it('ends a stall like a good read', () => {
          writeFileSync(
            path('self-deploy.json'),
            JSON.stringify({
              readFailingSince: at,
              readNoticed: true,
              record: { tag: OLD_TAG, phase: 'ok' }
            })
          );
          const result = tick({ SELF_DEPLOY_NOW: String(at + 600) });
          expect(result.stdout).toContain('GitHub reads again');
          expect(records()).toEqual([{ tag: OLD_TAG, phase: 'ok' }]);
          expect(selfState()).toMatchObject({
            readFailingSince: null,
            readNoticed: null
          });
        });
      });

      describe('while checking a deploy that differs from main', () => {
        beforeEach(() => {
          checking();
          job(['run.sh']);
        });

        it('holds the verdict past the deadline when main cannot be read', () => {
          answers('500');
          const result = tick({ SELF_DEPLOY_NOW: String(at + 1300) });
          expect(result.stdout).toContain(
            `${OLD_TAG} differs from main (run.sh), and main cannot be read: holding the verdict`
          );
          expect(result.stdout).not.toContain('rolling back');
          expect(selfState()).toMatchObject({ phase: 'checking' });
          expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${OLD_TAG}\n`);
          expect(dockerLog().some((l) => l.startsWith('compose'))).toBe(false);
        });

        it('goes on to a rate limited notice and a stuck record, and checking', () => {
          answers('429', hourly(at + 900));
          const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
          expect(result.stdout).toContain('holding the verdict');
          expect(records().at(-1)).toMatchObject({
            tag: OLD_TAG,
            phase: 'stuck'
          });
          expect(reasonOf(records().at(-1))).toContain(
            `rate limited until ${hhmm(at + 900)}`
          );
          expect(selfState()).toMatchObject({ phase: 'checking' });
          expect(notices()).toHaveLength(1);
        });

        it('still rolls back past the deadline when main has no green build', () => {
          writeFileSync(
            fakePath('runs.json'),
            JSON.stringify({
              workflow_runs: [
                {
                  status: 'completed',
                  conclusion: 'failure',
                  head_sha: '9'.repeat(40)
                }
              ]
            })
          );
          const result = tick({ SELF_DEPLOY_NOW: String(at + 1300) });
          expect(result.stdout).toContain('rolling back');
          expect(selfState()).toMatchObject({ phase: 'rolled-back' });
          expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${PREV_TAG}\n`);
        });

        it('reads the builds once when main built past the deploy', () => {
          runs(NEW);
          const result = tick({ SELF_DEPLOY_NOW: String(at + 300) });
          expect(result.stdout).toContain('main built');
          expect(auth().filter((l) => l.startsWith(RUNS_URL))).toEqual([
            `${RUNS_URL} anon`
          ]);
          expect(read(path('image.env'))).toBe(`AGENT_IMAGE_TAG=${NEW_TAG}\n`);
        });
      });

      it('sends no record for a good read without a stall', () => {
        const result = tick({ SELF_DEPLOY_NOW: String(at) });
        expect(result.status).toBe(0);
        expect(records()).toEqual([]);
        expect(notices()).toEqual([]);
        expect(existsSync(path('self-deploy.json'))).toBe(false);
      });
    });
  }
);
