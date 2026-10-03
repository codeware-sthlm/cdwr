import type { Navigation } from '@codeware/shared/util/payload-types';

import type { NavigationItem, NavigationLink } from '../utils/types';

type NavigationRow = NonNullable<Navigation['items']>[number];
type NavigationChildRow = NonNullable<NavigationRow['children']>[number];

/**
 * Resolve a link row, or `null` when it points at nothing.
 */
const resolveLink = (
  {
    customLabel,
    id,
    labelSource,
    reference
  }: Pick<NavigationChildRow, 'customLabel' | 'id' | 'labelSource'> & {
    reference?: NavigationChildRow['reference'] | null;
  },
  appearance: NavigationLink['appearance']
): NavigationLink | null => {
  // Reference can be missing when a page or post is deleted
  if (!reference || typeof reference.value === 'number') {
    return null;
  }

  const { relationTo, value } = reference;

  const label =
    labelSource === 'custom' && customLabel
      ? customLabel
      : relationTo === 'pages'
        ? value.name
        : value.title;

  // Create URL where 'pages' is the default collection and not provided
  const url =
    relationTo === 'pages' ? `/${value.slug}` : `/${relationTo}/${value.slug}`;

  return {
    kind: 'link',
    appearance,
    collection: relationTo,
    key: id ?? String(value.id),
    label,
    url
  };
};

/**
 * Resolve the site navigation tree from navigation data.
 *
 * The router setup must be able to detect `/collection/slug` URLs,
 * where `collection` should be optional.
 *
 * Example:
 * ```ts
 * '/about-us'
 * '/articles'
 * '/posts/my-first-post'
 * '/media/ref-doc-123.pdf'
 * ```
 *
 * A group is dropped when none of its links resolve.
 *
 * @param navigationData - Fetched navigation data.
 * @returns The site navigation tree or an empty array if it has not been setup in the CMS.
 */
export const resolveNavigationTree = (
  navigationData: Navigation[]
): Array<NavigationItem> => {
  const items = navigationData[0]?.items ?? [];

  return items.flatMap((item): NavigationItem[] => {
    // An item saved before groups existed has no type and is a link
    if (item.type === 'group') {
      const children = (item.children ?? []).flatMap(
        (child) => resolveLink(child, 'link') ?? []
      );

      return children.length
        ? [
            {
              kind: 'group',
              key: item.id ?? item.label ?? '',
              label: item.label ?? '',
              children
            }
          ]
        : [];
    }

    const link = resolveLink(item, item.appearance ?? 'link');
    return link ? [link] : [];
  });
};
