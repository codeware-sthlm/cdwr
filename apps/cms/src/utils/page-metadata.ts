import type { Metadata } from 'next';

/** What a document states about itself for a search result or a shared link */
export type DocumentMeta = {
  /** The document's own name: a page's, a post's or a tour's title */
  name: string;
  /** Its SEO group, when the collection has one */
  meta?: {
    title?: string | null;
    description?: string | null;
    /** Only its address is read, so any loaded upload fits; an id is skipped */
    image?: number | { url?: string | null } | null;
  } | null;
  /** A description to fall back on, such as a tour's summary */
  summary?: string | null;
};

/**
 * A page's title, description and sharing image.
 *
 * The SEO title wins over the name, since an editor set it for exactly this.
 * The title is the page's part only: the site layout adds the site's name.
 *
 * @param doc - The page, post or tour
 * @param options.landing - The front page carries the site's name alone,
 *   unless an SEO title was set for it
 * @param options.siteName - Restated for a shared link: a page's Open Graph
 *   block replaces the layout's rather than adding to it
 */
export function documentMetadata(
  doc: DocumentMeta,
  { landing = false, siteName }: { landing?: boolean; siteName?: string } = {}
): Metadata {
  const seoTitle = doc.meta?.title?.trim() || null;
  const description =
    doc.meta?.description?.trim() || doc.summary?.trim() || undefined;
  const image =
    typeof doc.meta?.image === 'object' ? doc.meta.image?.url : undefined;

  const title = landing
    ? seoTitle
      ? { absolute: seoTitle }
      : undefined
    : (seoTitle ?? doc.name);

  return {
    ...(title && { title }),
    ...(description && { description }),
    openGraph: {
      ...(siteName && { siteName }),
      ...(typeof title === 'string' && { title }),
      ...(description && { description }),
      ...(image && { images: [{ url: image }] })
    }
  };
}

/**
 * The origin a visitor reached this site at, for turning relative URLs such as
 * an upload's `/media/…` into the absolute ones a crawler needs.
 *
 * From the request, not from configuration: each tenant is served on its own
 * domain, so the address in use is the only one that is right. Behind the
 * proxy the scheme arrives as a header; without it, a local host is plain HTTP.
 *
 * @param host - The request's `host` header
 * @param forwardedProto - Its `x-forwarded-proto` header
 */
export function siteOrigin(
  host: string | null,
  forwardedProto: string | null
): URL | undefined {
  if (!host) {
    return undefined;
  }
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = forwardedProto ?? (local ? 'http' : 'https');

  try {
    return new URL(`${protocol}://${host}`);
  } catch {
    return undefined;
  }
}
