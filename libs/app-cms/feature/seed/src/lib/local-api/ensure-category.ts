import { getId } from '@codeware/app-cms/util/misc';
import type { Category } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type CategoryData = Pick<Category, 'name' | 'slug' | 'tenant'>;

/**
 * Ensure that a category exist with the given slug.
 *
 * @param payload - Payload instance
 * @param data - Category data
 * @param options - Seed options
 * @returns The category ID if exists or created, otherwise undefined
 */
export async function ensureCategory(
  payload: Payload,
  data: CategoryData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Category | number> {
  const { locale, transactionID, managedBy } = options;
  const { name, slug, tenant } = data;

  // Check if the category exists with the given slug and tenant
  const categories = await payload.find({
    collection: 'categories',
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

  if (categories.totalDocs) {
    return categories.docs[0].id;
  }

  // No category found, create one

  const category = await payload.create({
    collection: 'categories',
    data: {
      ...(managedBy ? { managedBy } : {}),
      name,
      slug,
      tenant
    },
    locale,
    req: { transactionID }
  });

  return category;
}
