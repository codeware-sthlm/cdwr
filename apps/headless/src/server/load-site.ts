import { type Site, loadSiteData } from '@codeware/app-headless/data-access';
import { createServerFn } from '@tanstack/react-start';
import { setResponseStatus } from '@tanstack/react-start/server';

import { serverContext } from './context';

/**
 * Load everything the home page needs from the cms headless API.
 *
 * Runs on the server only: the tenant api key is attached there and never
 * reaches the browser.
 */
export const loadSite = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Site> => {
    const result = await loadSiteData(serverContext);
    if (!result.ok) {
      setResponseStatus(503);
    }
    return result;
  }
);
