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
  new URL('../../../../../apps/agent-host/nuc/nuc-sync.sh', import.meta.url)
);

const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
const hasGnuDate =
  spawnSync('date', ['-u', '-d', '@0', '+%Y']).stdout?.toString().trim() ===
  '1970';

const GATE = '/opt/agent-queue/deploy-gate.sh';

// Answers the two GitHub reads from the shas the test writes, with the status (<name>-status, 500
// for <name>-fail, <name>-status-signed when the token signs it) and headers (<name>-headers) it
// wrote, else 200. Logs every url, and whether the read was signed, never the token.
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
  case "$status" in 2??) printf '%s' "$2" > "$out" ;; *) : > "$out" ;; esac
  printf '%s' "$status"
  [ "$status" = 000 ] && exit 28
  exit 0
}
case "$url" in
  */commits?sha=*) rest folder "[{\\"sha\\": \\"$(cat "$d/folder-sha")\\"}]" ;;
  */commits/main) rest head "{\\"sha\\": \\"$(cat "$d/head-sha")\\"}" ;;
  *) exit 22 ;;
esac
`;

// Stands in for the root installer: prints the file's JSON, or fails with a reason
const FAKE_SUDO = `#!/bin/bash
d="$FAKE_DIR"
echo "$*" >> "$d/sudo.log"
if [ -e "$d/sudo-fail" ]; then
  cat "$d/sudo-fail" >&2
  exit "$(cat "$d/sudo-code" 2>/dev/null || echo 1)"
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
  if [ "$4" = notify ]; then
    echo "$5" >> "$d/notify.log"
    [ ! -e "$d/notify-fail" ] || exit 1
  fi
