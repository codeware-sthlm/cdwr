// Nx loads the plugin from source in this repo. The package is CJS for
// publishing, so this ESM entry spares Node a failed CJS attempt and its warning
export type { PayloadPluginOptions } from './src/plugins/utils/normalize-plugin-options';
export { createNodesV2 } from './src/plugins/plugin';
