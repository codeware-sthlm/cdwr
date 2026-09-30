import {
  NX_VERSION,
  type Tree,
  addDependenciesToPackageJson
} from '@nx/devkit';
import { getDependencyVersionFromPackageJson } from 'nx/src/utils/package-json';

import {
  graphqlVersion,
  next16Version,
  payloadVersion
} from '../../../utils/versions';

/**
 * The Nx plugins this plugin builds on, its `@nx/*` peers.
 *
 * Left to the package manager they install as peers at whatever is newest in
 * the range, which can run ahead of the workspace's own nx, and a newer
 * `@nx/js` on an older nx crashes the application generator.
 */
export const nxPeers = [
  '@nx/devkit',
  '@nx/eslint',
  '@nx/js',
  '@nx/next'
] as const;

/**
 * Add required Payload dependencies to workspace `package.json`.
 *
 * Add Next v16 as dependency when not already installed, and the Nx plugins
 * this one builds on at the workspace's installed nx version.
 *
 * @link https://github.com/payloadcms/payload/tree/main/packages
 */
export function updateDependencies(tree: Tree) {
  // Prefer Next.js v16 when not already installed
  let nextDep = {};
  if (getDependencyVersionFromPackageJson(tree, 'next') === null) {
    nextDep = { next: next16Version };
  }

  return addDependenciesToPackageJson(
    tree,
    {
      '@payloadcms/db-mongodb': payloadVersion,
      '@payloadcms/db-postgres': payloadVersion,
      '@payloadcms/next': payloadVersion,
      '@payloadcms/richtext-lexical': payloadVersion,
      ...nextDep,
      payload: payloadVersion,
      graphql: graphqlVersion
    },
    {
      '@payloadcms/graphql': payloadVersion,
      ...Object.fromEntries(nxPeers.map((name) => [name, NX_VERSION]))
    }
  );
}
