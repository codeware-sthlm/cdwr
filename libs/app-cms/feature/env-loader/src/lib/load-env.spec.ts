import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadEnv } from './load-env';

const { withInfisical } = vi.hoisted(() => ({ withInfisical: vi.fn() }));

vi.mock('@codeware/shared/feature/infisical', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  withInfisical
}));

// Passes once the shared folder's required secret is in place
vi.mock('@codeware/app-cms/util/env-schema', () => ({
  EnvSchema: {
    safeParse: (env: NodeJS.ProcessEnv) =>
      env['PAYLOAD_SECRET_KEY']
        ? { success: true, data: { ...env } }
        : {
            success: false,
            error: { flatten: () => ({ fieldErrors: {} }) }
          }
  }
}));

/** A folder's secrets, `null` when the read fails, `'missing'` when it doesn't exist */
type Folders = Record<string, Record<string, string> | null | 'missing'>;

const pair = (prefix: string) => ({
  TURNSTILE_SITE_KEY: `${prefix}-site`,
  TURNSTILE_SECRET_KEY: `${prefix}-secret`
});

/**
 * Answer each folder read like withInfisical: inject on request, and on a
 * failure return null when silent, else throw the SDK's error
 */
const serve = (folders: Folders) =>
  withInfisical.mockImplementation(
    async ({
      filter,
      injectEnv,
      silent
    }: {
      filter: { path: string; tags?: Array<string> };
      injectEnv?: boolean;
      silent?: boolean;
    }) => {
      if (filter.tags) {
        return [];
      }
      const secrets =
        filter.path in folders ? folders[filter.path] : ({} as const);
      if (secrets === null || secrets === 'missing') {
        if (silent) {
          return null;
        }
        throw new Error(
          `[StatusCode=${secrets === 'missing' ? 404 : 500}] request failed`
        );
      }
      if (injectEnv) {
        Object.assign(process.env, secrets);
      }
      return Object.entries(secrets).map(([secretKey, secretValue]) => ({
        secretKey,
        secretValue,
        secretMetadata: []
      }));
    }
  );

const turnstile = (env: Record<string, unknown> | undefined) => ({
  TURNSTILE_SITE_KEY: env?.['TURNSTILE_SITE_KEY'],
  TURNSTILE_SECRET_KEY: env?.['TURNSTILE_SECRET_KEY'],
  HUMAN_CHECK_SOURCE: env?.['HUMAN_CHECK_SOURCE']
});

