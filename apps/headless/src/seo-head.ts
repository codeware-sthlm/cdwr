import type { DocumentSeo } from '@codeware/shared/util/payload-utils';

type MetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

type LinkTag = { rel: string; href: string };

/** An address a crawler can fetch: relative ones are taken from the site's origin */
const absolute = (url: string, origin: string | undefined): string => {
  if (!origin) {
    return url;
  }
  try {
    return new URL(url, origin).toString();
  } catch {
    return url;
  }
};

/**
 * A document's head as router tags: the title in the site's own form, the
 * description, the canonical link and the shared-link card.
 *
 * The rules are `documentSeo`'s, the ones the cms site renders through Next
 * metadata, so a page reads the same on both clients. The title follows the
 * cms's template, `<page> · <site>`; an absolute title stands alone.
 *
 * @param seo - What `documentSeo` made of the document
 * @param siteName - The tenant's app name, the title template's second half
 * @param origin - The site's own origin, for the image a crawler fetches
 */
export function seoHead(
  seo: DocumentSeo,
  siteName: string,
  origin?: string
): { meta: Array<MetaTag>; links: Array<LinkTag> } {
  const { title, description, canonical, openGraph, twitterCard } = seo;
  const fullTitle = !title
    ? siteName
    : title.absolute
      ? title.text
      : `${title.text} · ${siteName}`;

  const property = (name: string, content: string | undefined) =>
    content ? [{ property: `og:${name}`, content }] : [];

  return {
    meta: [
      { title: fullTitle },
      ...(description ? [{ name: 'description', content: description }] : []),
      ...property('type', openGraph.type),
      ...property('site_name', openGraph.siteName),
      ...property('locale', openGraph.locale),
      ...property('title', openGraph.title ?? fullTitle),
      ...property('description', openGraph.description),
      ...property('image', absolute(openGraph.image, origin)),
      ...(canonical ? property('url', canonical) : []),
      { name: 'twitter:card', content: twitterCard }
    ],
    links: canonical ? [{ rel: 'canonical', href: canonical }] : []
  };
}
