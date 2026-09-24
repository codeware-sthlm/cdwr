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
export { bamse } from './lib/site-definitions/bamse';
export { cdwrIo } from './lib/site-definitions/cdwr-io';
export { marvel } from './lib/site-definitions/marvel';
export { moon } from './lib/site-definitions/moon';
export { star } from './lib/site-definitions/star';
export { starWars } from './lib/site-definitions/star-wars';
export { sun } from './lib/site-definitions/sun';
