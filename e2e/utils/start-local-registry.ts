/**
 * This script starts a local registry for testing purposes.
 *
 * For e2e it is meant to be called in jest's `globalSetup`.
 */

import { registerTsProject } from '@nx/js/internal';
import { startLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { releasePublish, releaseVersion } from 'nx/release';

import { isCI } from './is-ci';
import { backupPackageJsonFiles } from './package-json-backup';

module.exports = async () => {
  registerTsProject('./tsconfig.base.json');
  const verbose = process.env['NX_VERBOSE_LOGGING'] === 'true';

  // The `codeware:local-registry` target's `ci` configuration switches
  // `listenAddress` to `localhost` - match it here so `startLocalRegistry`'s
  // own readiness check (a string match against the address it's told to
  // expect) actually fires instead of hanging until timeout.
  const listenAddress = isCI() ? 'localhost' : '0.0.0.0';
  const localRegistryTarget = isCI()
    ? 'codeware:local-registry:ci'
    : 'codeware:local-registry';

  console.log(
    `\nStart local registry with listen address '${listenAddress}' (CI=${isCI()})`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).stopLocalRegistry = await startLocalRegistry({
    localRegistryTarget,
    storage: './tmp/local-registry/storage',
    verbose,
    clearStorage: true,
    listenAddress
  });

  // `startLocalRegistry` configures npm, bun and yarn to use the local
  // registry, but not pnpm. pnpm 9 read `npm_config_registry` as an
  // npm-compatibility shim, so this went unnoticed; pnpm 10+ dropped that
  // shim entirely (see https://github.com/pnpm/pnpm/releases/tag/v10.0.0),
  // so without this, every `pnpm add`/`nx add` in the e2e workspace silently
  // falls back to the real npm registry instead of the local one - fetching
  // whatever is actually published on npm rather than the source under test.
  // Verified directly: unset, `pnpm add @cdwr/nx-payload` resolved the real
  // published version; set, it correctly resolved the locally published one.
  process.env['pnpm_config_registry'] = process.env['npm_config_registry'];

  backupPackageJsonFiles();

  // Only the publishable packages. The `apps` release group (cms, web) has no
  // `nx-release-publish` target, so an unscoped `releasePublish` errors with
  // "projects were matched for publishing but do not have the nx-release-publish
  // target specified". That group also sets `updateDependents: never`, or an app
  // depending on a package here would be pulled back in past this filter.
  const projects = ['nx-payload', 'create-nx-payload', 'fly-node'];

  await releaseVersion({
    specifier: `0.0.${Date.now()}-e2e`,
    stageChanges: false,
    gitCommit: false,
    gitTag: false,
    firstRelease: true,
    projects,
    versionActionsOptionsOverrides: {
      skipLockFileUpdate: true
    },
    verbose
  });

  await releasePublish({
    tag: 'e2e',
    firstRelease: true,
    projects,
    verbose
  });
};
