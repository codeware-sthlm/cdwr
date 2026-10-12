import { execFile, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../agent-queue/github-app.sh', import.meta.url)
);
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');
const code = SCRIPT.split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

const exec = promisify(execFile);
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
const hasOpenssl = spawnSync('openssl', ['version']).status === 0;

const APP_ID = '5282871';
const INSTALLATION_ID = '170690985';
const BOT_ID = 341333370;
// The shape GitHub issues now: three dot-separated base64url segments, 390 characters or so
const TOKEN = `ghs_5${'A1_'.repeat(14)}.${'b2-'.repeat(80)}.${'C3_'.repeat(30)}`;

const b64urlDecode = (text: string): Buffer =>
  Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

describe('github-app.sh', () => {
  it('reads the env file as text, never sourcing or evaluating it', () => {
    expect(code).not.toMatch(/^\s*(source|\.)\s+"?\$file/m);
    expect(code).not.toContain('eval');
    expect(code).toContain('AGENT_GITHUB_APP_(ID|INSTALLATION_ID|KEY_PATH)=*');
  });

  it('signs with openssl and asks for a token that reaches cdwr only', () => {
    expect(code).toContain(
      'openssl dgst -sha256 -sign "$AGENT_GITHUB_APP_KEY_PATH"'
    );
    expect(code).toContain(`-d '{"repositories":["cdwr"]}'`);
  });

  it('answers git from the env token only and never offers an SSH key', () => {
    expect(code).toContain(
      "export GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=''"
    );
    expect(code).toContain('echo "password=$GH_TOKEN"');
    expect(code).toContain("GIT_CONFIG_VALUE_2='git@github.com:'");
    expect(code).toContain('export GIT_SSH_COMMAND=false');
  });

  describe.skipIf(!hasZsh || !hasOpenssl)('run', () => {
    let dir: string;
    let key: string;
    let pub: string;
    let server: Server;
    let api: string;
    let requests: { method: string; url: string; auth: string; body: string }[];
    let exchange: 'ok' | 'denied';

    const envFile = (
      lines: Record<string, string | undefined>,
      extra = ''
    ): string => {
      const file = join(dir, `env-${Math.random().toString(36).slice(2)}`);
      const text = Object.entries(lines)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => `${name}=${value}`)
        .join('\n');
      writeFileSync(
        file,
        `INFISICAL_SERVICE_TOKEN=st.secret\n${text}\n${extra}`
      );
      return file;
    };
    const good = (): string =>
      envFile({
        AGENT_GITHUB_APP_ID: APP_ID,
        AGENT_GITHUB_APP_INSTALLATION_ID: INSTALLATION_ID,
        AGENT_GITHUB_APP_KEY_PATH: key
      });

    const zsh = (
      body: string
    ): Promise<{ status: number; stdout: string; stderr: string }> =>
      exec('zsh', ['-c', `source "${SCRIPT_PATH}"\n${body}`], {
        env: {
          PATH: process.env['PATH'] ?? '',
          HOME: dir,
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
      dir = mkdtempSync(join(tmpdir(), 'github-app-sh-'));
      key = join(dir, 'app.pem');
      pub = join(dir, 'app.pub');
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
      spawnSync('openssl', ['pkey', '-in', key, '-pubout', '-out', pub]);

      server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString()));
        req.on('end', () => {
          requests.push({
            method: req.method ?? '',
            url: req.url ?? '',
            auth: req.headers.authorization ?? '',
            body
          });
          const send = (status: number, json: unknown) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(json));
          };
          if (
            req.method === 'POST' &&
            req.url === `/app/installations/${INSTALLATION_ID}/access_tokens`
          ) {
            if (exchange === 'denied') {
              send(401, { message: 'A JSON web token could not be decoded' });
            } else {
              send(201, {
                token: TOKEN,
                expires_at: '2026-10-12T20:00:00Z',
                repository_selection: 'selected'
              });
            }
          } else if (req.url === '/app') {
            send(200, { slug: 'codeware-agent' });
          } else if (req.url === '/users/codeware-agent%5Bbot%5D') {
            send(200, { id: BOT_ID, login: 'codeware-agent[bot]' });
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
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    });

    beforeEach(() => {
      requests = [];
      exchange = 'ok';
    });

    it.each([
      [
        { AGENT_GITHUB_APP_ID: undefined },
        'AGENT_GITHUB_APP_ID missing or not a number'
      ],
      [
        { AGENT_GITHUB_APP_ID: '52x' },
        'AGENT_GITHUB_APP_ID missing or not a number'
      ],
      [
        { AGENT_GITHUB_APP_INSTALLATION_ID: undefined },
        'AGENT_GITHUB_APP_INSTALLATION_ID missing or not a number'
      ],
      [
        { AGENT_GITHUB_APP_KEY_PATH: undefined },
        'AGENT_GITHUB_APP_KEY_PATH missing or not readable'
      ],
      [
        { AGENT_GITHUB_APP_KEY_PATH: '/nowhere/app.pem' },
        'AGENT_GITHUB_APP_KEY_PATH missing or not readable'
      ]
    ])('fails closed on %j', async (override, reason) => {
      const file = envFile({
        AGENT_GITHUB_APP_ID: APP_ID,
        AGENT_GITHUB_APP_INSTALLATION_ID: INSTALLATION_ID,
        AGENT_GITHUB_APP_KEY_PATH: key,
        ...override
      });
      const result = await zsh(`app_env "${file}"`);
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe(`github app: ${reason}`);
    });

    it('refuses a key file anyone else can read', async () => {
      const loose = join(dir, 'loose.pem');
      writeFileSync(loose, readFileSync(key));
      chmodSync(loose, 0o644);
      const file = envFile({
        AGENT_GITHUB_APP_ID: APP_ID,
        AGENT_GITHUB_APP_INSTALLATION_ID: INSTALLATION_ID,
        AGENT_GITHUB_APP_KEY_PATH: loose
      });
      const result = await zsh(`app_env "${file}"`);
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe(
        `github app: ${loose} must have mode 600`
      );
    });

    it('takes the three variables as text, with quotes and ~, and nothing else', async () => {
      const marker = join(dir, 'evaluated');
      const file = envFile(
        {
          AGENT_GITHUB_APP_ID: `"${APP_ID}"`,
          AGENT_GITHUB_APP_INSTALLATION_ID: `'${INSTALLATION_ID}'`,
          AGENT_GITHUB_APP_KEY_PATH: '~/app.pem'
        },
        `OTHER=$(touch ${marker})\n`
      );
      const result = await zsh(
        `app_env "${file}" && print -r -- "$AGENT_GITHUB_APP_ID $AGENT_GITHUB_APP_INSTALLATION_ID $AGENT_GITHUB_APP_KEY_PATH \${INFISICAL_SERVICE_TOKEN:-unset} \${OTHER:-unset}"`
      );
      expect(result.stdout.trim()).toBe(
        `${APP_ID} ${INSTALLATION_ID} ${key} unset unset`
      );
      expect(existsSync(marker)).toBe(false);
    });

    it('signs a short RS256 JWT for the app that the public key verifies', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await zsh(`app_env "${good()}" && app_jwt`);
      expect(result.status).toBe(0);
      const [header, claims, signature] = result.stdout.trim().split('.');
      expect(JSON.parse(b64urlDecode(header ?? '').toString())).toEqual({
        alg: 'RS256',
        typ: 'JWT'
      });
      const parsed = JSON.parse(b64urlDecode(claims ?? '').toString()) as {
        iat: number;
        exp: number;
        iss: string;
      };
      expect(parsed.iss).toBe(APP_ID);
      expect(parsed.exp - parsed.iat).toBe(600);
      expect(parsed.iat).toBeGreaterThanOrEqual(before - 61);
      expect(parsed.iat).toBeLessThanOrEqual(before - 59 + 2);

      const input = join(dir, 'signed');
      const sig = join(dir, 'sig');
      writeFileSync(input, `${header}.${claims}`);
      writeFileSync(sig, b64urlDecode(signature ?? ''));
      const verify = spawnSync(
        'openssl',
        ['dgst', '-sha256', '-verify', pub, '-signature', sig, input],
        { encoding: 'utf8' }
      );
      expect(verify.stdout.trim()).toBe('Verified OK');
    });

    it('exchanges the JWT for a token on cdwr only and hands the session the bot identity', async () => {
      const result = await zsh(
        [
          `app_env "${good()}" && app_session || exit 1`,
          'print -r -- "token=$GH_TOKEN"',
          'print -r -- "author=$GIT_AUTHOR_NAME <$GIT_AUTHOR_EMAIL>"',
          'print -r -- "committer=$GIT_COMMITTER_NAME <$GIT_COMMITTER_EMAIL>"',
          'print -r -- "ssh=$GIT_SSH_COMMAND"',
          `printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill`,
          'git config --get url.https://github.com/.insteadOf'
        ].join('\n')
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      const bot = `codeware-agent[bot] <${BOT_ID}+codeware-agent[bot]@users.noreply.github.com>`;
      expect(result.stdout.trim().split('\n')).toEqual([
        `token=${TOKEN}`,
        `author=${bot}`,
        `committer=${bot}`,
        'ssh=false',
        'protocol=https',
        'host=github.com',
        'username=x-access-token',
        `password=${TOKEN}`,
        'git@github.com:'
      ]);

      const [mint, app, user] = requests;
      expect(mint?.method).toBe('POST');
      expect(mint?.url).toBe(
        `/app/installations/${INSTALLATION_ID}/access_tokens`
      );
      expect(mint?.body).toBe('{"repositories":["cdwr"]}');
      expect(mint?.auth).toMatch(
        /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
      );
      expect(app?.url).toBe('/app');
      // The bot lookup is the first call made with the installation token
      expect(user?.url).toBe('/users/codeware-agent%5Bbot%5D');
      expect(user?.auth).toBe(`Bearer ${TOKEN}`);
    });

    it('fails closed when GitHub refuses the exchange, with the reason', async () => {
      exchange = 'denied';
      const result = await zsh(
        `app_env "${good()}" && app_session; rc=$?; print -r -- "token=\${GH_TOKEN:-unset}"; exit $rc`
      );
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe(
        'github app: no installation token: A JSON web token could not be decoded'
      );
      expect(result.stdout.trim()).toBe('token=unset');
    });
  });
});
