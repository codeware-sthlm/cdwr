/**
 * The site definitions, behind their own entry point.
 *
 * Kept out of the package's main barrel deliberately: a definition resolves
 * the media beside it with `node:url`, and a `node:` builtin reachable from a
 * barrel that client code imports breaks the browser bundle — which `nx build`
 * does not catch and `nx dev cms` does.
 *
 * Only the seed and the apply scripts import from here, and both are server.
 */
export {
  bundledMediaPath,
  bundledStockMediaPath
} from './lib/bundled-media-path';
export { cdwrIo } from './lib/site-definitions/cdwr-io';
export { codewareSe } from './lib/site-definitions/codeware-se';
export { moon } from './lib/site-definitions/moon';
export { star } from './lib/site-definitions/star';
