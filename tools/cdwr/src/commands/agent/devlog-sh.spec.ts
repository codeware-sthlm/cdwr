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

import { requireTools } from '../../testing/require-tools';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/devlog.sh', import.meta.url)
);

describe('devlog.sh', () => {
  requireTools('zsh');

  let dir: string;
  let bin: string;
  let calls: string;
  let stdinLog: string;
  let crossing: string;

  // Records its arguments and stdin; the same body serves as node and as the crossing
  const stub = (path: string): void => {
    writeFileSync(
      path,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\ncat > "${stdinLog}"\n`
    );
    chmodSync(path, 0o755);
  };

  const run = (args: string[], env: Record<string, string> = {}, input = '') =>
    spawnSync('zsh', [SCRIPT, ...args], {
      encoding: 'utf8',
      input,
      env: {
        PATH: `${bin}:${process.env['PATH'] ?? ''}`,
        ...env
      }
    });

  const inContainer = { AGENT_QUEUE_HOST: 'container' };

  const recorded = (): string[] =>
    existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [];

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'devlog-sh-')));
    bin = join(dir, 'bin');
    calls = join(dir, 'calls');
    stdinLog = join(dir, 'stdin');
    crossing = join(dir, 'crossing');
    mkdirSync(bin);
    stub(join(bin, 'node'));
    stub(crossing);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs the CLI outside the container', () => {
    const r = run(['covered', '--json'], { AGENT_QUEUE_HOST: '' });
    expect(r.status).toBe(0);
    const [call] = recorded();
    expect(call).toMatch(/cdwr\.mjs devlog covered --json$/);
    expect(call).toContain('tools/cdwr/bin/');
  });

  it('sends the post on stdin through the crossing in the container', () => {
    const file = join(dir, 'post.md');
    writeFileSync(file, '# A post\n\nbody\n');
    const r = run(
      ['draft', '--file', file, '--covers', '1,2', '--yes', '--json'],
      { ...inContainer, AGENT_QUEUE_DEVLOG_CROSSING: crossing }
    );
    expect(r.status).toBe(0);
    expect(recorded()).toEqual(['draft --covers 1,2 --yes --json']);
    expect(readFileSync(stdinLog, 'utf8')).toBe('# A post\n\nbody\n');
  });

  it('refuses a draft without a readable --file', () => {
    for (const args of [
      ['draft', '--covers', '1'],
      ['draft', '--file', join(dir, 'missing.md'), '--covers', '1']
    ]) {
      const r = run(args, {
        ...inContainer,
        AGENT_QUEUE_DEVLOG_CROSSING: crossing
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('--file');
    }
    expect(recorded()).toEqual([]);
  });

  it('passes covered through with no stdin in the container', () => {
    const r = run(
      ['covered', '--json'],
      { ...inContainer, AGENT_QUEUE_DEVLOG_CROSSING: crossing },
      'should not arrive'
    );
    expect(r.status).toBe(0);
    expect(recorded()).toEqual(['covered --json']);
    expect(readFileSync(stdinLog, 'utf8')).toBe('');
  });
});
