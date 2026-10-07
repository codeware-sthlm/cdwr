// @vitest-environment node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { writeOfflineCache } from '@codeware/shared/util/infisical-cli';
import type { ExecutorContext } from '@nx/devkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import infisicalRun from './executor';
import type { InfisicalRunExecutorSchema } from './schema';

const FAKE_INFISICAL = `#!/bin/sh
touch "$FAKE_INFISICAL_MARKER"
case "$*" in
  *"secrets folders get"*) echo '[]' ;;
  *) echo '[{"key":"DATABASE_URL","value":"postgresql://postgres:postgres@localhost:5432/cms"},{"key":"SEED_SOURCE","value":"off"},{"key":"PAYLOAD_SECRET_KEY","value":"vault-secret"}]' ;;
esac
`;

const DEV_DB = 'postgresql://postgres:postgres@localhost:5432/cms';
const E2E_DB = 'postgresql://postgres:postgres@localhost:5433/cms-e2e';

const WRITE_ENV = `node -e "require('fs').writeFileSync('out.json', JSON.stringify({DATABASE_URL:process.env.DATABASE_URL,SEED_SOURCE:process.env.SEED_SOURCE,PAYLOAD_SECRET_KEY:process.env.PAYLOAD_SECRET_KEY}))"`;

const KEYS = [
  'CI',
  'OFFLINE',
  'DEPLOY_ENV',
  'DATABASE_URL',
  'SEED_SOURCE',
  'PAYLOAD_SECRET_KEY'
] as const;

let root: string;
let bin: string;
let savedEnv: Record<string, string | undefined>;

const context = (): ExecutorContext => ({
  root,
  cwd: root,
  isVerbose: false,
  projectName: 'cms',
  targetName: 'dev',
  projectsConfigurations: {
    version: 2,
    projects: { cms: { root: 'apps/cms' } }
  }
});

const options = (
  overrides: Partial<InfisicalRunExecutorSchema> = {}
): InfisicalRunExecutorSchema => ({
  path: '/apps/cms',
  commands: [WRITE_ENV],
  ...overrides
});

const childSaw = (): Record<string, string | undefined> =>
  JSON.parse(readFileSync(join(root, 'apps/cms/out.json'), 'utf8'));