fi
exit 0
`;

const hhmm = (seconds: number) =>
  `${new Date(seconds * 1000).toISOString().slice(11, 16)}Z`;

const TOKEN = `ghp_${'A1'.repeat(12)}`;

const P1 = 'a'.repeat(40);
const P2 = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);

describe.skipIf(!hasBash || !hasGnuDate)(
  'nuc-sync.sh',
  { timeout: 20_000 },
  () => {
    requireTools('jq');
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

    const tokenFile = () => join(root, 'github-read.token');

    const tick = (env: Record<string, string> = {}) =>
      spawnSync('bash', [SCRIPT], {
        env: {
          PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
          HOME: root,
          TMPDIR: join(root, 'tmp'),
          FAKE_DIR: fake,
          NUC_SYNC_DIR: dir,
          NUC_SYNC_API: 'https://api.test',
          NUC_SYNC_TOKEN_FILE: tokenFile(),
          NUC_SYNC_NOW: String(now),
          ...env
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

    describe('reading GitHub', () => {
      const auth = () => lines(fakePath('auth.log'));
      const readState = () =>
        JSON.parse(read(join(dir, 'nuc-sync-read.json'))) as Record<
          string,
          unknown
        >;
      const answers = (
        name: 'head' | 'folder',
        status: string,
        headers = ''
      ) => {
        writeFileSync(fakePath(`${name}-status`), status);
        writeFileSync(fakePath(`${name}-headers`), headers);
      };
      const HEAD_URL =
        'https://api.test/repos/codeware-sthlm/cdwr/commits/main';
      const FOLDER_URL = `https://api.test/repos/codeware-sthlm/cdwr/commits?sha=${HEAD}&path=apps/agent-host/nuc&per_page=1`;
      const anon = () => `read anonymously, no token in ${tokenFile()}`;

      describe('the token', () => {
        it.each([
          ['a token', `${TOKEN}\n`, 'signed'],
          ['no file', null, 'anon'],
          ['a malformed file', 'not a token\n', 'anon']
        ])('reads with %s as %s', (_, content, how) => {
          previous(P1, 'ok', true);
          if (content !== null) writeFileSync(tokenFile(), content);
          const result = tick();
          expect(result.status).toBe(0);
          expect(auth()).toEqual([
            `${HEAD_URL} ${how}`,
            `${FOLDER_URL} ${how}`
          ]);
          expect(result.stdout.includes('holds no token')).toBe(
            content !== null && how === 'anon'
          );
        });

        it('reads once more without it when it is refused, and the next read too', () => {
          previous(P1, 'ok', true);
          writeFileSync(tokenFile(), TOKEN);
          writeFileSync(fakePath('head-status-signed'), '401');
          const result = tick();
          expect(result.status).toBe(0);
          expect(auth()).toEqual([
            `${HEAD_URL} signed`,
            `${HEAD_URL} anon`,
            `${FOLDER_URL} anon`
          ]);
          expect(existsSync(join(dir, 'nuc-sync-read.json'))).toBe(false);
        });

        it('names the refused token in the reason when the anonymous read fails too', () => {
          writeFileSync(tokenFile(), TOKEN);
          writeFileSync(fakePath('head-status-signed'), '401');
          writeFileSync(fakePath('head-status'), '500');
          const result = tick();
          expect(result.stdout).toContain(
            `nuc-sync: could not read main's head: GitHub answered 500; read anonymously, GitHub refused the token in ${tokenFile()}\n`
          );
        });

        it('is in no log, output or state file', () => {
          writeFileSync(tokenFile(), TOKEN);
          writeFileSync(fakePath('head-status-signed'), '401');
          writeFileSync(fakePath('head-status'), '500');
          const result = tick({ NUC_SYNC_STALL_SECONDS: '0' });
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

      describe('a failed read', () => {
        it.each([
          ['main’s head', 'head', "could not read main's head"],
          [
            'the folder commit',
            'folder',
            `could not read the newest commit under apps/agent-host/nuc at ${HEAD.slice(0, 7)}`
          ]
        ] as const)(
          'of %s is logged and leaves nuc-apply.json alone',
          (_, name, what) => {
            previous(P2, 'failed', true);
            const before = read(join(dir, 'nuc-apply.json'));
            answers(name, '500');
            const result = tick();
            expect(result.stdout).toContain(
              `nuc-sync: ${what}: GitHub answered 500`
            );
            expect(sudoLog()).toEqual([]);
            expect(read(join(dir, 'nuc-apply.json'))).toBe(before);
            expect(readState()).toEqual({ since: now, noticed: false });
          }
        );

        it.each([
          ['the default', undefined, 1800],
          ['NUC_SYNC_STALL_SECONDS', '300', 300]
        ])('sends one notice once it lasts %s', (_, stall, seconds) => {
          const env: Record<string, string> = stall
            ? { NUC_SYNC_STALL_SECONDS: stall }
            : {};
          answers('head', '500');
          tick({ ...env, NUC_SYNC_NOW: String(now) });
          tick({ ...env, NUC_SYNC_NOW: String(now + seconds - 1) });
          expect(notices()).toEqual([]);

          tick({ ...env, NUC_SYNC_NOW: String(now + seconds) });
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toContain(
            'agent-host: nuc-sync cannot read GitHub (GitHub answered 500)'
          );
          expect(readState()).toEqual({ since: now, noticed: true });

          tick({ ...env, NUC_SYNC_NOW: String(now + seconds * 3) });
          expect(notices()).toHaveLength(1);
        });

        it('waits for the stall on a rate limit too, and names it', () => {
          answers(
            'head',
            '403',
            `x-ratelimit-remaining: 0\nx-ratelimit-reset: ${now + 900}`
          );
          const first = tick();
          expect(first.stdout).toContain(
            `rate limited until ${hhmm(now + 900)}; ${anon()}`
          );
          expect(notices()).toEqual([]);

          tick({ NUC_SYNC_NOW: String(now + 1800) });
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toContain(
            `cannot read GitHub (rate limited until ${hhmm(now + 900)}; ${anon()})`
          );
        });

        it('reads the wait from retry-after', () => {
          answers('head', '429', 'retry-after: 120');
          const result = tick();
          expect(result.stdout).toContain(
            `rate limited until ${hhmm(now + 120)}`
          );
        });

        it('is forgotten at the first good read, so the next failure starts over', () => {
          answers('head', '500');
          tick();
          tick({ NUC_SYNC_NOW: String(now + 1800) });
          expect(notices()).toHaveLength(1);
          expect(existsSync(join(dir, 'nuc-sync-read.json'))).toBe(true);

          rmSync(fakePath('head-status'));
          previous(P1, 'ok', true);
          tick({ NUC_SYNC_NOW: String(now + 2000) });
          expect(existsSync(join(dir, 'nuc-sync-read.json'))).toBe(false);

          answers('head', '500');
          tick({ NUC_SYNC_NOW: String(now + 2100) });
          tick({ NUC_SYNC_NOW: String(now + 2100 + 1799) });
          expect(notices()).toHaveLength(1);
          tick({ NUC_SYNC_NOW: String(now + 2100 + 1800) });
          expect(notices()).toHaveLength(2);
        });

        it('is also forgotten after an apply', () => {
          writeFileSync(
            join(dir, 'nuc-sync-read.json'),
            JSON.stringify({ since: now - 60, noticed: true })
          );
          tick();
          expect(state()).toMatchObject({ sha: P1, phase: 'ok' });
          expect(existsSync(join(dir, 'nuc-sync-read.json'))).toBe(false);
        });
      });

      describe('a refused token', () => {
        const marker = () => join(dir, 'github-read.refused');
        const installToken = (mtime = 1_000_000) => {
          writeFileSync(tokenFile(), `${TOKEN}\n`);
          utimesSync(tokenFile(), mtime, mtime);
        };
        beforeEach(() => {
          previous(P1, 'ok', true);
          installToken();
          writeFileSync(fakePath('head-status-signed'), '401');
        });

        it('marks the file and tells once, and the next ticks read anonymously', () => {
          const first = tick();
          expect(first.stdout).toContain(
            `GitHub refused the token in ${tokenFile()}: reading anonymously until it is replaced`
          );
          expect(read(marker())).toBe('1000000\n');
          expect(read(marker()).trim()).toBe(
            String(Math.floor(statSync(tokenFile()).mtimeMs / 1000))
          );
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toMatch(
            /^agent-host: GitHub refused the read-only token/
          );

          const second = tick();
          expect(second.stdout).not.toContain('GitHub refused');
          expect(auth().slice(3)).toEqual([
            `${HEAD_URL} anon`,
            `${FOLDER_URL} anon`
          ]);
          expect(notices()).toHaveLength(1);
        });

        it('words the anonymous reads after it, a rate limit included', () => {
          tick();
          answers('head', '500');
          const failed = tick();
          expect(failed.stdout).toContain(
            `could not read main's head: GitHub answered 500\n`
          );
          answers(
            'head',
            '403',
            `x-ratelimit-remaining: 0\nx-ratelimit-reset: ${now + 900}`
          );
          const limited = tick();
          expect(limited.stdout).toContain(
            `rate limited until ${hhmm(now + 900)}; read anonymously, GitHub refused the token in ${tokenFile()}`
          );
        });

        it('signs again once the file is replaced', () => {
          tick();
          rmSync(fakePath('head-status-signed'));
          installToken(2_000_000);
          tick();
          expect(auth().at(-2)).toBe(`${HEAD_URL} signed`);
          expect(auth().at(-1)).toBe(`${FOLDER_URL} signed`);
          expect(notices()).toHaveLength(1);
        });

        it('tells again when the new token is refused too', () => {
          tick();
          installToken(2_000_000);
          tick();
          expect(read(marker())).toBe('2000000\n');
          expect(notices()).toHaveLength(2);
        });
      });

      describe('the stall notice', () => {
        it('marks noticed only once the notice was taken', () => {
          writeFileSync(fakePath('notify-fail'), '');
          answers('head', '500');
          const env = { NUC_SYNC_STALL_SECONDS: '0' };
          const first = tick(env);
          expect(first.stdout).toContain('the notice failed');
          expect(readState()).toEqual({ since: now, noticed: false });
          tick(env);
          expect(notices()).toHaveLength(2);

          rmSync(fakePath('notify-fail'));
          tick(env);
          expect(notices()).toHaveLength(3);
          expect(readState()).toEqual({ since: now, noticed: true });
          tick(env);
          expect(notices()).toHaveLength(3);
        });
      });

      describe('nuc-apply exit 75', () => {
        const rateLimited = `nuc-apply: could not compare ${P1.slice(0, 7)} with main: rate limited until 08:15Z`;
        beforeEach(() => {
          fails(`installing\n${rateLimited}\n\n`);
          writeFileSync(fakePath('sudo-code'), '75');
        });

        it('is a read failure: no state, no record, no failed notice, again next tick', () => {
          const first = tick();
          expect(first.status).toBe(0);
          expect(first.stdout).toContain(
            `nuc-sync: nuc-apply of ${P1.slice(0, 7)} could not read GitHub: could not compare ${P1.slice(0, 7)} with main: rate limited until 08:15Z`
          );
          expect(existsSync(join(dir, 'nuc-apply.json'))).toBe(false);
          expect(existsSync(fakePath('docker.log'))).toBe(false);
          expect(notices()).toEqual([]);

          tick();
          expect(sudoLog()).toEqual([
            `-n /usr/local/sbin/nuc-apply ${P1}`,
            `-n /usr/local/sbin/nuc-apply ${P1}`
          ]);
          expect(existsSync(join(dir, 'nuc-apply.json'))).toBe(false);
        });

        it('leaves an earlier nuc-apply.json as it was', () => {
          previous(P2, 'ok', true);
          const before = read(join(dir, 'nuc-apply.json'));
          tick();
          expect(read(join(dir, 'nuc-apply.json'))).toBe(before);
        });

        it('sends the read notice once it lasts, with the reason, and applies when it clears', () => {
          tick();
          tick({ NUC_SYNC_NOW: String(now + 1800) });
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toContain(
            `cannot read GitHub (could not compare ${P1.slice(0, 7)} with main: rate limited until 08:15Z)`
          );
          expect(notices()[0]).not.toContain('failed');

          rmSync(fakePath('sudo-fail'));
          rmSync(fakePath('sudo-code'));
          tick({ NUC_SYNC_NOW: String(now + 2100) });
          expect(sudoLog()).toHaveLength(3);
          expect(state()).toMatchObject({ sha: P1, phase: 'ok' });
          expect(existsSync(join(dir, 'nuc-sync-read.json'))).toBe(false);
          expect(notices()).toHaveLength(1);
        });

        it('is not the same as another failure, which still records failed', () => {
          writeFileSync(fakePath('sudo-code'), '1');
          tick();
          expect(state()).toMatchObject({ phase: 'failed' });
          expect(notices()).toHaveLength(1);
          expect(notices()[0]).toContain('nuc-apply of');
        });
      });
    });
  }
);
