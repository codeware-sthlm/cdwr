import {
  type RequestBaseOptions,
  findDoc
} from '@codeware/shared/util/payload-api';
import { createServerFn } from '@tanstack/react-start';
import { setResponseStatus } from '@tanstack/react-start/server';

import { parseLoadDocInput, resolveDocPath } from '../doc-path';
import { getEnv } from '../env.server';

import { payloadRequestOptions } from './payload-request';

const locales = ['en', 'sv'] as const satisfies ReadonlyArray<
  RequestBaseOptions['locale']
>;

export type LoadedDoc =
  | {
      ok: true;
      /** `null` when the cms holds no such document */
      docJson: string | null;
    }
  | { ok: false; message: string };

/**
 * Load the page, post or tour a path points at from the cms headless API.
 *
 * Runs on the server only. The tenant api key only reads published, public
 * content, so a members-only document is a miss here.
 */
export const loadDoc = createServerFn({ method: 'GET' })
  .validator(parseLoadDocInput)
  .handler(async ({ data: { splat, locale } }): Promise<LoadedDoc> => {
    const lookup = resolveDocPath(splat);
    if (!lookup) {
      return { ok: true, docJson: null };
    }

    try {
      const doc = await findDoc(
        lookup.collection,
        lookup.slug,
        payloadRequestOptions(
          getEnv(),
          locales.find((allowed) => allowed === locale)
        )
      );

      return { ok: true, docJson: doc && JSON.stringify(doc) };
    } catch (error) {
      // A failed request is the cms being unreachable, not a missing page
      console.error('Failed to load document:', error);
      setResponseStatus(503);
      return {
        ok: false,
        message: 'Unable to load the page. Please try again later.'
      };
    }
  });