const marker = () => join(root, 'infisical-called');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'infisical-run-'));
  bin = join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(root, 'apps/cms'), { recursive: true });
  writeFileSync(join(bin, 'infisical'), FAKE_INFISICAL);
  chmodSync(join(bin, 'infisical'), 0o755);
  writeFileSync(
    join(root, 'apps/cms/.env'),
    `PAYLOAD_SECRET_KEY=secret\nDATABASE_URL=${DEV_DB}\n`
  );

  savedEnv = {
    PATH: process.env['PATH'],
    FAKE_INFISICAL_MARKER: process.env['FAKE_INFISICAL_MARKER'],
    ...Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
  };
  for (const key of KEYS) delete process.env[key];
  process.env['PATH'] = `${bin}${delimiter}${process.env['PATH'] ?? ''}`;
  process.env['FAKE_INFISICAL_MARKER'] = marker();

  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('infisicalRun', () => {
  it.each([
    {
      name: 'a database set by the shell beats the vault',
      env: { DATABASE_URL: E2E_DB },
      target: {},
      expected: { DATABASE_URL: E2E_DB, PAYLOAD_SECRET_KEY: 'vault-secret' }
    },
    {
      name: 'a value the target sets beats the vault',
      env: {},
      target: { env: { SEED_SOURCE: 'local' } },
      expected: { SEED_SOURCE: 'local', DATABASE_URL: DEV_DB }
    },
    {
      name: 'a target env value equal to the committed one still beats the vault',
      env: {},
      target: { env: { PAYLOAD_SECRET_KEY: 'secret' } },
      expected: { PAYLOAD_SECRET_KEY: 'secret', SEED_SOURCE: 'off' }
    },
    {
      name: 'a value equal to the committed placeholder yields to the vault',
      env: { PAYLOAD_SECRET_KEY: 'secret' },
      target: {},
      expected: { PAYLOAD_SECRET_KEY: 'vault-secret', SEED_SOURCE: 'off' }
    }
  ])('$name', async ({ env, target, expected }) => {
    Object.assign(process.env, env);

    const result = await infisicalRun(options(target), context());

    expect(result).toEqual({ success: true });
    expect(childSaw()).toMatchObject(expected);
  });

  it('skips Infisical in CI and passes the inherited values on', async () => {
    process.env['CI'] = 'true';
    process.env['DATABASE_URL'] = E2E_DB;

    const result = await infisicalRun(options(), context());

    expect(result).toEqual({ success: true });
    expect(existsSync(marker())).toBe(false);
    expect(childSaw()).toMatchObject({ DATABASE_URL: E2E_DB });
    expect(childSaw().PAYLOAD_SECRET_KEY).toBeUndefined();
  });

  describe('offline', () => {
    beforeEach(() => {
      process.env['OFFLINE'] = '1';
    });

    it('reads the cache and never calls Infisical', async () => {
      writeOfflineCache(join(root, 'apps/cms/.env.offline'), {
        environment: 'development',
        paths: ['/apps/cms'],
        values: { PAYLOAD_SECRET_KEY: 'cached-secret' }
      });

      const result = await infisicalRun(options(), context());

      expect(result).toEqual({ success: true });
      expect(existsSync(marker())).toBe(false);
      expect(childSaw()).toMatchObject({ PAYLOAD_SECRET_KEY: 'cached-secret' });
    });

    it('fails when there is no cache', async () => {
      const result = await infisicalRun(options(), context());

      expect(result).toEqual({ success: false });
      expect(existsSync(join(root, 'apps/cms/out.json'))).toBe(false);
    });
  });

  it('stops at the first failing command', async () => {
    const result = await infisicalRun(
      options({
        commands: ['node -e "process.exit(3)"', WRITE_ENV]
      }),
      context()
    );

    expect(result).toEqual({ success: false });
    expect(existsSync(join(root, 'apps/cms/out.json'))).toBe(false);
  });

  it('reads the committed files Nx loads for the target, not other targets', async () => {
    writeFileSync(join(root, 'apps/cms/.env.dev'), 'SEED_SOURCE=from-dev\n');
    writeFileSync(
      join(root, 'apps/cms/.env.build'),
      'DATABASE_URL=from-build\n'
    );
    process.env['SEED_SOURCE'] = 'from-dev';
    process.env['DATABASE_URL'] = 'from-build';

    await infisicalRun(options(), context());

    // equal to a committed dev value, so the vault replaces it; build's file is not read
    expect(childSaw()).toMatchObject({
      SEED_SOURCE: 'off',
      DATABASE_URL: 'from-build'
    });
  });

  it('ends the sequence when a signal stops a command', async () => {
    const handlers: Array<() => void> = [];
    const on = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: () => void
    ) => {
      if (event === 'SIGINT') handlers.push(handler);
      return on(event, handler);
    }) as typeof process.on);

    const running = infisicalRun(
      options({
        commands: ['node -e "setTimeout(() => undefined, 10000)"', WRITE_ENV]
      }),
      context()
    );
    await new Promise((done) => setTimeout(done, 500));
    handlers.forEach((handler) => handler());

    expect(await running).toEqual({ success: false });
    expect(existsSync(join(root, 'apps/cms/out.json'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'stops a grandchild with the command',
    async () => {
      const handlers: Array<() => void> = [];
      const on = process.on.bind(process);
      vi.spyOn(process, 'on').mockImplementation(((
        event: string,
        handler: () => void
      ) => {
        if (event === 'SIGINT') handlers.push(handler);
        return on(event, handler);
      }) as typeof process.on);

      const pidFile = join(root, 'apps/cms/grandchild.pid');
      const script = `const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); require('fs').writeFileSync('grandchild.pid', String(c.pid)); setInterval(() => {}, 1000)`;
      const running = infisicalRun(
        options({ commands: [`node -e "${script.replace(/"/g, '\\"')}"`] }),
        context()
      );
      const until = async (done: () => boolean) => {
        const deadline = Date.now() + 10000;
        while (!done() && Date.now() < deadline) {
          await new Promise((tick) => setTimeout(tick, 50));
        }
      };
      await until(
        () => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== ''
      );
      const grandchild = Number(readFileSync(pidFile, 'utf8'));
      expect(() => process.kill(grandchild, 0)).not.toThrow();

      handlers.forEach((handler) => handler());
      expect(await running).toEqual({ success: false });

      const gone = () => {
        try {
          process.kill(grandchild, 0);
          return false;
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === 'ESRCH';
        }
      };
      await until(gone);
      expect(gone()).toBe(true);
    }
  );

  it('prints the failure of Infisical, never its output', async () => {
    writeFileSync(
      join(bin, 'infisical'),
      '#!/bin/sh\necho SECRET-SENTINEL not json\n'
    );

    const result = await infisicalRun(options(), context());

    expect(result).toEqual({ success: false });
    const printed = vi
      .mocked(console.error)
      .mock.calls.map((call) => call.join(' '))
      .join('\n');
    expect(printed).toContain('not JSON');
    expect(printed).toContain('infisical login');
    expect(printed).not.toContain('SECRET-SENTINEL');
  });

  it('logs the layers without any value', async () => {
    process.env['DATABASE_URL'] = E2E_DB;

    await infisicalRun(options(), context());

    const logged = vi
      .mocked(console.log)
      .mock.calls.map((call) => call.join(' '))
      .join('\n');
    expect(logged).toContain('[SECRETS]');
    expect(logged).not.toContain('vault-secret');
    expect(logged).not.toContain('5433');
  });
});
