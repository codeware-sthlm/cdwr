import { readFileSync } from 'fs';
import { join } from 'path';

import isCI from 'is-ci';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Fly } from '../src/lib/fly.class';
import { AppsCreateTransformedResponseSchema } from '../src/lib/schemas/apps-create.schema';
import { AppsListTransformedResponseSchema } from '../src/lib/schemas/apps-list.schema';
import { BuildResponseSchema } from '../src/lib/schemas/build-response.schema';
import { CertsListWithAppTransformedResponseSchema } from '../src/lib/schemas/certs-list-with-app.schema';
import { CertsListTransformedResponseSchema } from '../src/lib/schemas/certs-list.schema';
import { ConfigShowResponseSchema } from '../src/lib/schemas/config-show.schema';
import { DeployResponseSchema } from '../src/lib/schemas/deploy.schema';
import { SecretsListWithAppTransformedResponseSchema } from '../src/lib/schemas/secrets-list-with-app.schema';
import { SecretsListTransformedResponseSchema } from '../src/lib/schemas/secrets-list.schema';
import { StatusExtendedTransformedResponseSchema } from '../src/lib/schemas/status-extended.schema';
import { StatusTransformedResponseSchema } from '../src/lib/schemas/status.schema';
import { VersionTransformedResponseSchema } from '../src/lib/schemas/version.schema';

import {
  cleanupTestApps,
  createFly,
  createTestApp,
  ensureEmptyTestAppsDir,
  trackAppForCleanup,
  untrackAppForCleanup
} from './setup';

/**
 * Integration tests focused on CLI compatibility and schema validation.
 * Tests verify that all implemented commands work with the real flyctl CLI
 * and that responses match our defined Zod schemas.
 */
