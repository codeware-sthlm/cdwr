import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../../../apps/agent-host/nuc/nuc-sync.sh', import.meta.url)
);

const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
const hasJq = spawnSync('jq', ['--version']).status === 0;
const hasGnuDate =
  spawnSync('date', ['-u', '-d', '@0', '+%Y']).stdout?.toString().trim() ===
  '1970';

const GATE = '/opt/agent-queue/deploy-gate.sh';

// Answers the two GitHub reads from the shas the test writes, and logs every url
const FAKE_CURL = `#!/bin/bash
d="$FAKE_DIR"
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -H|--max-time) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" >> "$d/curl.log"
case "$url" in
  */commits?sha=*)
    [ -e "$d/folder-fail" ] && exit 22
    echo "[{\\"sha\\": \\"$(cat "$d/folder-sha")\\"}]"
    ;;
  */commits/main)
    [ -e "$d/head-fail" ] && exit 22
    echo "{\\"sha\\": \\"$(cat "$d/head-sha")\\"}"
    ;;
  *) exit 22 ;;
esac
`;

// Stands in for the root installer: prints the file's JSON, or fails with a reason
const FAKE_SUDO = `#!/bin/bash
d="$FAKE_DIR"
echo "$*" >> "$d/sudo.log"
if [ -e "$d/sudo-fail" ]; then
  cat "$d/sudo-fail" >&2
  exit 1
fi
cat "$d/sudo-out"
exit 0
`;

const FAKE_DOCKER = `#!/bin/bash
d="$FAKE_DIR"
echo "$*" >> "$d/docker.log"
if [ "$1" = exec ]; then
  shift
  if [ "$1" = -i ]; then
    shift
    if [ "$3" = nuc-record ]; then
      cat > "$d/nuc-record.in"
      [ -e "$d/record-fail" ] && exit 1
    fi
    exit 0
  fi
  # exec cdwr-agent <secrets.sh> <gate> notify <text>
  if [ "$4" = notify ]; then echo "$5" >> "$d/notify.log"; fi
fi
exit 0
`;

const P1 = 'a'.repeat(40);
const P2 = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);