describe('loadEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {};
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    withInfisical.mockReset();
    vi.restoreAllMocks();
  });

  describe('on the host', () => {
    it('takes the shared pair', async () => {
      serve({ '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') } });

      expect(turnstile(await loadEnv())).toEqual({
        ...pair('shared'),
        HUMAN_CHECK_SOURCE: '/apps/cms'
      });
      expect(console.log).toHaveBeenCalledWith(
        '[ENV] Turnstile pair from /apps/cms'
      );
    });

    it('never reads a tenant folder', async () => {
      serve({ '/apps/cms': { PAYLOAD_SECRET_KEY: 'x' } });

      await loadEnv();

      expect(withInfisical).not.toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            path: expect.stringMatching(/^\/tenants\/[^/]+/)
          })
        })
      );
    });

    it('says when no pair is set', async () => {
      serve({ '/apps/cms': { PAYLOAD_SECRET_KEY: 'x' } });

      expect(turnstile(await loadEnv())).toEqual({
        TURNSTILE_SITE_KEY: undefined,
        TURNSTILE_SECRET_KEY: undefined,
        HUMAN_CHECK_SOURCE: undefined
      });
      expect(console.log).toHaveBeenCalledWith('[ENV] Turnstile pair not set');
    });
  });

  describe('on a tenant app', () => {
    beforeEach(() => {
      process.env['TENANT_ID'] = 'moon';
    });

    it('takes the tenant pair over the shared one', async () => {
      serve({
        '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
        '/tenants/moon': pair('tenant'),
        '/tenants/moon/apps/cms': { DEPLOY_ENABLED: 'true' }
      });

      expect(turnstile(await loadEnv())).toEqual({
        ...pair('tenant'),
        HUMAN_CHECK_SOURCE: '/tenants/moon'
      });
      expect(console.log).toHaveBeenCalledWith(
        '[ENV] Turnstile pair from /tenants/moon'
      );
    });

    it("takes the tenant's app folder over the tenant folder", async () => {
      // The deploy pushed the app folder as Fly secrets, and the shared
      // folder overwrites them at boot
      Object.assign(process.env, pair('app'));
      serve({
        '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
        '/tenants/moon': pair('tenant'),
        '/tenants/moon/apps/cms': pair('app')
      });

      expect(turnstile(await loadEnv())).toEqual({
        ...pair('app'),
        HUMAN_CHECK_SOURCE: '/tenants/moon/apps/cms'
      });
    });

    it('keeps only the Turnstile keys from the app folder', async () => {
      serve({
        '/apps/cms': { PAYLOAD_SECRET_KEY: 'x' },
        '/tenants/moon/apps/cms': { RESTRICTED_FONTS: 'a', ...pair('app') }
      });

      const env = await loadEnv();

      expect(env?.['RESTRICTED_FONTS' as keyof typeof env]).toBeUndefined();
    });

    it('never mixes a half tenant pair with the shared half', async () => {
      serve({
        '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
        '/tenants/moon': { TURNSTILE_SITE_KEY: 'tenant-site' }
      });

      expect(turnstile(await loadEnv())).toEqual({
        TURNSTILE_SITE_KEY: 'tenant-site',
        TURNSTILE_SECRET_KEY: undefined,
        HUMAN_CHECK_SOURCE: '/tenants/moon'
      });
    });

    it('falls back to the shared pair when the tenant sets none', async () => {
      serve({
        '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
        '/tenants/moon': { OTHER: 'y' }
      });

      expect(turnstile(await loadEnv())).toEqual({
        ...pair('shared'),
        HUMAN_CHECK_SOURCE: '/apps/cms'
      });
    });

    it('takes a missing app folder as setting nothing', async () => {
      serve({
        '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
        '/tenants/moon/apps/cms': 'missing'
      });

      expect(turnstile(await loadEnv())).toEqual({
        ...pair('shared'),
        HUMAN_CHECK_SOURCE: '/apps/cms'
      });
      expect(console.warn).not.toHaveBeenCalled();
    });

    it.each(['/tenants/moon/apps/cms', '/tenants/moon'])(
      'leaves no pair when %s cannot be read',
      async (path) => {
        serve({
          '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
          [path]: null
        });

        expect(turnstile(await loadEnv())).toEqual({
          TURNSTILE_SITE_KEY: undefined,
          TURNSTILE_SECRET_KEY: undefined,
          HUMAN_CHECK_SOURCE: undefined
        });
        expect(console.log).toHaveBeenCalledWith(
          `[ENV] Turnstile pair not set, ${path} could not be read`
        );
      }
    );
  });

  it('keeps a pair set before Infisical when no folder sets one', async () => {
    Object.assign(process.env, pair('env'));
    serve({ '/apps/cms': { PAYLOAD_SECRET_KEY: 'x' } });

    expect(turnstile(await loadEnv())).toEqual({
      ...pair('env'),
      HUMAN_CHECK_SOURCE: 'the environment'
    });
  });

  it('names the environment when Infisical is skipped', async () => {
    Object.assign(process.env, { PAYLOAD_SECRET_KEY: 'x', ...pair('env') });

    expect(turnstile(await loadEnv())).toEqual({
      ...pair('env'),
      HUMAN_CHECK_SOURCE: 'the environment'
    });
    expect(withInfisical).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      '[ENV] Turnstile pair from the environment'
    );
  });

  it('keeps the folder of a pair an earlier load resolved', async () => {
    process.env['TENANT_ID'] = 'moon';
    serve({
      '/apps/cms': { PAYLOAD_SECRET_KEY: 'x', ...pair('shared') },
      '/tenants/moon': pair('tenant')
    });

    await loadEnv();
    expect(turnstile(await loadEnv())).toEqual({
      ...pair('tenant'),
      HUMAN_CHECK_SOURCE: '/tenants/moon'
    });
    expect(console.log).toHaveBeenLastCalledWith(
      '[ENV] Turnstile pair from /tenants/moon'
    );
  });

  it('drops a HUMAN_CHECK_SOURCE with no pair to name', async () => {
    Object.assign(process.env, {
      PAYLOAD_SECRET_KEY: 'x',
      HUMAN_CHECK_SOURCE: '/somewhere'
    });

    expect(turnstile(await loadEnv()).HUMAN_CHECK_SOURCE).toBeUndefined();
  });
});
