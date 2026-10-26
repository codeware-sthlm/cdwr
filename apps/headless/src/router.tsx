import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';
import { parseSearch, stringifySearch } from './search-param';

export function getRouterOptions() {
  return {
    routeTree,
    scrollRestoration: true,
    parseSearch,
    stringifySearch
  };
}

export function getRouter() {
  return createRouter(getRouterOptions());
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
