import { relative } from 'node:path';

import {
  deployEnvironment,
  discoverPaths,
  fetchVault,
  offlineCacheFile,
  writeOfflineCache
} from '@codeware/shared/util/infisical-cli';

import { defineCommand } from '../../cli/command';

import { vaultPathInput } from './vault-path';

export default defineCommand({
  summary: 'Refresh the offline copy of an app vault',
  description:
    'Reads every value under --path from your Infisical session and writes them to apps/<app>/.env.offline, which OFFLINE=1 uses. Prints counts, never values.',
  danger: 'mutate',
  inputs: { path: vaultPathInput() },

  async plan(ctx, { path }) {
    const environment = deployEnvironment(ctx.env);
    // Folders only; the values are fetched when the plan is applied
    const paths = await ctx.ui.task(
      `Listing ${path} for ${environment}`,
      async () => discoverPaths(path, environment),
      (list) => `${list.length} path(s)`
    );
    const file = relative(ctx.root, offlineCacheFile(ctx.root, path));
    return {
      steps: [
        `Read the values of ${paths.join(', ')}`,
        `Write ${file} (mode 600)`
      ],
      target: { environment, name: file },
      data: { environment, path, paths, file }
    };
  },

  async apply(ctx, { environment, path, paths: planned, file }) {
    const { values, paths } = await ctx.ui.task(
      `Reading ${path} for ${environment}`,
      async () => fetchVault(path, environment, undefined, planned),
      (read) => `${Object.keys(read.values).length} value(s)`
    );
    writeOfflineCache(offlineCacheFile(ctx.root, path), {
      environment,
      paths,
      values
    });
    const count = Object.keys(values).length;
    return {
      summary: `${count} value(s) from ${paths.length} path(s) written to ${file}`,
      json: { environment, file, values: count, paths: paths.length }
    };
  }
});
