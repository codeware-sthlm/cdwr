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
  new URL('../../../../../apps/agent-host/devlog-cms.sh', import.meta.url)
);

// The script fixes its PATH and checkout, so only the argument checks run here. Each refusal
// must leave before node, which a marker file would show.
describe('devlog-cms.sh argument checks', () => {
  requireTools('zsh');

  let dir: string;
  let marker: string;

  const run = (...args: string[]) =>
    spawnSync('zsh', [SCRIPT, ...args], {
      encoding: 'utf8',
      input: '# post\n',
      env: {
        PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`,
        AGENT_QUEUE_VAULT_FILE: join(dir, 'no-vault.env')
      }
    });

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'devlog-cms-sh-')));
    marker = join(dir, 'node-called');
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin', 'node'), `#!/bin/sh\ntouch "${marker}"\n`);
    chmodSync(join(dir, 'bin', 'node'), 0o755);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['a covers value with a shell metacharacter', ['draft', '--covers', '1;x']],
    ['a covers value that is not digits', ['draft', '--covers', 'a,b']],
    ['a trailing comma in covers', ['draft', '--covers', '1,']],
    ['no covers', ['draft', '--yes']],
    ['--covers without a value', ['draft', '--covers']],
    ['--file', ['draft', '--covers', '1', '--file', '/etc/passwd']],
    ['an unknown subcommand', ['publish']],
    ['no subcommand', []],
    ['an extra argument to covered', ['covered', '--json', 'extra']],
    ['--covers on covered', ['covered', '--covers', '1']]
  ])('refuses %s', (_name, args) => {
    const r = run(...args);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: devlog-cms.sh');
    expect(existsSync(marker)).toBe(false);
  });
});

// The size check follows `cd /work/codeware-agent`, which a Mac lacks, so it is read, not run
describe('devlog-cms.sh post size', () => {
  const script = readFileSync(SCRIPT, 'utf8');

  it('refuses a post over 200000 bytes with exit 2, never cutting it short', () => {
    expect(script).toContain('head -c 200001 > "$tmp/post.md"');
    expect(script).toContain(
      'if (( $(wc -c < "$tmp/post.md") > 200000 )); then'
    );
    expect(script).toContain('the post is over 200000 bytes');
    expect(script).toMatch(/over 200000 bytes"\n\s+exit 2/);
    expect(script.indexOf('head -c 200001')).toBeLessThan(
      script.indexOf('--file "$tmp/post.md"')
    );
  });
});
