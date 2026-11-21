import {
  type DocData,
  docMeta,
  documentSeo,
  sitePath
} from '@codeware/shared/util/payload-utils';

import { seoHead } from './seo-head';

/** What the head reads of the loaded site */
export type HeadSite = {
  appName: string;
  landingPageId: number | string | null;
  locale: string;
  origin: string | null;
  payloadUrl: string;
};

/** The root route's data, as far as the head is concerned */
export type HeadRoot = { ok: true; site: HeadSite } | { ok: false };

/**
 * The head of a document's page: title, description, canonical link and the
 * shared-link card, in the cms's own rules.
 *
 * @param root - The root route's data; without a loaded site only the title stays
 * @param doc - The document, or `null` for the landing page's own details
 * @param landing - The front page, which carries the site's name alone
 */
export function docHead(
  root: HeadRoot | undefined,
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
  const path = landing
    ? '/'
    : sitePath(doc.collection, doc.doc, site?.landingPageId);
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
    origin,
    site?.payloadUrl
  );
}
