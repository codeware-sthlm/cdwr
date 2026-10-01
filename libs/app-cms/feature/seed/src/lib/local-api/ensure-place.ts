import type { Place } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type PlaceData = Pick<
  Place,
  'kind' | 'name' | 'note' | 'tenant' | 'url'
>;

/**
 * Ensure that a place exist with the given name for the tenant.
 *
 * Places have no slug — the name is what an editor recognises them by, so it
 * doubles as the lookup key within a tenant.
 *
 * @param payload - Payload instance
 * @param data - Place data
 * @param options - Seed options
 * @returns The created place or the id if the place exists
 */
export async function ensurePlace(
  payload: Payload,
  data: PlaceData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Place | number> {
  const { locale, transactionID, managedBy } = options;
  const { name, tenant } = data;

  const places = await payload.find({
    collection: 'places',
    where: {
      and: [{ name: { equals: name } }, { tenant: { in: [tenant] } }]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (places.totalDocs) {
    return places.docs[0].id;
  }

  const place = await payload.create({
    collection: 'places',
    data: { ...(managedBy ? { managedBy } : {}), ...data },
    context: { seedAction: true },
    locale,
    req: { transactionID }
  });

  return place;
}
