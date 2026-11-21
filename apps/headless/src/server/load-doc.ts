import {
  type LoadedDoc,
  loadDocData
} from '@codeware/app-headless/data-access';
import { parseLoadDocInput } from '@codeware/app-headless/util/routing';
import { createServerFn } from '@tanstack/react-start';
import { setResponseStatus } from '@tanstack/react-start/server';

import { serverContext } from './context';

/**
 * Load the page, post or tour a path points at from the cms headless API.
 *
 * Runs on the server only. The tenant api key only reads published, public
 * content, so a members-only document is a miss here.
 */
export const loadDoc = createServerFn({ method: 'GET' })
  .validator(parseLoadDocInput)
  .handler(async ({ data }): Promise<LoadedDoc> => {
    const result = await loadDocData(serverContext, data);
    if (!result.ok) {
      setResponseStatus(503);
    }
    return result;
  });