describe.skipIf(!hasBash || !hasJq || !hasGnuDate)('nuc-sync.sh', () => {
  let root: string;
  let dir: string;
  let fake: string;

  const now = 1_800_000_000;
  const iso = new Date(now * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

  const fakePath = (name: string) => join(fake, name);
  const read = (file: string) => readFileSync(file, 'utf8');
  const lines = (file: string) =>
    existsSync(file) ? read(file).split('\n').filter(Boolean) : [];
  const sudoLog = () => lines(fakePath('sudo.log'));
  const curlLog = () => lines(fakePath('curl.log'));
  const notices = () => lines(fakePath('notify.log'));
  const state = () =>
    JSON.parse(read(join(dir, 'nuc-apply.json'))) as Record<string, unknown>;
  const recorded = () =>
    JSON.parse(read(fakePath('nuc-record.in'))) as Record<string, unknown>;

  const folder = (sha: string) => writeFileSync(fakePath('folder-sha'), sha);
  const applies = (changed: string[] = ['units']) =>
    writeFileSync(fakePath('sudo-out'), JSON.stringify({ sha: P1, changed }));
  const fails = (stderr: string) =>
    writeFileSync(fakePath('sudo-fail'), stderr);
  const previous = (sha: string, phase = 'ok', recordedFlag = false) =>
    writeFileSync(
      join(dir, 'nuc-apply.json'),
      JSON.stringify({
        sha,
        main: HEAD,
        at: iso,
        phase,
        changed: [],
        reason: null,
        ...(recordedFlag ? { recorded: true } : {})
      })
    );
  const withoutRecorded = (value: Record<string, unknown>) => {
    const { recorded: _recorded, ...rest } = value;
    return rest;
  };

  const tick = () =>
    spawnSync('bash', [SCRIPT], {
      env: {
        PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
        HOME: root,
        TMPDIR: join(root, 'tmp'),
        FAKE_DIR: fake,
        NUC_SYNC_DIR: dir,
        NUC_SYNC_API: 'https://api.test',
        NUC_SYNC_NOW: String(now)
      },
      encoding: 'utf8'
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nuc-sync-sh-'));
    dir = join(root, 'opt');
    fake = join(root, 'fake');
    const bin = join(root, 'bin');
    mkdirSync(dir);
    mkdirSync(fake);
    mkdirSync(bin);
    mkdirSync(join(root, 'tmp'));
    writeFileSync(join(bin, 'curl'), FAKE_CURL, { mode: 0o755 });
    writeFileSync(join(bin, 'sudo'), FAKE_SUDO, { mode: 0o755 });
    writeFileSync(join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 });
    writeFileSync(fakePath('head-sha'), HEAD);
    folder(P1);
    applies();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('when the folder commit is already handled', () => {
    it.each(['ok', 'failed'])('does nothing when it was %s', (phase) => {
      previous(P1, phase);
      const result = tick();
      expect(result.status).toBe(0);
      expect(sudoLog()).toEqual([]);
      expect(notices()).toEqual([]);
      expect(state()).toMatchObject({ sha: P1, phase });
    });

    it('makes no docker call at all when it was recorded', () => {
      previous(P1, 'ok', true);
      const result = tick();
      expect(result.status).toBe(0);
      expect(existsSync(fakePath('docker.log'))).toBe(false);
      expect(sudoLog()).toEqual([]);
      expect(notices()).toEqual([]);
      expect(state()).toMatchObject({ sha: P1, recorded: true });
    });
  });

  describe('when nuc-record fails', () => {
    beforeEach(() => writeFileSync(fakePath('record-fail'), ''));

    it('leaves recorded unset, then records again without sudo or a notice', () => {
      const first = tick();
      expect(first.status).toBe(0);
      expect(sudoLog()).toHaveLength(1);
      expect(state()).toMatchObject({ sha: P1, phase: 'ok' });
      expect(state()['recorded']).toBeUndefined();

      rmSync(fakePath('record-fail'));
      const second = tick();
      expect(second.status).toBe(0);
      expect(sudoLog()).toHaveLength(1);
      expect(notices()).toEqual([]);
      expect(state()['recorded']).toBe(true);
      expect(recorded()).toEqual(withoutRecorded(state()));
      expect(
        lines(fakePath('docker.log')).filter((l) => l.includes('nuc-record'))
      ).toHaveLength(2);
    });

    it('does not announce a failed apply again while recording again', () => {
      fails('the real reason\n');
      tick();
      expect(notices()).toHaveLength(1);
      expect(state()['recorded']).toBeUndefined();

      rmSync(fakePath('record-fail'));
      tick();
      expect(sudoLog()).toHaveLength(1);
      expect(notices()).toHaveLength(1);
      expect(state()['recorded']).toBe(true);
    });
  });

  describe('its temp file', () => {
    it.each(['applied', 'failed'])('is gone after a tick that %s', (kind) => {
      if (kind === 'failed') fails('a reason\n');
      const result = tick();
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain('unbound variable');
      expect(readdirSync(join(root, 'tmp'))).toEqual([]);
    });

    it('leaves none and no unbound variable when the commit is handled', () => {
      previous(P1);
      const result = tick();
      expect(result.stderr).not.toContain('unbound variable');
      expect(readdirSync(join(root, 'tmp'))).toEqual([]);
    });
  });

  describe('when the folder commit is new', () => {
    it('runs nuc-apply on it without a file', () => {
      const result = tick();
      expect(result.status).toBe(0);
      expect(sudoLog()).toEqual([`-n /usr/local/sbin/nuc-apply ${P1}`]);
    });

    it('runs nuc-apply when it differs from the file', () => {
      previous(P2);
      tick();
      expect(sudoLog()).toEqual([`-n /usr/local/sbin/nuc-apply ${P1}`]);
    });

    it('writes nuc-apply.json and records the same body', () => {
      applies(['units', 'sudoers']);
      const result = tick();
      expect(result.status).toBe(0);
      expect(state()).toEqual({
        sha: P1,
        main: HEAD,
        at: iso,
        phase: 'ok',
        changed: ['units', 'sudoers'],
        reason: null,
        recorded: true
      });
      expect(recorded()).not.toHaveProperty('recorded');
      expect(recorded()).toEqual(withoutRecorded(state()));
      expect(lines(fakePath('docker.log'))).toContain(
        `exec -i cdwr-agent ${GATE} nuc-record`
      );
      expect(notices()).toEqual([]);
      expect(existsSync(join(dir, 'nuc-apply.json.tmp'))).toBe(false);
    });

    it('is ok with an empty change list', () => {
      applies([]);
      tick();
      expect(state()).toMatchObject({ phase: 'ok', changed: [] });
    });

    it('reads main’s head first, then the folder commit at that head', () => {
      tick();
      const urls = curlLog();
      expect(urls).toHaveLength(2);
      expect(urls[0]).toMatch(/\/commits\/main$/);
      expect(urls[1]).toContain(
        `commits?sha=${HEAD}&path=apps/agent-host/nuc&per_page=1`
      );
    });
  });

  describe('a failed apply', () => {
    beforeEach(() => fails('first line\nthe real reason\n\n  \n'));

    it('records failed with the last non-empty stderr line and one notice', () => {
      const result = tick();
      expect(result.status).toBe(0);
      expect(state()).toEqual({
        sha: P1,
        main: HEAD,
        at: iso,
        phase: 'failed',
        changed: [],
        reason: 'the real reason',
        recorded: true
      });
      expect(recorded()).not.toHaveProperty('recorded');
      expect(recorded()).toEqual(withoutRecorded(state()));
      expect(notices()).toHaveLength(1);
      expect(notices()[0]).toContain(P1.slice(0, 7));
      expect(notices()[0]).toContain('the real reason');
    });

    it('is not retried or announced again for the same commit', () => {
      tick();
      tick();
      expect(sudoLog()).toHaveLength(1);
      expect(notices()).toHaveLength(1);
    });

    it('runs again for a newer commit', () => {
      tick();
      folder(P2);
      tick();
      expect(sudoLog()).toEqual([
        `-n /usr/local/sbin/nuc-apply ${P1}`,
        `-n /usr/local/sbin/nuc-apply ${P2}`
      ]);
      expect(state()).toMatchObject({ sha: P2, phase: 'failed' });
      expect(notices()).toHaveLength(2);
    });

    it('gives a reason when nuc-apply said nothing', () => {
      fails('');
      tick();
      expect(state()).toMatchObject({
        phase: 'failed',
        reason: 'nuc-apply exited without a reason'
      });
    });
  });

  it('counts output that is not JSON as failed', () => {
    writeFileSync(fakePath('sudo-out'), 'not json at all\n');
    const result = tick();
    expect(result.status).toBe(0);
    expect(state()).toMatchObject({ sha: P1, phase: 'failed', changed: [] });
    expect(notices()).toHaveLength(1);
  });

  describe('when GitHub cannot be read', () => {
    it('runs nothing when the folder commit fails', () => {
      writeFileSync(fakePath('folder-fail'), '');
      const result = tick();
      expect(result.status).toBe(0);
      expect(sudoLog()).toEqual([]);
      expect(existsSync(join(dir, 'nuc-apply.json'))).toBe(false);
      expect(notices()).toEqual([]);
    });

    it('runs nothing when main’s head fails', () => {
      writeFileSync(fakePath('head-fail'), '');
      const result = tick();
      expect(result.status).toBe(0);
      expect(sudoLog()).toEqual([]);
      expect(existsSync(join(dir, 'nuc-apply.json'))).toBe(false);
      expect(notices()).toEqual([]);
    });
  });
});
