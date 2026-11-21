import {
  type LoadDocInput,
  resolveDocPath
} from '@codeware/app-headless/util/routing';
import {
  type RequestBaseOptions,
  findDoc
} from '@codeware/shared/util/payload-api';

import { payloadRequestOptions } from './payload-request';
import type { ServerContext } from './server-context';

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
export async function loadDocData(
  getContext: () => ServerContext,
  { splat, locale }: LoadDocInput
): Promise<LoadedDoc> {
  const lookup = resolveDocPath(splat);
  if (!lookup) {
    return { ok: true, docJson: null };
  }

  try {
    const ctx = getContext();
    const doc = await findDoc(
      lookup.collection,
      lookup.slug,
      payloadRequestOptions(
        ctx.env,
        locales.find((allowed) => allowed === locale)
      )
    );

    return { ok: true, docJson: doc && JSON.stringify(doc) };
  } catch (error) {
    // A failed request is the cms being unreachable, not a missing page
    console.error('Failed to load document:', error);
    return {
      ok: false,
      message: 'Unable to load the page. Please try again later.'
    };
  }
}
