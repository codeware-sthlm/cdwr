import { execFile, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { requireTools } from '../../testing/require-tools';

const WRAPPER = fileURLToPath(
  new URL('../../../../../apps/agent-host/with-gh-token.sh', import.meta.url)
);
const GITHUB_APP = fileURLToPath(
  new URL('../../../agent-queue/github-app.sh', import.meta.url)
);

const exec = promisify(execFile);
const hasOpenssl = spawnSync('openssl', ['version']).status === 0;

const APP_ID = '5282871';
const INSTALLATION_ID = '170690985';
const TOKEN = `ghs_5${'A1_'.repeat(14)}.${'b2-'.repeat(80)}.${'C3_'.repeat(30)}`;

describe.skipIf(!hasOpenssl)('with-gh-token.sh', () => {
  requireTools('zsh');

  let dir: string;
  let server: Server;
  let api: string;
  let exchange: 'ok' | 'error' | 'no-token' = 'ok';

  const wrapper = (
    runDir: string,
    command: string[]
  ): Promise<{ status: number; stdout: string; stderr: string }> =>
    exec('zsh', [WRAPPER, ...command], {
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: dir,
        AGENT_HOST_GITHUB_APP: GITHUB_APP,
        AGENT_HOST_RUN_DIR: runDir,
        AGENT_QUEUE_GITHUB_API: api
      }
    }).then(
      ({ stdout, stderr }) => ({ status: 0, stdout, stderr }),
      (error: { code?: number; stdout: string; stderr: string }) => ({
        status: error.code ?? 1,
        stdout: error.stdout,
        stderr: error.stderr
      })
    );

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'with-gh-token-sh-'));
    const key = join(dir, 'app.pem');
    spawnSync('openssl', [
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      'rsa_keygen_bits:2048',
      '-out',
      key
    ]);
    chmodSync(key, 0o600);
    writeFileSync(
      join(dir, 'app.env'),
      [
        `AGENT_GITHUB_APP_ID=${APP_ID}`,
        `AGENT_GITHUB_APP_INSTALLATION_ID=${INSTALLATION_ID}`,
        `AGENT_GITHUB_APP_KEY_PATH=${key}`
      ].join('\n')
    );

    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(json));
        };
        if (
          req.method === 'POST' &&
          req.url === `/app/installations/${INSTALLATION_ID}/access_tokens`
        ) {
          if (exchange === 'error') {
            send(500, { message: 'Server Error' });
          } else if (exchange === 'no-token') {
            send(201, { expires_at: '2026-10-12T20:00:00Z' });
          } else {
            send(201, { token: TOKEN, expires_at: '2026-10-12T20:00:00Z' });
          }
        } else {
          send(404, { message: 'Not Found' });
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('no port');
    }
    api = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    // Unset when requireTools failed the suite first
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    exchange = 'ok';
  });

  it('runs the command with the minted token as GH_TOKEN', async () => {
    const result = await wrapper(dir, ['sh', '-c', 'printf %s "$GH_TOKEN"']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(TOKEN);
  });

  it('exits 75 with the reason, and never runs the command, when it cannot mint', async () => {
    const empty = mkdtempSync(join(dir, 'empty-'));
    const marker = join(dir, 'ran');
    const result = await wrapper(empty, ['touch', marker]);
    expect(result.status).toBe(75);
    expect(result.stderr).toContain('github app:');
    expect(existsSync(marker)).toBe(false);
  });

  it.each([
    ['an error status', 'error'],
    ['an answer without a token', 'no-token']
  ] as const)(
    'exits 75 and never runs the command when the exchange gives %s',
    async (_name, mode) => {
      exchange = mode;
      const marker = join(dir, `ran-${mode}`);
      const result = await wrapper(dir, ['touch', marker]);
      expect(result.status).toBe(75);
      expect(result.stderr).toContain('github app:');
      expect(existsSync(marker)).toBe(false);
    }
  );
});
