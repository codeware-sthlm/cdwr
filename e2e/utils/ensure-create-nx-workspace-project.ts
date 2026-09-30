import { existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { cwd } from 'process';

import {
  getPackageVersion,
  isDebugEnabled,
  logDebug,
  logError,
  logInfo,
  logWarning
} from '@codeware/shared/util/misc';
import { runCommand } from '@codeware/shared/util/testing';
import {
  type PackageManager,
  getPackageManagerCommand,
  readJsonFile
} from '@nx/devkit';
import {
  directoryExists,
  exists,
  readJson,
  runNxCommand,
  tmpProjPath,
  uniq,
  updateFile
} from '@nx/plugin/testing';
import type { PackageJson } from 'nx/src/utils/package-json';

import { cleanupE2E } from './cleanup-e2e';
import { ensureAlignedNxPeers } from './ensure-aligned-nx-peers';
import { ensureLegacyPeerDeps } from './ensure-legacy-peer-deps';
import { ensureLocalPluginInstalled } from './ensure-local-plugin-installed';
import { ensurePnpmApproveBuilds } from './ensure-pnpm-approve-builds';
import { ensureTs6TsconfigCompat } from './ensure-ts6-tsconfig-compat';
import { getE2EPackageManager } from './get-e2e-package-manager';
import { LOCAL_PLUGIN } from './local-plugin';

export type CreateNxWorkspaceProject = {
  /**
   * Name of application when one has been generated.
   *
   * @default 'app-default'
   */
  appName?: string;

  /**
   * Application directory relative to the workspace root,
   * when one has been generated.
   *
   * @default 'apps/{appName}'
   */
  appDirectory?: string;

  /**
   * Project name used for generating the workspace with `create-nx-workspace`.
   *
   * @default 'proj'
   */
  projectName: string;

  /**
   * Full path to project where the workspace was generated.
   *
   * **Hint!** Equivalent to `tmpProjPath()`.
   *
   * @default '{workspacePath}/tmp/nx-e2e/proj/'
   */
  projectPath: string;

  /**
   * Package manager used to create the workspace.
   */
  packageManager: PackageManager;
};

type Options = {
  /**
   * Generate the app with a random name or provide your own.
   *
   * Leaving the default name makes debug easier when you want to run commands
   * in the e2e folder for the initial app with a known name.
   * @default 'app-default'
   */
  appName?: 'random' | { name: string };

  /**
   * Ensure `@cdwr/nx-payload` plugin gets installed in the workspace
   * @default false
   */
  ensureNxPayload?: boolean;

  /**
   * Optionally set the workspace type in `package.json`.
   *
   * Use `'inferred'` to keep the type from repository root.
   */
  workspaceType?: PackageJson['type'] | 'inferred';
};

/**
 * Ensure the creation of a new E2E Nx workspace project, using `create-nx-workspace`.
 *
 * It's an alternative to `ensureNxProject` which uses the plugin build from local `dist` folder.
 * This function uses the local registry instead to setup the workspace in a more realistic scenario.
 *
 * - Version is set via environment variable `CDWR_E2E_NX_VERSION` or fall back to the installed version of `create-nx-workspace`.
 * - Package mananger is set via environment variable `CDWR_E2E_PACKAGE_MANAGER` or fall back to the workspace package manager.
 *
 * @param preset Which preset to use as option to `create-nx-workspace`
 * @param options Workspace options
 * @returns Project workspace details
 */
export async function ensureCreateNxWorkspaceProject({
  preset,
  options
}: {
  preset: 'apps';
  options?: Pick<Options, 'ensureNxPayload'>;
}): Promise<CreateNxWorkspaceProject>;
export async function ensureCreateNxWorkspaceProject({
  preset,
  options
}: {
  preset: '@cdwr/nx-payload';
  options?: Pick<Options, 'appName'>;
}): Promise<CreateNxWorkspaceProject>;
export async function ensureCreateNxWorkspaceProject({
  preset,
  options
}: {
  preset: 'apps' | '@cdwr/nx-payload';
  options?: Options;
}): Promise<CreateNxWorkspaceProject> {
  // Get version from environment variable or the local version of `create-nx-workspace`
  let version =
    process.env.CDWR_E2E_NX_VERSION ||
    (await getPackageVersion('create-nx-workspace'));

  // Windows workaround when `npm list` fails unexpectedly
  if (!version) {
    logInfo(
      'Could not resolve nx version, try to read from workspace package.json'
    );
    const packageJsonPath = join(cwd(), 'package.json');

    if (existsSync(packageJsonPath)) {
      const packageJson = readJsonFile<{
        devDependencies: Record<string, string>;
      }>(packageJsonPath);

      version = packageJson.devDependencies['create-nx-workspace'];
    }
  }

  if (!version) {
    logWarning(`Could not resolve nx version, fall back to 'latest'`);
    version = 'latest';
  }

  // Ensure the e2e temp path is removed
  await cleanupE2E();

  const pm = getE2EPackageManager();
  logDebug(
    'Resolved',
    `create-nx-workspace: ${version}, test package manager: ${pm}`
  );

  // Prepare the options for `create-nx-workspace`
  const cmdOptions = [
    '--nxCloud',
    'skip',
    '--no-interactive',
    '--packageManager',
    pm
  ];

  let appName: string | undefined;
  let appDirectory: string | undefined;

  // App name and directory for the `@cdwr/nx-payload` preset
  if (preset === '@cdwr/nx-payload') {
    // Set app name from options or a default static name
    appName = !options?.appName
      ? 'app-default'
      : options.appName === 'random'
        ? uniq('app')
        : options.appName.name;

    appDirectory = `apps/${appName}`;
  }

  // The workspace should created in the e2e temp path
  const projectPath = tmpProjPath();
  const projectName = basename(projectPath);
  const runPath = join(projectPath, '..');

  // Ensure run path exists
  if (!directoryExists(runPath)) {
    mkdirSync(runPath, { recursive: true });
  }

  // The plugin's preset is applied in a second step, below, once the
  // workspace's `@nx/*` packages are aligned. Run by `create-nx-workspace`,
  // it would resolve those peers to npm's newest, which can run ahead of the
  // workspace's own nx and crash the preset before it writes anything
  const cmd = `npx create-nx-workspace@${version} ${projectName} --preset apps ${cmdOptions.join(' ')}`;

  logDebug('Creating Nx workspace project', `Preset '${preset}'`);
  logDebug('Run command', cmd);

  // pnpm 10+ exits non-zero when a dependency's build script is blocked -
  // e.g. `esbuild` - even though
  // the workspace itself was created successfully. Don't treat that as fatal
  // here; `exists(projectPath)` below is the real success signal, and
  // `ensurePnpmApproveBuilds` after it recovers the blocked build.
  let result = '';
  try {
    result = await runCommand(cmd, {
      cwd: runPath,
      errorDetector: /ChildProcess\.exithandler/i
    });
  } catch (error) {
    result = String(error);
  }

  logDebug('Command output', result);

  if (!exists(projectPath)) {
    logDebug('Run path', runPath);
    if (!isDebugEnabled()) {
      logError('Command output', result);
    }

    // Try to find and print error log content
    const logMatch = result.match(/Log file: (?<errorLog>.*error\.log)/);
    if (logMatch?.groups) {
      const errorLog = logMatch.groups['errorLog'];
      if (existsSync(errorLog)) {
        logInfo(
          `Output from ${errorLog}\n`,
          readFileSync(errorLog, { encoding: 'utf-8' })
        );
      } else {
        logInfo('Error log file could not be found', errorLog);
      }
    }

    throw new Error(`Failed to create test project in "${projectPath}"`);
  }

  // `create-nx-workspace` may have installed dependencies with postinstall
  // scripts that pnpm 10+ blocks
  // without an explicit allowlist.
  await ensurePnpmApproveBuilds(pm);

  // Set the package type in `package.json` if specified
  let packageType: PackageJson['type'];
  if (options?.workspaceType === 'inferred') {
    // Keep the type from the root workspace if any
    const rootPackageJson = readJsonFile<PackageJson>(
      join(cwd(), 'package.json')
    );
    packageType = rootPackageJson.type;
  } else {
    packageType = options?.workspaceType;
  }
  if (packageType) {
    logDebug(
      `Set workspace package.json type from option '${options?.workspaceType}'`,
      packageType
    );
    updateFile('package.json', (content) => {
      const packageJson = JSON.parse(content) as PackageJson;
      packageJson.type = packageType;
      return JSON.stringify(packageJson, null, 2);
    });
  }

  // ! Payload peers a later version of Next.js than Nx does
  ensureLegacyPeerDeps(pm);

  // ! create-nx-workspace still emits deprecated `baseUrl`, a hard error on TS 6
  ensureTs6TsconfigCompat();

  // Unconditional because a caller may add the plugin itself once it has the
  // workspace back, which no flag here would reveal. The preset resolves those
  // peers while the workspace is created, `nx add` right after; pinning now
  // covers the first and precedes the second.
  await ensureAlignedNxPeers(pm);

  // What `create-nx-workspace` does with a third-party preset: install the
  // package with the package manager, then run its `preset` generator. Not
  // `nx add`, which also runs the plugin's init; that route is the quick suite's
  if (preset === '@cdwr/nx-payload' && appName && appDirectory) {
    logDebug('Apply the @cdwr/nx-payload preset to the workspace');
    await runCommand(
      `${getPackageManagerCommand(pm, tmpProjPath()).add} ${LOCAL_PLUGIN}`,
      {
        cwd: tmpProjPath()
      }
    );
    runNxCommand(
      `g @cdwr/nx-payload:preset --payloadAppName ${appName} --payloadAppDirectory ${appDirectory} --no-interactive`
    );
  }

  if (preset === 'apps' && options?.ensureNxPayload) {
    logDebug('Install @cdwr/nx-payload plugin in the empty apps workspace');
    // `silenceError` because pnpm 10+ exits non-zero when a dependency's
    // build script is blocked - which also aborts `nx add` before it runs
    // its own init generator, so a recovered build must retry the command.
    runNxCommand(`add ${LOCAL_PLUGIN}`, { silenceError: true });
    const recovered = await ensurePnpmApproveBuilds(pm);
    if (recovered) {
      runNxCommand(`add ${LOCAL_PLUGIN}`, { silenceError: true });
    }
  }

  if (preset === '@cdwr/nx-payload' || options?.ensureNxPayload) {
    ensureLocalPluginInstalled();
  }

  logDebug('Workspace created and ready for use', projectPath);

  logDebug('package.json', JSON.stringify(readJson('package.json'), null, 2));

  return {
    appName,
    appDirectory,
    packageManager: pm,
    projectName,
    projectPath
  };
}
