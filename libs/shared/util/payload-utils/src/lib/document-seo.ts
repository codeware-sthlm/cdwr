/** The generated card a page without an image of its own is shared with */
export const DEFAULT_OG_IMAGE_PATH = '/og-image.png';

/** Open Graph locale for each language a site can be written in */
const OG_LOCALES = { en: 'en_US', sv: 'sv_SE' } as const;

/** The Open Graph form of a tenant locale, when one is known */
export function ogLocale(
  locale: string | null | undefined
): string | undefined {
  return locale && locale in OG_LOCALES
    ? OG_LOCALES[locale as keyof typeof OG_LOCALES]
    : undefined;
}

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

/** What a client needs to render a document's head, free of any framework */
export type DocumentSeo = {
  /** The page's part of the title; `absolute` skips the site's title template */
  title?: { text: string; absolute: boolean };
  description?: string;
  canonical?: string;
  openGraph: {
    type: 'website' | 'article';
    siteName?: string;
    locale?: string;
    /** Set only when the title is not absolute */
    title?: string;
    description?: string;
    image: string;
  };
  twitterCard: 'summary_large_image';
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
 * @param options.path - The page's address on the site, for its canonical link
 * @param options.origin - The address the site calls its own (`serverURL`:
 *   the workspace's primary domain once adopted), so the canonical link names
 *   one host whichever one the visitor came in on
 * @param options.kind - `article` for a post, `website` otherwise
 * @param options.locale - The site's language, as a tenant locale
 */
export function documentSeo(
  doc: DocumentMeta,
  {
    landing = false,
    siteName,
    path,
    origin,
    kind = 'website',
    locale
  }: {
    landing?: boolean;
    siteName?: string;
    path?: string;
    origin?: string;
    kind?: 'website' | 'article';
    locale?: string | null;
  } = {}
): DocumentSeo {
  const seoTitle = doc.meta?.title?.trim() || null;
  const description =
    doc.meta?.description?.trim() || doc.summary?.trim() || undefined;
  const image =
    typeof doc.meta?.image === 'object' ? doc.meta.image?.url : undefined;

  const title: DocumentSeo['title'] = landing
    ? seoTitle
      ? { text: seoTitle, absolute: true }
      : undefined
    : { text: seoTitle ?? doc.name, absolute: false };

  const openGraphLocale = ogLocale(locale);

  return {
    ...(title?.text && { title }),
    ...(description && { description }),
    ...(path && {
      canonical: origin ? new URL(path, origin).toString() : path
    }),
    openGraph: {
      type: kind,
      ...(siteName && { siteName }),
      ...(openGraphLocale && { locale: openGraphLocale }),
      ...(title && !title.absolute && title.text && { title: title.text }),
      ...(description && { description }),
      image: image ?? DEFAULT_OG_IMAGE_PATH
    },
    twitterCard: 'summary_large_image'
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
