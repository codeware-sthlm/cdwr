import { getId } from '@codeware/app-cms/util/misc';
import type { Page } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type PageData = Pick<
  Page,
  'header' | 'layout' | 'name' | 'slug' | 'tenant'
> & {
  slug: string;
  /** Defaults to `public` — seeded content is demo content */
  visibility?: Page['visibility'];
};

/**
 * Ensure that a page exist with the given slug.
 *
 * @param payload - Payload instance
 * @param data - Page data
 * @param options - Seed options
 * @returns The created page or the id if the page exists
 */
export async function ensurePage(
  payload: Payload,
  data: PageData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Page | number> {
  const { locale, transactionID, managedBy } = options;
  const { header, layout, name, slug, tenant, visibility } = data;

  // Check if the page exists with the given slug and tenant
  const pages = await payload.find({
    collection: 'pages',
    where: {
      and: [
        { slug: { equals: slug } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (pages.totalDocs) {
    return pages.docs[0].id;
  }

  // No page found, create one

  const page = await payload.create({
    collection: 'pages',
    data: {
      ...(managedBy ? { managedBy } : {}),
      header,
      layout,
      name,
      slug,
      tenant,
      visibility: visibility ?? 'public',
      _status: 'published'
    },
    locale,
    req: { transactionID }
  });

  return page;
}
