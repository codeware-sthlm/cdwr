import { getId } from '@codeware/app-cms/util/misc';
import type { Navigation } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

type NavigationItem = NonNullable<Pick<Navigation, 'items'>['items']>[number];

// Refine the model to type safe the data
type NavigationReference = Pick<
  NavigationItem,
  'customLabel' | 'labelSource' | 'appearance'
> & { reference: NonNullable<NavigationItem['reference']> };

const isGroup = (item: NavigationItem) => item.type === 'group';

const hasReference = (
  item: NavigationItem
): item is NavigationItem & Pick<NavigationReference, 'reference'> =>
  !!item.reference;
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
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /**
     * Let an item the data also names take its label and appearance from the
     * data. Off, an existing item is left as it is: it may be an editor's
     * choice, and a stored `link` cannot be told apart from the default
     */
    definitionWins?: boolean;
  }
): Promise<{
  navigation: Navigation | number;
  items: Array<NavigationReference>;
}> {
  const { locale, transactionID, definitionWins = false } = options;
  const { items: dataItems, tenant } = data;

  if (!tenant) {
    throw new Error('Tenant is required');
  }

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
    // rather than compared against or written back. A group has no reference
    // of its own and is kept as it is
    const kept = (storedItems ?? []).filter(
      (item) => isGroup(item) || hasReference(item)
    );
    const dangling = (storedItems?.length ?? 0) - kept.length;

    const sameTarget = (
      a: Pick<NavigationReference, 'reference'>,
      b: Pick<NavigationReference, 'reference'>
    ) =>
      a.reference.relationTo === b.reference.relationTo &&
      getId(a.reference.value) === getId(b.reference.value);

    const missingItems = dataItems.filter(
      (dataItem) =>
        !kept.some((item) => hasReference(item) && sameTarget(item, dataItem))
    );

    // What the data says about an item both name, when the data is the truth
    let restated = 0;
    const items = kept.map((item) => {
      const stated =
        definitionWins && hasReference(item)
          ? dataItems.find((dataItem) => sameTarget(item, dataItem))
          : undefined;
      if (
        !stated ||
        ((stated.appearance ?? 'link') === (item.appearance ?? 'link') &&
          (stated.labelSource ?? 'document') ===
            (item.labelSource ?? 'document') &&
          (stated.customLabel ?? null) === (item.customLabel ?? null))
      ) {
        return item;
      }
      restated++;
      return {
        ...item,
        appearance: stated.appearance,
        labelSource: stated.labelSource,
        customLabel: stated.customLabel
      };
    });

    // The document exists, so it is always updated in place — even when every
    // stored item was dangling. Falling through to create would give the
    // tenant a second navigation
    if (missingItems.length || dangling || restated) {
      const itemsToUpdate = items.concat(missingItems).map((item) =>
        isGroup(item)
          ? item
          : {
              id: item.id,
              type: 'link' as const,
              appearance: item.appearance ?? 'link',
              customLabel: item.customLabel,
              reference: item.reference,
              labelSource: item.labelSource ?? 'document'
            }
      );

      await payload.update({
        collection: 'navigation',
        id: docId,
        data: {
          items: itemsToUpdate
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

  const itemsToAdd = dataItems.map(
    ({
      appearance = 'link',
      customLabel,
      labelSource = 'document',
      reference
    }) => ({
      reference,
      customLabel,
      labelSource,
      appearance
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