describe('Fly CLI Compatibility & Schema Validation', () => {
  let fly: Fly;
  let testAppName: string;
  let testAppDir: string;

  beforeAll(() => {
    ensureEmptyTestAppsDir();
  });

  afterAll(async () => {
    await cleanupTestApps(fly);
  });

  describe('Initialization', () => {
    describe('Authentication', () => {
      it('should authenticate using FLY_ACCESS_TOKEN env var', async () => {
        fly = createFly('FLY_ACCESS_TOKEN');
        await expect(fly.isReady()).resolves.toBe(true);
      });

      it('should authenticate using FLY_API_TOKEN env var', async () => {
        fly = createFly('FLY_API_TOKEN');
        await expect(fly.isReady()).resolves.toBe(true);
      });

      it('should authenticate using token provided in config', async () => {
        fly = createFly('config-token');
        await expect(fly.isReady()).resolves.toBe(true);
      });

      // Locally, `flyctl auth login` session auth bypasses token checks —
      // this test is only meaningful in CI where no local session exists.
      it.skipIf(!isCI)(
        'isReady should throw in assert mode without a token',
        async () => {
          fly = createFly('none');
          await expect(fly.isReady()).resolves.toBe(false);
          await expect(fly.isReady('assert')).rejects.toThrow();
        }
      );
    });

    describe('cli namespace', () => {
      beforeAll(() => {
        fly = createFly('config-token');
      });

      it('cli.isInstalled returns true when fly CLI is installed', async () => {
        const installed = await fly.cli.isInstalled();
        expect(installed).toBe(true);
      });

      it('cli.version returns valid response', async () => {
        const response = await fly.cli.version();

        expect(response).toBeDefined();
        VersionTransformedResponseSchema.parse(response);

        // Ensure consistent CLI version
        expect(response.version).toMatchSnapshot();
      });
    });
  });

  describe('Fly CLI', () => {
    beforeAll(async () => {
      fly = createFly('config-token');

      // Create a single test app shared across cli tests
      const { appName, directory } = await createTestApp(fly);
      testAppName = appName;
      testAppDir = directory;
    });

    describe('Apps Commands', () => {
      it('apps.create returns valid response', async () => {
        const response = await fly.apps.create({
          app: `test-app-create-${Date.now()}`
        });

        expect(response).toBeDefined();
        trackAppForCleanup(response.name);

        AppsCreateTransformedResponseSchema.parse(response);

        // Additional structure checks
        expect(response.id).toMatch(/^test-app-create-\d+$/);
        expect(response.name).toMatch(/^test-app-create-\d+$/);
      });

      it('apps.list returns valid response', async () => {
        const response = await fly.apps.list();

        expect(response.length).toBeGreaterThan(0);
        AppsListTransformedResponseSchema.parse(response);
      });

      it('apps.destroy executes without errors and app is removed', async () => {
        const { appName } = await createTestApp(fly);

        await expect(fly.apps.destroy(appName)).resolves.not.toThrow();

        // Verify app is actually destroyed
        await expect(fly.status({ app: appName })).resolves.toBeNull();
        untrackAppForCleanup(appName);
      });
    });

    describe('Certificates Commands', () => {
      // `example.com` is reserved (RFC 2606), so the certificate is listed
      // but never issued, and no Let's Encrypt challenge can fail on it
      let certHostname: string;

      beforeAll(() => {
        certHostname = `${testAppName}.example.com`;
      });

      afterAll(async () => {
        // The test app is destroyed later anyway, so a failure here is harmless
        await fly.certs
          .remove(certHostname, { app: testAppName })
          .catch(() => undefined);
      });

      it('certs.add executes without errors', async () => {
        await expect(
          fly.certs.add(certHostname, { app: testAppName })
        ).resolves.not.toThrow();
      });

      it('certs.list for app returns valid response', async () => {
        const response = await fly.certs.list({
          app: testAppName
        });

        expect(response.length).toBeGreaterThan(0);
        expect(response.map(({ hostname }) => hostname)).toContain(
          certHostname
        );
        CertsListTransformedResponseSchema.parse(response);
      });

      it('certs.list all returns valid response', async () => {
        const response = await fly.certs.list('all');

        expect(
          response.find(
            ({ app, hostname }) =>
              app === testAppName && hostname === certHostname
          )
        ).toBeDefined();
        CertsListWithAppTransformedResponseSchema.parse(response);
      });

      it('statusExtended lists the certificate as a domain', async () => {
        const response = await fly.statusExtended({ app: testAppName });

        expect(response?.domains).toContainEqual({ hostname: certHostname });
      });

      it('certs.remove executes without errors and removes the certificate', async () => {
        await expect(
          fly.certs.remove(certHostname, { app: testAppName })
        ).resolves.not.toThrow();

        const response = await fly.certs.list({ app: testAppName });
        expect(response.map(({ hostname }) => hostname)).not.toContain(
          certHostname
        );
      });
    });

    describe('Config Commands', () => {
      it('config.show returns valid response', async () => {
        const response = await fly.config.show({
          app: testAppName
        });

        expect(response).toBeDefined();
        ConfigShowResponseSchema.parse(response);
      });

      it('config.save executes without errors and saves the config correctly', async () => {
        // The `.json` extension is what makes `saveConfig` pass `--json` to
        // flyctl, which no longer infers the output format from the path itself
        const remoteConfigFile = join(testAppDir, 'fly.remote.json');
        await expect(
          fly.config.save({
            app: testAppName,
            config: remoteConfigFile
          })
        ).resolves.not.toThrow();

        // Read the saved file and transform to api response type
        const remoteConfigFromFile = readFileSync(remoteConfigFile, 'utf-8');
        const fromFileTransformed = ConfigShowResponseSchema.parse(
          JSON.parse(remoteConfigFromFile)
        );

        // Fetch remote config
        const remoteConfigFromShow = await fly.config.show({
          app: testAppName
        });

        expect(fromFileTransformed).toEqual(remoteConfigFromShow);
      });
    });

    // Requires existing Postgres cluster for testing
    describe('Postgres Commands', () => {
      it.todo(
        'postgres.detach executes without errors and detaches app from the cluster'
      );
    });

    describe('Secrets Commands', () => {
      it('secrets.set with deployment executes without errors', async () => {
        await expect(
          fly.secrets.set(
            { TEST_SECRET: 'test-value-123' },
            { app: testAppName, stage: false }
          )
        ).resolves.not.toThrow();
      });

      it('secrets.list for app returns valid response', async () => {
        // Ensure a secret is set for testing
        await fly.secrets.set(
          {
            API_KEY: 'key-123',
            DATABASE_URL: 'postgres://localhost'
          },
          { app: testAppName, stage: true }
        );

        const response = await fly.secrets.list({
          app: testAppName
        });

        expect(response.length).toBeGreaterThan(0);
        SecretsListTransformedResponseSchema.parse(response);
      });

      it('secrets.list all returns valid response', async () => {
        // Ensure a secret is set for testing
        await fly.secrets.set(
          {
            SECRET_LIST_ALL: 'foo-bar'
          },
          { app: testAppName, stage: true }
        );

        const response = await fly.secrets.list('all');

        expect(response.length).toBeGreaterThan(0);
        SecretsListWithAppTransformedResponseSchema.parse(response);
      });

      it('secrets.unset executes without errors and removes the secret', async () => {
        await fly.secrets.set(
          { TEMP_SECRET: 'temp-value' },
          { app: testAppName, stage: true }
        );

        await expect(
          fly.secrets.unset('TEMP_SECRET', {
            app: testAppName,
            stage: true
          })
        ).resolves.not.toThrow();
        expect(
          (await fly.secrets.list({ app: testAppName })).find(
            (s) => s.name === 'TEMP_SECRET'
          )
        ).toBeUndefined();
      });
    });

    describe('Status Commands', () => {
      it('status for app returns valid response', async () => {
        const response = await fly.status({ app: testAppName });

        expect(response).toBeDefined();
        StatusTransformedResponseSchema.parse(response);
      });

      it('statusExtended for app returns valid response', async () => {
        const response = await fly.statusExtended({ app: testAppName });

        expect(response).toBeDefined();
        StatusExtendedTransformedResponseSchema.parse(response);
      });
    });

    describe('Build & Deploy Commands', () => {
      let buildAppName: string;
      let buildConfigFile: string;

      beforeAll(async () => {
        // Dockerfile-based app so fly deploy --build-only --push triggers a real
        // Docker build and pushes the image to registry.fly.io.
        const { appName, configFile } = await createTestApp(fly, {
          build: 'dockerfile',
          deploy: false
        });
        buildAppName = appName;
        buildConfigFile = configFile;
      });

      it('build returns a valid BuildResponse with a Fly registry image ref', async () => {
        const response = await fly.build({ config: buildConfigFile });

        expect(response).toBeDefined();
        BuildResponseSchema.parse(response);

        expect(response.appName).toBe(buildAppName);
        expect(response.imageRef).toMatch(/^registry\.fly\.io\//);
      });

      it('deploy with pre-built image returns a valid DeployResponse', async () => {
        // Chain: build first, then deploy using the registry image — mirrors the
        // two-phase CI workflow (build once, deploy to multiple tenant apps).
        const built = await fly.build({ config: buildConfigFile });
        const response = await fly.deploy({
          app: buildAppName,
          config: buildConfigFile,
          image: built.imageRef
        });

        expect(response).toBeDefined();
        DeployResponseSchema.parse(response);

        expect(response.app).toBe(buildAppName);
        expect(response.url).toMatch(/^https:\/\//);
      });
    });
  });
});
