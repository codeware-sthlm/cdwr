import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
  new URL('../../../../../apps/agent-host/secrets.sh', import.meta.url)
);

const PEM = '-----BEGIN KEY-----\nline2\n-----END KEY-----';
const VAULT = JSON.stringify([
  { key: 'AGENT_GITHUB_APP_KEY', value: PEM },
  { key: 'AGENT_QUEUE_LINEAR_KEY', value: 'vault-linear' },
  { key: 'AGENT_QUEUE_LINEAR_CLIENT_ID', value: 'cid' },
  { key: 'AGENT_QUEUE_LINEAR_CLIENT_SECRET', value: 'csec' },
  { key: 'SLACK_WEBHOOK_URL', value: 'https://hooks/x' },
  { key: 'bad-key', value: 'x' }
]);

// A stand-in for the Infisical CLI: logs in with the env identity, exports the vault above
const STUB = `#!/bin/sh
case "$1" in
  login)
    [ "$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" = sec ] || exit 1
    echo tok123 ;;
  export)
    [ "$INFISICAL_TOKEN" = tok123 ] || exit 1
    printf '%s' "$VAULT_JSON" ;;
esac
`;

// Prints what the exec'd command sees, as one JSON line after the script's own log lines
const PROBE = [
  'jq',
  '-nc',
  '{key: env.AGENT_GITHUB_APP_KEY, linear: env.AGENT_QUEUE_LINEAR_KEY, clientId: env.AGENT_QUEUE_LINEAR_CLIENT_ID, clientSecret: env.AGENT_QUEUE_LINEAR_CLIENT_SECRET, slack: env.SLACK_WEBHOOK_URL, fly: env.FLY_API_TOKEN, desk: env.DESK_FLY_TOKEN, cms: env.CMS_AGENT_API_KEY, secret: env.INFISICAL_CLIENT_SECRET, id: env.INFISICAL_CLIENT_ID, args: $ARGS.positional}',
  '--args',
  'one',
  'two'
];

