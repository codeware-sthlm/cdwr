/** Collections that have a page of their own on the tenant site */
export type SiteCollection = 'pages' | 'posts' | 'tours';

/**
 * Where the site serves a document, as a path from the site root.
 *
 * Pages live at the root, the landing page being the root itself; posts and
 * tours live under their collection. A document without a slug has no address
 * of its own, so its collection's root is returned.
 *
 * @param collection - The document's collection
 * @param doc - The document: its slug, and its id for the landing check
 * @param landingPageId - The tenant's landing page, which answers at `/`
 */
export const sitePath = (
  collection: SiteCollection,
  doc: { id?: number | string | null; slug?: string | null },
  landingPageId?: number | string | null
): string => {
  if (
    collection === 'pages' &&
    landingPageId != null &&
    doc.id === landingPageId
  ) {
    return '/';
  }

  const slug = doc.slug?.replace(/^\/+|\/+$/g, '');

  if (collection === 'pages') {
    return slug ? `/${slug}` : '/';
  }

  return slug ? `/${collection}/${slug}` : `/${collection}`;
};
