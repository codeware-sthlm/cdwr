import { Navigation } from '@codeware/shared/util/payload-types';

import type { NavigationItem } from '../utils/types';

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
 * @param navigationData - Fetched navigation data.
 * @returns The site navigation tree or an empty array if it has not been setup in the CMS.
 */
export const resolveNavigationTree = (
  navigationData: Navigation[]
): Array<NavigationItem> => {
  const items = navigationData[0]?.items ?? [];

  return items.reduce(
    (acc, { appearance, customLabel, id, labelSource, reference }) => {
      // Reference can be missing when a page or post is deleted
      if (!reference || typeof reference.value === 'number') {
        return acc;
      }

      const { relationTo, value } = reference;

      const key = id ?? String(value.id);

      const label =
        labelSource === 'custom' && customLabel
          ? customLabel
          : relationTo === 'pages'
            ? value.name
            : value.title;

      // Create URL where 'pages' is the default collection and not provided
      const url =
        relationTo === 'pages'
          ? `/${value.slug}`
          : `/${relationTo}/${value.slug}`;

      return [
        ...acc,
        {
          appearance: appearance ?? 'link',
          collection: relationTo,
          key,
          label,
          url
        }
      ];
    },
    [] as Array<NavigationItem>
  );
};
