import { dirname, relative } from 'node:path';

import {
  deployEnvironment,
  fetchVault,
  offlineCacheFile,
  readCommittedEnv,
  readEnvFiles,
  readOfflineCache,
  secretsMode,
  taskEnvFiles
} from '@codeware/shared/util/infisical-cli';

import { defineCommand } from '../../cli/command';

import { type ResolvedKey, resolveKeys } from './resolve.logic';
import { vaultPathInput } from './vault-path';

export default defineCommand({
  summary: 'Where each vault key comes from in this shell',
  description:
    "For every key under --path: inherited (set on purpose in a local .env file or this shell), vault, or vault over the committed .env, as `nx dev` would decide it. A target's own `env` is not included. Prints keys and sources, never values.",
  danger: 'read',
  inputs: { path: vaultPathInput() },

  async plan(ctx, { path }) {
    const cacheFile = offlineCacheFile(ctx.root, path);
    const files = taskEnvFiles({
      workspaceRoot: ctx.root,
      projectRoot: dirname(relative(ctx.root, cacheFile)),
      target: 'dev'
    });
    const inherited = { ...readEnvFiles(files.all), ...ctx.env };
    const mode = secretsMode(inherited);
    if (mode === 'ci') {
      return {
        steps: [],
        nothing: 'CI is set: the vault is skipped and the environment is used',
        data: [] as ResolvedKey[]
      };
    }

    const environment = deployEnvironment(inherited);
    const keys = await ctx.ui.task(
      mode === 'offline'
        ? `Reading ${relative(ctx.root, cacheFile)}`
        : `Reading ${path} for ${environment}`,
      async () =>
        resolveKeys({
          inherited,
          committed: readCommittedEnv(files.committed),
          vault:
            mode === 'offline'
              ? readOfflineCache(cacheFile)
              : fetchVault(path, environment).values
        }),
      (list) => `${list.length} key(s)`
    );
    return { steps: [], data: keys };
  },

  async apply(ctx, keys) {
    ctx.ui.table(
      ['key', 'source'],
      keys.map(({ key, source }) => [key, source])
    );
    return { summary: `${keys.length} key(s) resolved`, json: keys };
  }
});
