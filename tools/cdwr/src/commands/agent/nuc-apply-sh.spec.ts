import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireTools } from '../../testing/require-tools';

const SCRIPT = fileURLToPath(
  new URL('../../../../../apps/agent-host/nuc/nuc-apply.sh', import.meta.url)
);

const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
const isRoot = process.getuid?.() === 0;

// Serves compare, contents and raw files from what the test writes. A REST read answers with the
// status (<name>-status, 500 for <name>-fail, <name>-status-signed when the token signs it) and
// headers (<name>-headers) the test wrote, else 200. Logs every url, and whether the read was
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
  case "$status" in 2??) printf '%s' "$2" > "$out" ;; *) : > "$out" ;; esac
  printf '%s' "$status"
  [ "$status" = 000 ] && exit 28
  exit 0
}
case "$url" in
  */compare/*) rest compare "{\\"status\\":\\"$(cat "$d/status")\\"}" ;;
  */contents/*) rest contents "$(cat "$d/contents.json")" ;;
  https://raw.test/*)
    name="\${url##*/}"
    [ -e "$d/raw-fail-$name" ] && exit 22
    cat "$d/files/$name" > "$out"
    ;;
  *) exit 22 ;;
esac
`;

// Copies like install(1) without the chown, and logs owner and mode
const FAKE_INSTALL = `#!/bin/bash
d="$FAKE_DIR"
m="" o="" g=""
while [ $# -gt 2 ]; do
  case "$1" in
    -m) m="$2"; shift 2 ;;
    -o) o="$2"; shift 2 ;;
    -g) g="$2"; shift 2 ;;
    *) shift ;;
  esac
done
echo "-m $m -o $o -g $g $1 -> $2" >> "$d/install.log"
[ -e "$d/install-fail" ] && exit 1
[ -e "$d/install-fail-$(basename "$2")" ] && exit 1
cp "$1" "$2" && chmod "$m" "$2"
`;

const FAKE_SYSTEMCTL = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/systemctl.log"
[ -e "$FAKE_DIR/systemctl-fail" ] && exit 1
exit 0
`;

