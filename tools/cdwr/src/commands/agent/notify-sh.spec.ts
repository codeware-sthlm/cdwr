import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/notify.sh', import.meta.url)
);

const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe.skipIf(!hasZsh)('notify.sh', () => {
  let dir: string;
  let body: string;

  const run = (env: Record<string, string>, input: unknown) =>
    spawnSync('zsh', [SCRIPT], {
      input: JSON.stringify(input),
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: dir,
        AGENT_QUEUE_CURL_CMD: `cat > "${body}"`,
        ...env
      },
      encoding: 'utf8'
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'notify-sh-'));
    body = join(dir, 'body.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('posts the message under the project name', () => {
    const result = run(
      { SLACK_WEBHOOK_URL: 'https://hooks.example/x' },
      { message: 'COD-1: plan ready', cwd: '/work/cdwr' }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(body, 'utf8'))).toEqual({
      text: '*cdwr*: COD-1: plan ready'
    });
  });

  it('falls back to CLAUDE_SLACK_WEBHOOK and then the webhook file', () => {
    run({ CLAUDE_SLACK_WEBHOOK: 'https://hooks.example/y' }, { message: 'm' });
    expect(existsSync(body)).toBe(true);
    rmSync(body);
    mkdtempSync(join(dir, 'x-'));
    spawnSync('mkdir', ['-p', join(dir, '.claude')]);
    writeFileSync(
      join(dir, '.claude', 'slack-webhook'),
      'https://hooks.example/z\n'
    );
    run({}, { message: 'm' });
    expect(existsSync(body)).toBe(true);
  });

  // A session under dontAsk can't pass `$PWD` or a jq filter: any `$` gets the command denied
  it('takes the message as arguments, from the current directory', () => {
    const cwd = join(dir, 'cdwr');
    spawnSync('mkdir', ['-p', cwd]);
    const result = spawnSync('zsh', [SCRIPT, 'COD-1: stuck,', "it's denied"], {
      cwd,
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: dir,
        AGENT_QUEUE_CURL_CMD: `cat > "${body}"`,
        SLACK_WEBHOOK_URL: 'https://hooks.example/x'
      },
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(body, 'utf8'))).toEqual({
      text: "*cdwr*: COD-1: stuck, it's denied"
    });
  });

  it('does nothing without a webhook', () => {
    const result = run({}, { message: 'm' });
    expect(result.status).toBe(0);
    expect(existsSync(body)).toBe(false);
  });
});
