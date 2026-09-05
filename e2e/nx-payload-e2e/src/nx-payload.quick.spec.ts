import {
  ensureCreateNxWorkspaceProject,
  ensureLockFileIsDetected,
  ensurePnpmApproveBuilds,
  ensureTs6TsconfigCompat
} from '@codeware/e2e/utils';
import { logDebug } from '@codeware/shared/util/misc';
import type { NxJsonConfiguration, PackageManager } from '@nx/devkit';
import {
  checkFilesExist,
  readJson,
  runCommandAsync,
  runNxCommand,
  runNxCommandAsync
} from '@nx/plugin/testing';

/**
 * This test suite does not use the preset, but starts with an empty workspace ('apps' preset)
 * and adds the plugin afterwards.
 */

describe('Test plugin by starting with an empty workspace (limited test suite)', () => {
  jest.setTimeout(300_000);

  let packageManager: PackageManager;

  // Setup an empty workspace and add the plugin afterwards
  beforeAll(async () => {
    ({ packageManager } = await ensureCreateNxWorkspaceProject({
      preset: 'apps'
    }));
    ensureLockFileIsDetected(packageManager);

    // `silenceError` because pnpm 10+ exits non-zero when a dependency's
    // build script is blocked - which also aborts `nx add` before it runs
    // its own init generator, so a recovered build must retry the command.
    await runNxCommandAsync('add @cdwr/nx-payload', { silenceError: true });
    const recovered = await ensurePnpmApproveBuilds(packageManager);
    if (recovered) {
      await runNxCommandAsync('add @cdwr/nx-payload', { silenceError: true });
    }
    logDebug(
      'Plugin added - package.json',
      JSON.stringify(readJson('package.json'), null, 2)
    );
  });

  afterAll(() => {
    runNxCommand('reset', { silenceError: true });
  });

  describe('verify setup', () => {
    it('should have installed @cdwr/nx-payload', async () => {
      await runCommandAsync('npm ls @cdwr/nx-payload');
    });

    it('should only have nx-payload plugin in nx.json', () => {
      const nxJson = readJson<NxJsonConfiguration>('nx.json');
      expect(nxJson.plugins).toBeDefined();
      expect(nxJson.plugins).toEqual([
        {
          plugin: '@cdwr/nx-payload/plugin',
          options: {
            generateTargetName: 'gen',
            payloadTargetName: 'payload',
            payloadGraphqlTargetName: 'payload-graphql',
            dxMongodbTargetName: 'dx:mongodb',
            dxPostgresTargetName: 'dx:postgres',
            dxStartTargetName: 'dx:start',
            dxStopTargetName: 'dx:stop'
          }
        }
      ]);
    });
  });

  describe('generate default payload app and run targets', () => {
    const appName = 'app-default';
    const appDirectory = `apps/${appName}`;

    beforeAll(async () => {
      // `silenceError` because pnpm 10+ exits non-zero when a dependency's
      // build script is blocked - `ensurePnpmApproveBuilds` below recovers.
      //
      // But silencing it also swallowed the generator's own failure: when the
      // app was not created, every later assertion reported a symptom
      // ('Cannot find project') and nothing said why. Keep the tolerance,
      // print the output.
      const generated = await runNxCommandAsync(
        `g @cdwr/nx-payload:app ${appName} --directory ${appDirectory}`,
        { silenceError: true }
      );
      logDebug(
        'Application generator output',
        `${generated.stdout}\n${generated.stderr}`
      );
      await ensurePnpmApproveBuilds(packageManager);
      ensureTs6TsconfigCompat();
      logDebug(
        'Application generated - package.json',
        JSON.stringify(readJson('package.json'), null, 2)
      );
    });

    it('should have added eslint,jest,next plugins to nx.json', () => {
      const nxJson = readJson<NxJsonConfiguration>('nx.json');
      const plugins = nxJson.plugins
        .map((p) => (typeof p === 'string' ? p : p.plugin))
        .sort();

      expect(plugins).toEqual([
        '@cdwr/nx-payload/plugin',
        '@nx/eslint/plugin',
        '@nx/jest/plugin',
        '@nx/next/plugin'
      ]);
    });

    it('should build application', async () => {
      await runNxCommandAsync(`build ${appName}`);
      expect(() =>
        checkFilesExist(
          `${appDirectory}/.next/standalone`,
          `${appDirectory}/.next/static`
        )
      ).not.toThrow();
    });
  });
});
