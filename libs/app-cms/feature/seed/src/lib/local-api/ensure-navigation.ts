import { getId } from '@codeware/app-cms/util/misc';
import type {
  Navigation,
  NavigationArrayChildren
} from '@codeware/shared/util/payload-types';
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
type NavigationChild = NonNullable<NavigationArrayChildren>[number];

// The type says a child always has a reference; a child whose page was
// deleted keeps its row and loses it, the same as a top-level link
const hasChildReference = (child: NavigationChild) =>
  Boolean((child as Partial<NavigationChild>).reference);

/**
 * A stored group without the children whose pages are gone, or null when
 * none is left: a group with nothing to open to is not navigation either.
 */
const pruneGroup = (item: NavigationItem): NavigationItem | null => {
  const children = (item.children ?? []).filter(hasChildReference);
  return children.length ? { ...item, children } : null;
};

/** A group is a label in the menu; its links are owned by whoever states it */
export type NavigationGroupData = {
  label: string;
  children: Array<
    Pick<NavigationChild, 'reference' | 'labelSource' | 'customLabel'>
  >;
};

export type NavigationItemData = NavigationReference | NavigationGroupData;

const isGroupData = (item: NavigationItemData): item is NavigationGroupData =>
  'children' in item;

export type NavigationData = NonNullable<Pick<Navigation, 'tenant'>> & {
  items: Array<NavigationItemData>;
};

const toStoredChild = ({
  reference,
  labelSource,
  customLabel
}: NavigationGroupData['children'][number]) => ({
  reference,
  labelSource: labelSource ?? ('document' as const),
  customLabel: customLabel ?? null
});

/** What a definition item is stored as, a link by default */
const toStored = (item: NavigationItemData) =>
  isGroupData(item)
    ? {
        type: 'group' as const,
        label: item.label,
        children: item.children.map(toStoredChild)
      }
    : {
        type: 'link' as const,
        appearance: item.appearance ?? ('link' as const),
        customLabel: item.customLabel,
        reference: item.reference,
        labelSource: item.labelSource ?? ('document' as const)
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
 * whose page no longer exists, since it points at nothing. A group is matched
 * by its label.
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
     * data; a group takes its links. Off, an existing item is left as it is:
     * it may be an editor's choice, and a stored `link` cannot be told apart
     * from the default
     */
    definitionWins?: boolean;
  }
): Promise<{
  navigation: Navigation | number;
  items: Array<NavigationItemData>;
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
    // rather than compared against or written back. A group loses such
    // children the same way, and goes with them when none is left
    const kept: Array<NavigationItem> = [];
    let dangling = 0;
    for (const item of storedItems ?? []) {
      if (isGroup(item)) {
        const pruned = pruneGroup(item);
        if (pruned) {
          kept.push(pruned);
        }
        if (pruned?.children?.length !== item.children?.length) {
          dangling++;
        }
      } else if (hasReference(item)) {
        kept.push(item);
      } else {
        dangling++;
      }
    }

    const sameTarget = (
      a: Pick<NavigationReference, 'reference'>,
      b: Pick<NavigationReference, 'reference'>
    ) =>
      a.reference.relationTo === b.reference.relationTo &&
      getId(a.reference.value) === getId(b.reference.value);

    const missingItems = dataItems.filter((dataItem) =>
      isGroupData(dataItem)
        ? !kept.some((item) => isGroup(item) && item.label === dataItem.label)
        : !kept.some((item) => hasReference(item) && sameTarget(item, dataItem))
    );

    const childKey = ({
      reference,
      labelSource,
      customLabel
    }: NavigationGroupData['children'][number]) =>
      [
        reference.relationTo,
        getId(reference.value),
        labelSource ?? 'document',
        customLabel ?? null
      ].join('|');

    // What the data says about an item both name, when the data is the truth
    let restated = 0;
    const items = kept.map((item) => {
      if (!definitionWins) {
        return item;
      }

      if (isGroup(item)) {
        const stated = dataItems.find(
          (dataItem): dataItem is NavigationGroupData =>
            isGroupData(dataItem) && dataItem.label === item.label
        );
        if (
          !stated ||
          (item.children ?? []).map(childKey).join(',') ===
            stated.children.map(childKey).join(',')
        ) {
          return item;
        }
        restated++;
        return { ...item, children: stated.children.map(toStoredChild) };
      }

      const stated = hasReference(item)
        ? dataItems.find(
            (dataItem): dataItem is NavigationReference =>
              !isGroupData(dataItem) && sameTarget(item, dataItem)
          )
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
      const itemsToUpdate = [
        ...items.map((item) =>
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
        ),
        ...missingItems.map(toStored)
      ];

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

  const itemsToAdd = dataItems.map(toStored);

  const navigation = await payload.create({
    collection: 'navigation',
    data: {
      items: itemsToAdd,
      tenant
    },
    locale,
    req: { transactionID }
  });

  return { navigation, items: dataItems };
}