const FAKE_FLOCK = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/flock.log"
[ -e "$FAKE_DIR/locked" ] && exit 1
exit 0
`;

const SHA = 'a'.repeat(40);
const TOKEN = `ghp_${'A1'.repeat(12)}`;
// The hour GitHub says the limit resets, from an epoch in the header
const hhmm = (seconds: number) =>
  `${new Date(seconds * 1000).toISOString().slice(11, 16)}Z`;

describe.skipIf(!hasBash || isRoot)('nuc-apply.sh', { timeout: 20_000 }, () => {
  requireTools('jq');
  let root: string;
  let fake: string;
  let sbin: string;
  let units: string;

  const fakePath = (name: string) => join(fake, name);
  const read = (file: string) => readFileSync(file, 'utf8');
  const lines = (name: string) =>
    existsSync(fakePath(name))
      ? read(fakePath(name)).split('\n').filter(Boolean)
      : [];

  /** The folder at the sha: each name with its content */
  const folder = (files: Record<string, string>, extra: object[] = []) => {
    mkdirSync(fakePath('files'), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(fakePath('files'), name), content);
    }
    writeFileSync(
      fakePath('contents.json'),
      JSON.stringify([
        ...Object.keys(files).map((name) => ({ type: 'file', name })),
        ...extra
      ])
    );
  };

  const run = (args: string[] = [SHA], env: Record<string, string> = {}) =>
    spawnSync('bash', [SCRIPT, ...args], {
      env: {
        PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
        HOME: root,
        TMPDIR: join(root, 'tmp'),
        FAKE_DIR: fake,
        NUC_APPLY_API: 'https://api.test',
        NUC_APPLY_RAW: 'https://raw.test',
        NUC_APPLY_SBIN: sbin,
        NUC_APPLY_UNITS: units,
        NUC_APPLY_LOCK: join(root, 'nuc-apply.lock'),
        NUC_APPLY_PENDING: pending(),
        NUC_APPLY_TOKEN_FILE: tokenFile(),
        ...env
      },
      encoding: 'utf8'
    });

  const pending = () => join(root, 'state', 'pending');
  const tokenFile = () => join(root, 'github-read.token');

  const out = (result: ReturnType<typeof run>) =>
    JSON.parse(result.stdout) as { sha: string; changed: string[] };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nuc-apply-sh-'));
    fake = join(root, 'fake');
    sbin = join(root, 'sbin');
    units = join(root, 'units');
    const bin = join(root, 'bin');
    for (const d of [fake, sbin, units, bin, join(root, 'tmp')]) mkdirSync(d);
    writeFileSync(join(bin, 'curl'), FAKE_CURL, { mode: 0o755 });
    writeFileSync(join(bin, 'install'), FAKE_INSTALL, { mode: 0o755 });
    writeFileSync(join(bin, 'systemctl'), FAKE_SYSTEMCTL, { mode: 0o755 });
    writeFileSync(join(bin, 'flock'), FAKE_FLOCK, { mode: 0o755 });
    writeFileSync(fakePath('status'), 'behind');
    folder({
      'self-deploy.sh': 'deploy v2\n',
      'cdwr-agent-deploy.service': 'service v2\n',
      'cdwr-agent-deploy.timer': 'timer v2\n',
      'nuc-apply.sh': 'installer v2\n'
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('its temp folder', () => {
    it('is gone after a successful run', () => {
      const result = run();
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain('unbound variable');
      expect(readdirSync(join(root, 'tmp'))).toEqual([]);
    });

    it('is gone after a failed fetch', () => {
      writeFileSync(fakePath('raw-fail-cdwr-agent-deploy.timer'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('could not fetch');
      expect(result.stderr).not.toContain('unbound variable');
      expect(readdirSync(join(root, 'tmp'))).toEqual([]);
    });
  });

  describe('its argument', () => {
    it.each([
      [[]],
      [['abc']],
      [[SHA.toUpperCase()]],
      [[SHA, SHA]],
      [['/home/cdwr/cdwr']],
      [[`${SHA}x`]]
    ])('refuses %j before reading anything', (args) => {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('usage: nuc-apply');
      expect(lines('curl.log')).toEqual([]);
      expect(lines('flock.log')).toEqual([]);
    });
  });

  describe('the commit', () => {
    it.each(['behind', 'identical'])('installs a sha main is %s', (status) => {
      writeFileSync(fakePath('status'), status);
      expect(run().status).toBe(0);
      expect(lines('curl.log')[0]).toBe(
        `https://api.test/repos/codeware-sthlm/cdwr/compare/main...${SHA}`
      );
    });

    it.each(['ahead', 'diverged'])(
      'refuses a sha that is %s of main',
      (status) => {
        writeFileSync(fakePath('status'), status);
        const result = run();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(`main does not contain aaaaaaa`);
        expect(lines('install.log')).toEqual([]);
      }
    );

    it('refuses when the compare cannot be read', () => {
      writeFileSync(fakePath('compare-fail'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('could not compare');
      expect(lines('install.log')).toEqual([]);
    });

    it('stops when another run holds the lock', () => {
      writeFileSync(fakePath('locked'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('another nuc-apply holds');
      expect(lines('curl.log')).toEqual([]);
    });
  });

  describe('the folder', () => {
    it('lists the folder at the sha and fetches each file from raw at the sha', () => {
      run();
      const urls = lines('curl.log');
      expect(urls[1]).toBe(
        `https://api.test/repos/codeware-sthlm/cdwr/contents/apps/agent-host/nuc?ref=${SHA}`
      );
      expect(urls.slice(2).sort()).toEqual(
        [
          'cdwr-agent-deploy.service',
          'cdwr-agent-deploy.timer',
          'nuc-apply.sh',
          'self-deploy.sh'
        ].map(
          (n) =>
            `https://raw.test/codeware-sthlm/cdwr/${SHA}/apps/agent-host/nuc/${n}`
        )
      );
    });

    it.each(['README.md', 'Self-Deploy.sh', 'x.conf', '..sh', 'a_b.sh'])(
      'installs nothing when the folder holds %s',
      (name) => {
        folder({ 'self-deploy.sh': 'deploy v2\n', [name]: 'x\n' });
        const result = run();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('has no fixed target');
        expect(lines('install.log')).toEqual([]);
      }
    );

    it('installs nothing when the folder holds a subfolder', () => {
      folder({ 'self-deploy.sh': 'deploy v2\n' }, [
        { type: 'dir', name: 'more' }
      ]);
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('is a dir, not a file');
      expect(lines('install.log')).toEqual([]);
    });

    it('installs nothing when one file cannot be fetched', () => {
      writeFileSync(fakePath('raw-fail-cdwr-agent-deploy.timer'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'could not fetch cdwr-agent-deploy.timer'
      );
      expect(lines('install.log')).toEqual([]);
    });

    it('installs nothing when the folder cannot be listed', () => {
      writeFileSync(fakePath('contents-fail'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('could not list');
      expect(lines('install.log')).toEqual([]);
    });
  });

  describe('the install', () => {
    it('installs each file at its fixed target, owned by root, the installer last', () => {
      const result = run();
      expect(result.status).toBe(0);
      expect(read(join(sbin, 'self-deploy.sh'))).toBe('deploy v2\n');
      expect(read(join(units, 'cdwr-agent-deploy.service'))).toBe(
        'service v2\n'
      );
      expect(read(join(units, 'cdwr-agent-deploy.timer'))).toBe('timer v2\n');
      expect(read(join(sbin, 'nuc-apply'))).toBe('installer v2\n');
      expect(existsSync(join(sbin, 'nuc-apply.sh'))).toBe(false);
      expect(existsSync(join(sbin, '.nuc-apply.new'))).toBe(false);
      expect(statSync(join(sbin, 'self-deploy.sh')).mode & 0o777).toBe(0o755);
      expect(
        statSync(join(units, 'cdwr-agent-deploy.timer')).mode & 0o777
      ).toBe(0o644);

      const installs = lines('install.log');
      expect(installs.every((l) => l.includes('-o root -g root'))).toBe(true);
      expect(installs.at(-1)).toContain(`-> ${join(sbin, '.nuc-apply.new')}`);
      expect(out(result)).toEqual({
        sha: SHA,
        changed: [
          'self-deploy.sh',
          'cdwr-agent-deploy.service',
          'cdwr-agent-deploy.timer',
          'nuc-apply.sh'
        ]
      });
    });

    it('reloads, then enables and restarts a changed timer and never a service', () => {
      run();
      expect(lines('systemctl.log')).toEqual([
        'daemon-reload',
        'enable cdwr-agent-deploy.timer',
        'restart cdwr-agent-deploy.timer'
      ]);
    });

    it('installs only what differs', () => {
      writeFileSync(join(sbin, 'self-deploy.sh'), 'deploy v2\n');
      writeFileSync(join(units, 'cdwr-agent-deploy.timer'), 'timer v2\n');
      writeFileSync(join(sbin, 'nuc-apply'), 'installer v2\n');
      const result = run();
      expect(out(result).changed).toEqual(['cdwr-agent-deploy.service']);
      expect(lines('systemctl.log')).toEqual(['daemon-reload']);
    });

    it('touches neither files nor systemd when nothing differs', () => {
      writeFileSync(join(sbin, 'self-deploy.sh'), 'deploy v2\n');
      writeFileSync(join(units, 'cdwr-agent-deploy.service'), 'service v2\n');
      writeFileSync(join(units, 'cdwr-agent-deploy.timer'), 'timer v2\n');
      writeFileSync(join(sbin, 'nuc-apply'), 'installer v2\n');
      const result = run();
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('nothing differs');
      expect(out(result).changed).toEqual([]);
      expect(lines('install.log')).toEqual([]);
      expect(lines('systemctl.log')).toEqual([]);
    });

    it('runs no systemctl when only a script changed', () => {
      folder({ 'self-deploy.sh': 'deploy v3\n' });
      run();
      expect(lines('systemctl.log')).toEqual([]);
    });

    it('never removes a file main deleted', () => {
      writeFileSync(join(sbin, 'backup-agent-home.sh'), 'backup\n');
      writeFileSync(join(units, 'cdwr-agent-backup.timer'), 'backup timer\n');
      run();
      expect(read(join(sbin, 'backup-agent-home.sh'))).toBe('backup\n');
      expect(read(join(units, 'cdwr-agent-backup.timer'))).toBe(
        'backup timer\n'
      );
    });

    it('fails when an install fails', () => {
      writeFileSync(fakePath('install-fail'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('could not install');
      expect(result.stdout).toBe('');
    });

    it('fails when systemd refuses', () => {
      writeFileSync(fakePath('systemctl-fail'), '');
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('daemon-reload failed');
      expect(result.stdout).toBe('');
    });
  });

  describe('a run that failed half way', () => {
    it('reloads and restarts on the next run what systemd never took', () => {
      writeFileSync(join(sbin, 'nuc-apply'), 'installer v2\n');
      writeFileSync(fakePath('systemctl-fail'), '');
      expect(run().status).toBe(1);
      expect(lines('install.log')).toHaveLength(3);
      expect(read(pending())).toBe(
        'cdwr-agent-deploy.service\ncdwr-agent-deploy.timer\n'
      );

      rmSync(fakePath('systemctl-fail'));
      rmSync(fakePath('systemctl.log'));
      rmSync(fakePath('install.log'));
      const result = run();
      expect(result.status).toBe(0);
      expect(lines('install.log')).toEqual([]);
      expect(lines('systemctl.log')).toEqual([
        'daemon-reload',
        'enable cdwr-agent-deploy.timer',
        'restart cdwr-agent-deploy.timer'
      ]);
      expect(existsSync(pending())).toBe(false);
    });

    it('carries a unit installed before a later install failed', () => {
      writeFileSync(join(sbin, 'nuc-apply'), 'installer v2\n');
      writeFileSync(fakePath('install-fail-cdwr-agent-deploy.timer'), '');
      expect(run().status).toBe(1);
      expect(lines('systemctl.log')).toEqual([]);
      expect(read(pending())).toBe('cdwr-agent-deploy.service\n');

      rmSync(fakePath('install-fail-cdwr-agent-deploy.timer'));
      writeFileSync(join(units, 'cdwr-agent-deploy.timer'), 'timer v2\n');
      const result = run();
      expect(result.status).toBe(0);
      expect(out(result).changed).toEqual([]);
      expect(lines('systemctl.log')).toEqual(['daemon-reload']);
      expect(existsSync(pending())).toBe(false);
    });

    it('drops a pending unit main no longer ships', () => {
      mkdirSync(join(root, 'state'));
      writeFileSync(pending(), 'cdwr-agent-old.timer\n');
      folder({ 'self-deploy.sh': 'deploy v3\n' });
      expect(run().status).toBe(0);
      expect(lines('systemctl.log')).toEqual([]);
      expect(existsSync(pending())).toBe(false);
    });
  });

  describe('reading GitHub', () => {
    const auth = () => lines('auth.log');
    const rest = () => auth().filter((l) => l.startsWith('https://api.test/'));
    const COMPARE_URL = `https://api.test/repos/codeware-sthlm/cdwr/compare/main...${SHA}`;
    const CONTENTS_URL = `https://api.test/repos/codeware-sthlm/cdwr/contents/apps/agent-host/nuc?ref=${SHA}`;
    const answers = (name: string, status: string, headers = '') => {
      writeFileSync(fakePath(`${name}-status`), status);
      writeFileSync(fakePath(`${name}-headers`), headers);
    };
    const reset = Math.floor(Date.now() / 1000) + 900;
    const limited = `x-ratelimit-remaining: 0\nx-ratelimit-reset: ${reset}`;
    const anonymous = () => `read anonymously, no token in ${tokenFile()}`;

    describe('the token', () => {
      it.each([
        ['a token', `${TOKEN}\n`, 'signed'],
        ['no file', null, 'anon'],
        ['a malformed file', 'not a token\n', 'anon']
      ])('reads with %s as %s', (_, content, how) => {
        if (content !== null) writeFileSync(tokenFile(), content);
        const result = run();
        expect(result.status).toBe(0);
        expect(rest()).toEqual([
          `${COMPARE_URL} ${how}`,
          `${CONTENTS_URL} ${how}`
        ]);
        expect(result.stderr.includes('holds no token')).toBe(
          content !== null && how === 'anon'
        );
      });

      it('never signs the raw downloads', () => {
        writeFileSync(tokenFile(), TOKEN);
        run();
        const raw = auth().filter((l) => l.startsWith('https://raw.test/'));
        expect(raw).toHaveLength(4);
        expect(raw.every((l) => l.endsWith(' anon'))).toBe(true);
      });

      it('reads once more without it when it is refused', () => {
        writeFileSync(tokenFile(), TOKEN);
        writeFileSync(fakePath('compare-status-signed'), '401');
        const result = run();
        expect(result.status).toBe(0);
        expect(rest()).toEqual([
          `${COMPARE_URL} signed`,
          `${COMPARE_URL} anon`,
          `${CONTENTS_URL} anon`
        ]);
      });

      it('words a failing read after it as refused, rate limits included', () => {
        writeFileSync(tokenFile(), TOKEN);
        writeFileSync(fakePath('compare-status-signed'), '401');
        writeFileSync(fakePath('contents-status'), '500');
        const failed = run();
        expect(failed.status).toBe(1);
        expect(failed.stderr).toContain(
          `could not list apps/agent-host/nuc at aaaaaaa: GitHub answered 500; the token in ${tokenFile()} was refused`
        );

        answers('contents', '403', limited);
        const limitedRun = run();
        expect(limitedRun.status).toBe(75);
        expect(limitedRun.stderr).toContain(
          `rate limited until ${hhmm(reset)}; the token in ${tokenFile()} was refused`
        );
      });

      it('forgets the refusal with the run: no marker, and the next run signs again', () => {
        writeFileSync(tokenFile(), TOKEN);
        writeFileSync(fakePath('compare-status-signed'), '401');
        run();
        run();
        expect(
          rest().filter(
            (l) => l.startsWith(COMPARE_URL) && l.endsWith('signed')
          )
        ).toHaveLength(2);
        expect(readdirSync(root).filter((f) => f.endsWith('.refused'))).toEqual(
          []
        );
      });

      it('names the refused token in the reason when the anonymous read fails too', () => {
        writeFileSync(tokenFile(), TOKEN);
        writeFileSync(fakePath('compare-status-signed'), '401');
        writeFileSync(fakePath('compare-status'), '500');
        const result = run();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          `could not compare aaaaaaa with main: GitHub answered 500; the token in ${tokenFile()} was refused`
        );
      });

      it('is in no log or output', () => {
        writeFileSync(tokenFile(), TOKEN);
        writeFileSync(fakePath('compare-status-signed'), '401');
        writeFileSync(fakePath('compare-status'), '500');
        const result = run();
        expect(result.stdout).not.toContain(TOKEN);
        expect(result.stderr).not.toContain(TOKEN);
        const files = readdirSync(fake)
          .filter((f) => f !== 'files')
          .map((f) => join(fake, f));
        expect(files.length).toBeGreaterThan(3);
        for (const f of files) expect(read(f)).not.toContain(TOKEN);
        expect(read(fakePath('curl.argv'))).toContain('-H @/dev/fd/');
      });
    });

    describe('rate limited', () => {
      it.each([
        [
          'the compare on the hourly limit',
          'compare',
          '403',
          () => limited,
          () =>
            `could not compare aaaaaaa with main: rate limited until ${hhmm(reset)}; ${anonymous()}`,
          1
        ],
        [
          'the compare on a 429 with retry-after',
          'compare',
          '429',
          () => 'retry-after: 120',
          () => 'could not compare aaaaaaa with main: rate limited until',
          1
        ],
        [
          'the contents on the hourly limit',
          'contents',
          '403',
          () => limited,
          () =>
            `could not list apps/agent-host/nuc at aaaaaaa: rate limited until ${hhmm(reset)}; ${anonymous()}`,
          2
        ]
      ])(
        'exits 75 with nothing installed on %s',
        (_, name, status, headers, reason, reads) => {
          answers(name, status, headers());
          const result = run();
          expect(result.status).toBe(75);
          expect(result.stdout).toBe('');
          expect(result.stderr).toContain(reason());
          expect(result.stderr).toMatch(/rate limited until \d\d:\d\dZ/);
          expect(rest()).toHaveLength(reads);
          expect(lines('install.log')).toEqual([]);
          expect(lines('systemctl.log')).toEqual([]);
          expect(readdirSync(join(root, 'tmp'))).toEqual([]);
        }
      );

      it('leaves out the anonymous hint when the token signed the read', () => {
        writeFileSync(tokenFile(), TOKEN);
        answers('compare', '403', limited);
        const result = run();
        expect(result.status).toBe(75);
        expect(result.stderr).toContain(
          `with main: rate limited until ${hhmm(reset)}\n`
        );
      });

      it.each([
        ['a 403 without limit headers', '403', '', 'GitHub answered 403'],
        [
          'a 403 with requests left',
          '403',
          'x-ratelimit-remaining: 12',
          'GitHub answered 403'
        ],
        ['a 500', '500', '', 'GitHub answered 500'],
        ['no answer', '000', '', 'GitHub answered no answer']
      ])('still fails with exit 1 on %s', (_, status, headers, why) => {
        answers('compare', status, headers);
        const result = run();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          `could not compare aaaaaaa with main: ${why}`
        );
        expect(lines('install.log')).toEqual([]);
      });
    });
  });
});
