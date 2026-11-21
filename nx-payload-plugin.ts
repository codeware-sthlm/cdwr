// Nx loads the plugin from source. The package is CJS for publishing, so this
// root ESM entry spares Node a failed CJS attempt and its warning.
export type { PayloadPluginOptions } from './packages/nx-payload/src/plugins/utils/normalize-plugin-options';
export { createNodesV2 } from './packages/nx-payload/src/plugins/plugin';
