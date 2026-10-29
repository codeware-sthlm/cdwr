import { createRouter } from '@tanstack/react-router';
import { getGlobalStartContext } from '@tanstack/react-start';

import { nonceFrom } from './nonce';
import { routeTree } from './routeTree.gen';
import { parseSearch, stringifySearch } from './search-param';
import { initSentryClient } from './sentry-client';

export function getRouterOptions() {
  return {
    routeTree,
    scrollRestoration: true,
    parseSearch,
    stringifySearch
  };
}

export function getRouter() {
  // On the server, the nonce the security middleware made for this request;
  // the router stamps it on every script it emits. The client reads it back
  // from the document
  const nonce = nonceFrom(getGlobalStartContext());

  const router = createRouter({
    ...getRouterOptions(),
    ...(nonce ? { ssr: { nonce } } : {})
  });

  initSentryClient(router);

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
