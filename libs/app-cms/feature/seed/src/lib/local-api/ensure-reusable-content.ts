import { getId } from '@codeware/app-cms/util/misc';
import type { ReusableContent } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type ReusableContentData = Pick<
  ReusableContent,
  'layout' | 'tenant' | 'title'
>;

/**
 * Ensure a reusable content document exists with the given title.
 *
 * It carries no slug — an editor names it, not a URL — so it is found the
 * same way a form is: by title and tenant.
 *
 * @param payload - Payload instance
 * @param data - Reusable content data
 * @param options - Seed options
 * @returns The created document or the id if one already exists
 */
export async function ensureReusableContent(
  payload: Payload,
  data: ReusableContentData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<ReusableContent | number> {
  const { locale, transactionID, managedBy } = options;
  const { layout, tenant, title } = data;

  const existing = await payload.find({
    collection: 'reusable-content',
    where: {
      and: [
        { title: { equals: title } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (existing.totalDocs) {
    return existing.docs[0].id;
  }

  return payload.create({
    collection: 'reusable-content',
    data: {
      ...(managedBy ? { managedBy } : {}),
      layout,
      tenant,
      title
    },
    locale,
    req: { transactionID }
  });
}