describe('secrets.sh', () => {
  requireTools('zsh', 'jq');

  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'secrets-sh-'));
    writeFileSync(join(dir, 'infisical'), STUB);
    chmodSync(join(dir, 'infisical'), 0o755);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const runDir = () => join(dir, 'run');

  const run = (env: Record<string, string>, vault = VAULT) =>
    spawnSync('zsh', [SCRIPT, ...PROBE], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env['PATH']}`,
        HOME: dir,
        VAULT_JSON: vault,
        AGENT_HOST_RUN_DIR: runDir(),
        ...env
      }
    });

  const seenBy = (stdout: string) =>
    JSON.parse(stdout.trim().split('\n').at(-1) ?? 'null');

  const secretFile = (name: string) => {
    const path = join(runDir(), name);
    return {
      text: readFileSync(path, 'utf8'),
      mode: statSync(path).mode & 0o777
    };
  };

  const identity = {
    INFISICAL_CLIENT_ID: 'id',
    INFISICAL_CLIENT_SECRET: 'sec',
    INFISICAL_PROJECT_ID: 'p'
  };

  it('fills the environment from the vault and execs the command', () => {
    const result = run(identity);
    expect(result.status).toBe(0);
    const seen = seenBy(result.stdout);
    expect(seen.slack).toBe('https://hooks/x');
    expect(seen.args).toEqual(['one', 'two']);
    expect(result.stderr).toContain('not an env name');
  });

  it('writes the key secrets to the run dir, mode 600, and never exports them', () => {
    const seen = seenBy(run(identity).stdout);
    expect(seen.key).toBeNull();
    expect(seen.linear).toBeNull();
    expect(seen.clientId).toBeNull();
    expect(seen.clientSecret).toBeNull();
    expect(secretFile('app.pem')).toEqual({ text: `${PEM}\n`, mode: 0o600 });
    expect(secretFile('linear.key')).toEqual({
      text: 'vault-linear\n',
      mode: 0o600
    });
    expect(secretFile('linear-app.env')).toEqual({
      text: 'AGENT_QUEUE_LINEAR_CLIENT_ID=cid\nAGENT_QUEUE_LINEAR_CLIENT_SECRET=csec\n',
      mode: 0o600
    });
    expect(readdirSync(runDir()).sort()).toEqual([
      'app.pem',
      'linear-app.env',
      'linear.key'
    ]);
  });

  it('writes the Linear files where the image points', () => {
    const result = run({
      ...identity,
      AGENT_QUEUE_LINEAR_KEY_FILE: join(dir, 'k'),
      AGENT_QUEUE_LINEAR_APP_FILE: join(dir, 'a')
    });
    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'k'), 'utf8')).toBe('vault-linear\n');
    expect(readFileSync(join(dir, 'a'), 'utf8')).toContain('_SECRET=csec');
  });

  it('removes the identity before the command runs', () => {
    const seen = seenBy(run(identity).stdout);
    expect(seen.secret).toBeNull();
    expect(seen.id).toBeNull();
  });

  it('keeps a value the environment sets, and logs names only', () => {
    const result = run({ ...identity, SLACK_WEBHOOK_URL: 'env-slack' });
    expect(seenBy(result.stdout).slack).toBe('env-slack');
    expect(result.stdout + result.stderr).toContain(
      'kept from the environment: SLACK_WEBHOOK_URL'
    );
    expect(result.stdout + result.stderr).not.toContain('hooks/x');
  });

  it('writes a key secret the environment sets, and unsets it', () => {
    const result = run({ ...identity, AGENT_QUEUE_LINEAR_KEY: 'env-linear' });
    expect(seenBy(result.stdout).linear).toBeNull();
    expect(secretFile('linear.key').text).toBe('env-linear\n');
    expect(result.stdout + result.stderr).not.toContain('vault-linear');
  });

  it('lets the vault fill a key the environment leaves empty', () => {
    const result = run({ ...identity, SLACK_WEBHOOK_URL: '' });
    expect(seenBy(result.stdout).slack).toBe('https://hooks/x');
  });

  it('uses the environment as given without an identity', () => {
    const result = run({ SLACK_WEBHOOK_URL: 'plain' });
    expect(result.status).toBe(0);
    expect(seenBy(result.stdout).slack).toBe('plain');
  });

  it('writes the key secrets without an identity too (plain .env mode)', () => {
    const result = run({
      AGENT_GITHUB_APP_KEY: PEM,
      AGENT_QUEUE_LINEAR_KEY: 'plain',
      AGENT_QUEUE_LINEAR_CLIENT_ID: 'cid',
      AGENT_QUEUE_LINEAR_CLIENT_SECRET: 'csec'
    });
    expect(result.status).toBe(0);
    const seen = seenBy(result.stdout);
    expect([seen.key, seen.linear, seen.clientId, seen.clientSecret]).toEqual([
      null,
      null,
      null,
      null
    ]);
    expect(secretFile('app.pem').text).toBe(`${PEM}\n`);
    expect(secretFile('linear.key')).toEqual({ text: 'plain\n', mode: 0o600 });
    expect(secretFile('linear-app.env').text).toContain('_ID=cid');
  });

  it('writes no Linear app file from a client id alone', () => {
    const result = run({ AGENT_QUEUE_LINEAR_CLIENT_ID: 'cid' });
    expect(result.status).toBe(0);
    expect(seenBy(result.stdout).clientId).toBeNull();
    expect(existsSync(join(runDir(), 'linear-app.env'))).toBe(false);
  });

  // A second run (cdwr agent exec) after a key left the vault
  it('removes a file whose secret is gone, and an app file missing half', () => {
    mkdirSync(runDir());
    for (const name of ['app.pem', 'linear.key', 'linear-app.env']) {
      writeFileSync(join(runDir(), name), 'old\n');
    }
    const result = run(
      {
        ...identity,
        AGENT_QUEUE_LINEAR_CLIENT_ID: 'cid',
        AGENT_QUEUE_LINEAR_CLIENT_SECRET: ''
      },
      JSON.stringify([{ key: 'AGENT_GITHUB_APP_KEY', value: PEM }])
    );
    expect(result.status).toBe(0);
    expect(readdirSync(runDir())).toEqual(['app.pem']);
    expect(secretFile('app.pem').text).toBe(`${PEM}\n`);
  });

  it('creates the parent of a Linear file the image points elsewhere', () => {
    const result = run({
      ...identity,
      AGENT_QUEUE_LINEAR_KEY_FILE: join(dir, 'keys', 'linear.key')
    });
    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'keys', 'linear.key'), 'utf8')).toBe(
      'vault-linear\n'
    );
  });

  it('says so when the folder is empty', () => {
    const result = run(identity, '[]');
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('holds no secrets');
    expect(result.stderr).not.toContain('not an env name');
  });

  it.each([
    [
      'a failed login',
      { ...identity, INFISICAL_CLIENT_SECRET: 'bad' },
      'login failed'
    ],
    [
      'a missing project',
      { INFISICAL_CLIENT_ID: 'id', INFISICAL_CLIENT_SECRET: 'sec' },
      'missing INFISICAL_PROJECT_ID'
    ],
    [
      'an unknown site',
      { ...identity, INFISICAL_SITE: 'mars' },
      'must be eu or us'
    ]
  ])('stops on %s without running the command', (_, env, message) => {
    const result = run(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stdout).not.toContain('"args"');
  });

  describe('as the loop', () => {
    const LOOP_VAULT = JSON.stringify([
      { key: 'FLY_API_TOKEN', value: 'fly-secret' },
      { key: 'DESK_FLY_TOKEN', value: 'desk-secret' },
      { key: 'CMS_AGENT_API_KEY', value: 'cms-secret' },
      { key: 'SLACK_WEBHOOK_URL', value: 'https://hooks/x' }
    ]);
    const loop = { ...identity, AGENT_HOST_LOOP: 'jq' };
    const vaultFile = () => join(runDir(), 'vault.env');

    it('keeps the other keys out of the environment, in vault.env', () => {
      const result = run(loop, LOOP_VAULT);
      expect(result.status).toBe(0);
      const seen = seenBy(result.stdout);
      expect([seen.fly, seen.desk, seen.cms]).toEqual([null, null, null]);
      expect(seen.slack).toBe('https://hooks/x');
      expect(secretFile('vault.env')).toEqual({
        text: 'FLY_API_TOKEN=fly-secret\nDESK_FLY_TOKEN=desk-secret\nCMS_AGENT_API_KEY=cms-secret\n',
        mode: 0o600
      });
    });

    it('holds a queue setting that reads like a credential, and keeps one that names a file', () => {
      const result = run(
        loop,
        JSON.stringify([
          { key: 'AGENT_QUEUE_FOO_TOKEN', value: 'foo-secret' },
          { key: 'AGENT_QUEUE_BUDGET_USD', value: '5' }
        ])
      );
      expect(result.status).toBe(0);
      expect(secretFile('vault.env').text).toBe(
        'AGENT_QUEUE_FOO_TOKEN=foo-secret\n'
      );
    });

    it('moves a credential the environment sets out of it too', () => {
      const result = run({ ...loop, FLY_API_TOKEN: 'env-fly' }, LOOP_VAULT);
      expect(result.status).toBe(0);
      expect(seenBy(result.stdout).fly).toBeNull();
      expect(secretFile('vault.env').text).toContain('FLY_API_TOKEN=env-fly\n');
      expect(secretFile('vault.env').text).not.toContain('fly-secret');
    });

    it('logs the names and never a value', () => {
      const result = run(loop, LOOP_VAULT);
      const log = result.stdout + result.stderr;
      expect(log).toContain(
        "out of the loop's environment, in vault.env: FLY_API_TOKEN, DESK_FLY_TOKEN, CMS_AGENT_API_KEY"
      );
      expect(log).not.toMatch(/fly-secret|desk-secret|cms-secret/);
    });

    it('skips a value over several lines', () => {
      const result = run(
        loop,
        JSON.stringify([
          { key: 'FLY_API_TOKEN', value: 'fly-secret' },
          { key: 'CMS_AGENT_API_KEY', value: 'two\nlines' }
        ])
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toContain(
        'skipping CMS_AGENT_API_KEY, its value is not one line'
      );
      expect(secretFile('vault.env').text).toBe('FLY_API_TOKEN=fly-secret\n');
      expect(seenBy(result.stdout).cms).toBeNull();
    });

    it('writes no vault.env without such a key, and removes a stale one', () => {
      mkdirSync(runDir());
      writeFileSync(vaultFile(), 'OLD=1\n');
      const result = run(loop, VAULT);
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).not.toContain(
        "out of the loop's environment"
      );
      expect(existsSync(vaultFile())).toBe(false);
    });

    it('removes a stale vault.env in plain .env mode', () => {
      mkdirSync(runDir());
      writeFileSync(vaultFile(), 'OLD=1\n');
      const result = run({ AGENT_HOST_LOOP: 'jq' });
      expect(result.status).toBe(0);
      expect(existsSync(vaultFile())).toBe(false);
    });

    it('writes where AGENT_QUEUE_VAULT_FILE points', () => {
      const elsewhere = join(dir, 'else', 'v.env');
      mkdirSync(join(dir, 'else'));
      const result = run(
        { ...loop, AGENT_QUEUE_VAULT_FILE: elsewhere },
        LOOP_VAULT
      );
      expect(result.status).toBe(0);
      expect(readFileSync(elsewhere, 'utf8')).toContain(
        'FLY_API_TOKEN=fly-secret\n'
      );
      expect(statSync(elsewhere).mode & 0o777).toBe(0o600);
      expect(existsSync(vaultFile())).toBe(false);
      expect(result.stdout + result.stderr).toContain('in v.env: ');
    });
  });

  describe('as a hand command', () => {
    const HAND_VAULT = JSON.stringify([
      { key: 'FLY_API_TOKEN', value: 'fly-secret' },
      { key: 'CMS_AGENT_API_KEY', value: 'cms-secret' }
    ]);

    it('exports everything and writes no vault.env', () => {
      const result = run(identity, HAND_VAULT);
      expect(result.status).toBe(0);
      const seen = seenBy(result.stdout);
      expect(seen.fly).toBe('fly-secret');
      expect(seen.cms).toBe('cms-secret');
      expect(existsSync(join(runDir(), 'vault.env'))).toBe(false);
    });

    it("leaves the loop's vault.env alone", () => {
      mkdirSync(runDir());
      writeFileSync(join(runDir(), 'vault.env'), 'KEEP=1\n');
      run(identity, HAND_VAULT);
      expect(secretFile('vault.env').text).toBe('KEEP=1\n');
    });
  });
});
