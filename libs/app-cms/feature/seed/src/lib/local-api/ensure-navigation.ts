import { getId } from '@codeware/app-cms/util/misc';
import type { Navigation } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

// Refine the model to type safe the data
type NavigationReference = Pick<
  NonNullable<Pick<Navigation, 'items'>['items']>[number],
  'reference' | 'customLabel' | 'labelSource'
>;
export type NavigationData = NonNullable<Pick<Navigation, 'tenant'>> & {
  items: Array<NavigationReference>;
};

/**
 * Ensure that navigation items exist for the given tenant.
 *
 * Navigation collection is handled like a global via multi-tenant plugin.
 * This means each tenant has one row with all the items defined.
 *
 * Navigation labels is limited to the document title only.
 *
 * Navigation is updated in place when provided data contains new items.
 * Existing items are kept unchanged; the only thing ever removed is an item
 * whose page no longer exists, since it points at nothing.
 *
 * @param payload - Payload instance
 * @param data - Navigation data
 * @param options - Seed options
 * @returns The navigation ID if exists or the object when created, otherwise undefined, with the items that was added.
 */
export async function ensureNavigation(
  payload: Payload,
  data: NavigationData,
  options: { locale: TypedLocale; transactionID: string | number | undefined }
): Promise<{
  navigation: Navigation | number;
  items: Array<NavigationReference>;
}> {
  const { locale, transactionID } = options;
  const { items: dataItems, tenant } = data;

  if (!tenant) {
    throw new Error('Tenant is required');
  }

  let itemsToAdd: Array<NavigationReference> = [];

  // Check if the navigation exists with the given tenant
  const navigations = await payload.find({
    collection: 'navigation',
    where: {
      tenant: { in: [getId(tenant)] }
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (navigations.totalDocs) {
    const { items: storedItems, id: docId } = navigations.docs[0];

    // An item whose page was deleted keeps its row but loses its reference,
    // and it points at nothing — so it is not navigation and is left behind
    // rather than compared against or written back
    const items = (storedItems ?? []).filter((item) => item.reference);
    const dangling = (storedItems?.length ?? 0) - items.length;

    const missingItems = dataItems.filter(
      ({ reference }) =>
        !items.some(
          (item) =>
            item.reference.relationTo === reference.relationTo &&
            getId(item.reference.value) === getId(reference.value)
        )
    );

    // The document exists, so it is always updated in place — even when every
    // stored item was dangling. Falling through to create would give the
    // tenant a second navigation
    if (missingItems.length || dangling) {
      itemsToAdd = items
        .concat(missingItems)
        .map(({ customLabel, id, labelSource = 'document', reference }) => ({
          id,
          customLabel,
          reference,
          labelSource
        }));

      await payload.update({
        collection: 'navigation',
        id: docId,
        data: {
          items: itemsToAdd
        },
        locale,
        req: { transactionID }
      });
    }

    return {
      navigation: docId,
      items: missingItems
    };
  }

  // No navigation found, create one with data items

  itemsToAdd = dataItems.map(
    ({ customLabel, labelSource = 'document', reference }) => ({
      reference,
      customLabel,
      labelSource
    })
  );

  const navigation = await payload.create({
    collection: 'navigation',
    data: {
      items: itemsToAdd,
      tenant
    },
    locale,
    req: { transactionID }
  });

  return { navigation, items: itemsToAdd };
}
