import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { getPackageManagerCommand } from '@nx/devkit';
import replaceInFile from 'replace-in-file';

import { readDeferredPrompts } from './read-deferred-prompts';
import type { DeferredPrompt, MigrateConfig } from './types';
import { updateDependencies } from './update-dependencies';

export const runMigration = async (
  config: MigrateConfig,
  latestVersion: string
): Promise<Array<DeferredPrompt>> => {
  const pmc = getPackageManagerCommand();

  core.info('Running Nx migrate');
  await exec.exec(pmc.exec, ['nx', 'migrate', latestVersion]);

  // Migrate leaves the lock file untouched, so nothing may run via the
  // package manager until dependencies are installed again
  core.info('Installing dependencies');
  await exec.exec(pmc.install);

  const deferredPrompts = readDeferredPrompts();
  if (deferredPrompts.length) {
    core.warning(
      `${deferredPrompts.length} prompt migration(s) require an AI agent and will be deferred`
    );
  }

  core.info('Running migrations');
  await exec.exec(pmc.exec, [
    'nx',
    'migrate',
    '--run-migrations',
    // Continue successfully when nothing was generated to migrate
    '--if-exists',
    // Dependencies are already installed above, with lifecycle scripts enabled
    '--skip-install'
  ]);

  core.info('Update version references in package.json files');

  await replaceInFile({
    files: config.packagePatterns,
    // Match entire file contents in one go
    from: /[\s\S]*/g,
    to: (fileContent) => {
      const next = updateDependencies(fileContent, latestVersion);
      if (next !== fileContent) {
        core.debug('package.json versions were updated');
      } else {
        core.debug('no matching package specs found for update');
      }
      return next;
    },
    allowEmptyPaths: true
  });

  // Sync generators derive their output from the installed dependency versions,
  // so any generated manifest is stale until they run again
  core.info('Running sync generators');
  try {
    await exec.exec(pmc.exec, ['nx', 'sync']);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    core.warning(`Sync failed, continue migration anyway: ${reason}`);
  }

  core.info('Formatting migrated files');
  try {
    await exec.exec(pmc.exec, ['nx', 'format:write']);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    core.warning(`Formatting failed, continue migration anyway: ${reason}`);
  }

  core.info('Migration completed');

  return deferredPrompts;
};
