import {
  type DocumentMeta,
  documentSeo
} from '@codeware/shared/util/payload-utils';
import type { Metadata } from 'next';

/**
 * A page's title, description and sharing image, as Next metadata.
 *
 * The rules live in `documentSeo`; this only maps its result onto `Metadata`.
 *
 * @param doc - The page, post or tour
 * @param options - See `documentSeo`
 */
export function documentMetadata(
  doc: DocumentMeta,
  options: Parameters<typeof documentSeo>[1] = {}
): Metadata {
  const { title, description, canonical, openGraph, twitterCard } = documentSeo(
    doc,
    options
  );
  const { image, ...openGraphRest } = openGraph;

  return {
    ...(title && {
      title: title.absolute ? { absolute: title.text } : title.text
    }),
    ...(description && { description }),
    ...(canonical && { alternates: { canonical } }),
    openGraph: { ...openGraphRest, images: [{ url: image }] },
    twitter: { card: twitterCard }
  };
}
