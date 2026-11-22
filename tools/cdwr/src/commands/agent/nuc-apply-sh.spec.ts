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

// Serves compare, contents and raw files from what the test writes, and logs every url
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
  */compare/*)
    [ -e "$d/compare-fail" ] && exit 22
    printf '{"status":"%s"}' "$(cat "$d/status")"
    ;;
  */contents/*)
    [ -e "$d/contents-fail" ] && exit 22
    cat "$d/contents.json"
    ;;
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

describe.skipIf(!hasBash || isRoot)('nuc-apply.sh', () => {
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
        ...env
      },
      encoding: 'utf8'
    });

  const pending = () => join(root, 'state', 'pending');

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
});
