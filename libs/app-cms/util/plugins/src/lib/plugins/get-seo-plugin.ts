import { sitePath } from '@codeware/app-cms/util/misc';
import type { Page, Post, Tour } from '@codeware/shared/util/payload-types';
import { seoPlugin } from '@payloadcms/plugin-seo';
import type { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types';

// SEO auto-generate functions

const generateTitle: GenerateTitle<Page | Post | Tour> = async ({ doc }) =>
  'name' in doc ? doc.name : doc.title;

/** The page its tenant's site answers at `/`, when it can be told */
const landingPageId = async (
  doc: Page | Post | Tour,
  payload: Parameters<GenerateURL>[0]['req']['payload']
): Promise<number | null> => {
  const tenant =
    doc.tenant && typeof doc.tenant === 'object' ? doc.tenant.id : doc.tenant;
  if (!tenant) {
    return null;
  }

  try {
    const { docs } = await payload.find({
      collection: 'site-settings',
      where: { tenant: { equals: tenant } },
      depth: 0,
      limit: 1,
      pagination: false
    });
    const landing = docs[0]?.general?.landingPage;
    return landing && typeof landing === 'object'
      ? landing.id
      : (landing ?? null);
  } catch {
    return null;
  }
};

const generateURL: GenerateURL<Page | Post | Tour> = async ({
  collectionSlug,
  doc,
  req: { origin, payload }
}) => {
  if (
    collectionSlug !== 'pages' &&
    collectionSlug !== 'posts' &&
    collectionSlug !== 'tours'
  ) {
    return `${origin}/${collectionSlug}/${doc.slug ?? ''}`;
  }

  const landing =
    collectionSlug === 'pages' ? await landingPageId(doc, payload) : null;

  return `${origin}${sitePath(collectionSlug, doc, landing)}`;
};

export const getSeoPlugin = () => {
  return seoPlugin({
    uploadsCollection: 'media',
    generateTitle,
    generateURL
  });
};

export { generateURL as generateSeoURL };
