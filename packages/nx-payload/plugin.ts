/**
 * Nx plugin entry, referenced from `nx.json`.
 *
 * CommonJS syntax to match this package's own `"type": "commonjs"`. Node strips
 * types natively, so a `.ts` file's syntax decides its module goal — an
 * `export` here cannot be loaded as ESM at all, and Node says so on every
 * command before falling back to a loader that copes.
 *
 * The type re-export stays: it is erased at compile time and never reaches the
 * module system.
 */
export type { PayloadPluginOptions } from './src/plugins/utils/normalize-plugin-options';

module.exports = {
  createNodesV2: require('./src/plugins/plugin').createNodesV2
};
