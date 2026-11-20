import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireTools } from '../../testing/require-tools';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/deploy-gate.sh', import.meta.url)
);

describe('deploy-gate.sh', () => {
  requireTools('zsh', 'jq');

  let root: string;
  let home: string;
  let proc: string;

  const run = (args: string[], input?: string, script = SCRIPT) =>
    spawnSync('zsh', [script, ...args], {
      input,
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: root,
        AGENT_QUEUE_HOME: home,
        DEPLOY_GATE_PROC: proc
      },
      encoding: 'utf8'
    });

  const state = () => run(['state']).stdout.trim();
  const liveProc = (pid: number, cmdline?: string) => {
    mkdirSync(join(proc, String(pid)), { recursive: true });
    if (cmdline !== undefined) {
      writeFileSync(join(proc, String(pid), 'cmdline'), cmdline);
    }
  };
  const lock = (name: string, pid?: number) => {
    mkdirSync(join(home, name), { recursive: true });
    if (pid !== undefined) writeFileSync(join(home, name, 'pid'), `${pid}\n`);
  };
  const age = (path: string) => {
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(path, old, old);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deploy-gate-sh-'));
    home = join(root, 'home');
    proc = join(root, 'proc');
    mkdirSync(home);
    mkdirSync(proc);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('state', () => {
    it('is none without locks', () => {
      expect(state()).toBe('none');
    });

    it('is working while the run lock names a live pid', () => {
      liveProc(4242);
      lock('lock', 4242);
      expect(state()).toBe('working');
    });

    it('is none when the run lock names a dead pid', () => {
      lock('lock', 4242);
      expect(state()).toBe('none');
    });

    it('is working for a young lock without a pid yet', () => {
      lock('lock');
      expect(state()).toBe('working');
    });

    it('is none for an old lock without a pid', () => {
      lock('lock');
      age(join(home, 'lock'));
      expect(state()).toBe('none');
    });

    it('is working while a live implement lock has no waiting session', () => {
      liveProc(100);
      lock('implement.lock', 100);
      expect(state()).toBe('working');
    });

    it('is waiting when the implement lock waits in wait.sh', () => {
      liveProc(100);
      liveProc(200, 'zsh\0/opt/agent-queue/wait.sh\0COD-1\0');
      lock('implement.lock', 100);
      writeFileSync(join(home, 'implement.lock', 'waiting'), '200\n');
      expect(state()).toBe('waiting');
    });

    it('is working when the waiting pid is not wait.sh', () => {
      liveProc(100);
      liveProc(200, 'claude\0--print\0');
      lock('implement.lock', 100);
      writeFileSync(join(home, 'implement.lock', 'waiting'), '200\n');
      expect(state()).toBe('working');
    });

    it('is working when the waiting pid is gone', () => {
      liveProc(100);
      lock('implement.lock', 100);
      writeFileSync(join(home, 'implement.lock', 'waiting'), '200\n');
      expect(state()).toBe('working');
    });

    it('is none when the implement lock is dead', () => {
      lock('implement.lock', 100);
      expect(state()).toBe('none');
    });

    it('lets the run lock win over a waiting implement lock', () => {
      liveProc(100);
      liveProc(200, 'wait.sh');
      liveProc(300);
      lock('implement.lock', 100);
      writeFileSync(join(home, 'implement.lock', 'waiting'), '200\n');
      lock('lock', 300);
      expect(state()).toBe('working');
    });
  });

  describe('pause and unpause', () => {
    it('prints created, then kept', () => {
      const first = run(['pause']);
      expect(first.stdout.trim()).toBe('created');
      expect(existsSync(join(home, 'paused'))).toBe(true);
      expect(run(['pause']).stdout.trim()).toBe('kept');
      expect(existsSync(join(home, 'paused'))).toBe(true);
    });

    it('removes the paused file, also when there is none', () => {
      run(['pause']);
      expect(run(['unpause']).status).toBe(0);
      expect(existsSync(join(home, 'paused'))).toBe(false);
      expect(run(['unpause']).status).toBe(0);
    });
  });

  describe('job', () => {
    it('prints job.json', () => {
      writeFileSync(join(home, 'job.json'), '{"imageSha":"abc"}\n');
      const result = run(['job']);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ imageSha: 'abc' });
    });

    it('prints nothing and succeeds without job.json', () => {
      const result = run(['job']);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    });
  });

  describe('record', () => {
    const read = () =>
      JSON.parse(readFileSync(join(home, 'deploy.json'), 'utf8')) as unknown;

    it('keeps only the known fields', () => {
      const result = run(
        ['record'],
        JSON.stringify({
          tag: 'sha-abc1234',
          previous: 'sha-def5678',
          at: '2026-01-01T00:00:00Z',
          by: 'self',
          phase: 'checking',
          reason: 'why',
          failed: 'sha-0000000',
          extra: 'dropped',
          token: 'secret'
        })
      );
      expect(result.status).toBe(0);
      expect(read()).toEqual({
        tag: 'sha-abc1234',
        previous: 'sha-def5678',
        at: '2026-01-01T00:00:00Z',
        by: 'self',
        phase: 'checking',
        reason: 'why',
        failed: 'sha-0000000'
      });
      expect(existsSync(join(home, 'deploy.json.tmp'))).toBe(false);
    });

    it('turns missing and non-string values into null', () => {
      const result = run(
        ['record'],
        JSON.stringify({ tag: 'sha-abc1234', at: 5, by: ['x'], phase: {} })
      );
      expect(result.status).toBe(0);
      expect(read()).toEqual({
        tag: 'sha-abc1234',
        previous: null,
        at: null,
        by: null,
        phase: null,
        reason: null,
        failed: null
      });
    });

    it.each(['[]', '"x"', '5', 'null', 'not json', ''])(
      'rejects %s with exit 2 and writes nothing',
      (input) => {
        const result = run(['record'], input);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('JSON object');
        expect(existsSync(join(home, 'deploy.json'))).toBe(false);
      }
    );
  });

  describe('nuc-record', () => {
    const read = () =>
      JSON.parse(readFileSync(join(home, 'nuc-apply.json'), 'utf8')) as unknown;

    it('keeps only the known fields', () => {
      const result = run(
        ['nuc-record'],
        JSON.stringify({
          sha: 'a'.repeat(40),
          main: 'b'.repeat(40),
          at: '2026-01-01T00:00:00Z',
          phase: 'ok',
          changed: ['units', 'sudoers'],
          reason: 'why',
          extra: 'dropped',
          token: 'secret'
        })
      );
      expect(result.status).toBe(0);
      expect(read()).toEqual({
        sha: 'a'.repeat(40),
        main: 'b'.repeat(40),
        at: '2026-01-01T00:00:00Z',
        phase: 'ok',
        changed: ['units', 'sudoers'],
        reason: 'why'
      });
      expect(existsSync(join(home, 'nuc-apply.json.tmp'))).toBe(false);
    });

    it('turns missing and non-string values into null', () => {
      const result = run(
        ['nuc-record'],
        JSON.stringify({ sha: 'a'.repeat(40), main: 5, at: ['x'], phase: {} })
      );
      expect(result.status).toBe(0);
      expect(read()).toEqual({
        sha: 'a'.repeat(40),
        main: null,
        at: null,
        phase: null,
        changed: null,
        reason: null
      });
    });

    it('drops non-strings from changed', () => {
      run(
        ['nuc-record'],
        JSON.stringify({ changed: ['units', 5, null, {}, 'x'] })
      );
      expect(read()).toMatchObject({ changed: ['units', 'x'] });
    });

    it.each(['"units"', '{"a":1}', '5', 'null'])(
      'makes changed null when it is %s',
      (changed) => {
        run(['nuc-record'], `{"changed": ${changed}}`);
        expect(read()).toMatchObject({ changed: null });
      }
    );

    it.each(['[]', '"x"', '5', 'null', 'not json', ''])(
      'rejects %s with exit 2 and writes nothing',
      (input) => {
        const result = run(['nuc-record'], input);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('JSON object');
        expect(existsSync(join(home, 'nuc-apply.json'))).toBe(false);
      }
    );
  });

  describe('notify', () => {
    it('calls notify.sh beside the script, urgent from self-deploy, with the joined message', () => {
      const bin = join(root, 'bin');
      mkdirSync(bin);
      const gate = join(bin, 'deploy-gate.sh');
      copyFileSync(SCRIPT, gate);
      writeFileSync(
        join(bin, 'notify.sh'),
        `#!/bin/sh\nprintf '%s|' "$#" "$@" > "${join(root, 'notified')}"\n`,
        { mode: 0o755 }
      );
      const result = run(
        ['notify', 'rolled', 'back', 'sha-1'],
        undefined,
        gate
      );
      expect(result.status).toBe(0);
      expect(readFileSync(join(root, 'notified'), 'utf8')).toBe(
        '5|--level|urgent|--source|self-deploy|rolled back sha-1|'
      );
    });

    it('needs a message', () => {
      const result = run(['notify']);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('notify takes a message');
    });
  });

  it.each([[[]], [['bogus']]])('exits 2 with usage for %j', (args) => {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage: deploy-gate.sh');
  });
});
