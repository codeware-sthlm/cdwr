import { getId } from '@codeware/app-cms/util/misc';
import type { Tag } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type TagData = Pick<Tag, 'brand' | 'name' | 'slug' | 'tenant'> & {
  slug: string;
};

/**
 * Ensure that a tag exists with the given slug.
 *
 * @param payload - Payload instance
 * @param data - Tag data
 * @param options - Seed options
 * @returns The created tag or the id if the tag exists
 */
export async function ensureTag(
  payload: Payload,
  data: TagData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Tag | number> {
  const { locale, transactionID, managedBy } = options;
  const { brand, name, slug, tenant } = data;
  // Check if the tag exists with the given slug and tenant
  const tags = await payload.find({
    collection: 'tags',
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

  if (tags.totalDocs) {
    return tags.docs[0].id;
  }

  // No tag found, create one

  const tag = await payload.create({
    collection: 'tags',
    data: {
      ...(managedBy ? { managedBy } : {}),
      brand,
      name,
      slug,
      tenant
    },
    locale,
    req: { transactionID }
  });

  return tag;
}
