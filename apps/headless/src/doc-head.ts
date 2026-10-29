import {
  type DocData,
  type DocumentMeta,
  documentSeo,
  sitePath
} from '@codeware/shared/util/payload-utils';

import { seoHead } from './seo-head';
import type { Site } from './server/load-site';

/** What a page, post or tour states about itself, whichever it is */
export const docMeta = (data: DocData): DocumentMeta => {
  switch (data.collection) {
    case 'pages':
      return { name: data.doc.name, meta: data.doc.meta };
    case 'posts':
      return { name: data.doc.title, meta: data.doc.meta };
    case 'tours':
      return {
        name: data.doc.title,
        meta: data.doc.meta,
        summary: data.doc.summary
      };
  }
};

/**
 * The head of a document's page: title, description, canonical link and the
 * shared-link card, in the cms's own rules.
 *
 * @param root - The root route's data; without a loaded site only the title stays
 * @param doc - The document, or `null` for the landing page's own details
 * @param landing - The front page, which carries the site's name alone
 */
export function docHead(
  root: Site | undefined,
  options: { doc: DocData | null; landing?: boolean }
) {
  const site = root?.ok ? root.site : null;
  const { doc, landing = false } = options;
  const appName = site?.appName ?? 'Site';

  if (!doc) {
    return { meta: [{ title: appName }], links: [] };
  }

  const kind: 'website' | 'article' =
    doc.collection === 'posts' ? 'article' : 'website';
  const path = landing ? '/' : sitePath(doc.collection, doc.doc);
  const origin = site?.origin ?? undefined;

  return seoHead(
    documentSeo(docMeta(doc), {
      landing,
      siteName: site?.appName,
      path,
      origin,
      kind,
      locale: site?.locale
    }),
    appName,
    origin
  );
}
