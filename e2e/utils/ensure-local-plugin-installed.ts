import { readJson } from '@nx/plugin/testing';

import { LOCAL_PLUGIN_TAG } from './local-plugin';

/**
 * Fail loudly when the e2e workspace holds a plugin other than the build
 * under test, rather than let a suite pass against the published one.
 */
export const ensureLocalPluginInstalled = (): void => {
  const { dependencies = {}, devDependencies = {} } = readJson('package.json');
  const version =
    dependencies['@cdwr/nx-payload'] ?? devDependencies['@cdwr/nx-payload'];

  if (!version?.endsWith(`-${LOCAL_PLUGIN_TAG}`)) {
    throw new Error(
      `The e2e workspace installed @cdwr/nx-payload ${version ?? '(none)'}, not the local build tagged '${LOCAL_PLUGIN_TAG}'`
    );
  }
};
