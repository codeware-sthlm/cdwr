import { getPage, getPost } from '@codeware/app-cms/data-access';
import type {
  NavigationArrayChildren,
  NavigationArrayItems
} from '@codeware/shared/util/payload-types';
import type { TypedLocale } from 'payload';

import type { FieldComponentServer } from './component-types';

type NavigationRow = NonNullable<NavigationArrayItems>[number];
type NavigationChildRow = NonNullable<NavigationArrayChildren>[number];

/**
 * Walk the form data along a row path such as `items.0.children.1`.
 */
const rowAt = (data: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      return current[Number(segment)];
    }
    return typeof current === 'object' && current !== null
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }, data);

const isRow = (value: unknown): value is NavigationRow | NavigationChildRow =>
  typeof value === 'object' && value !== null;

/**
 * Custom array row label server component for the Navigation collection.
 *
 * Prints the label of a group, or the name of the referenced page or post, or a custom label if provided, instead of the default row label.
 */
export const NavigationArrayRowLabel: FieldComponentServer<
  'RowLabel'
> = async ({
  data,
  i18n: { language },
  path,
  payload,
  rowLabel,
  rowNumber
}) => {
  const locale = language as TypedLocale;

  // `path` names the array (`items`, `items.0.children`); the row is numbered
  const currentItem = rowAt(data, `${path}.${Number(rowNumber ?? 0) - 1}`);

  if (!isRow(currentItem)) {
    return rowLabel;
  }

  if ('type' in currentItem && currentItem.type === 'group') {
    return currentItem.label || rowLabel;
  }

  if (!currentItem.reference) {
    return rowLabel;
  }

  const {
    customLabel,
    labelSource,
    reference: { relationTo, value: itemValue }
  } = currentItem;

  // Use custom label when available
  if (labelSource === 'custom' && customLabel) {
    return customLabel;
  }

  let label: string | undefined;

  // Check reference to pages
  if (relationTo === 'pages') {
    if (typeof itemValue === 'object') {
      label = itemValue.name;
    } else {
      label = (await getPage(payload, itemValue, { locale }))?.name;
    }
  }
  // Check reference to posts
  else if (relationTo === 'posts') {
    if (typeof itemValue === 'object') {
      label = itemValue.title;
    } else {
      label = (await getPost(payload, itemValue, { locale }))?.title;
    }
  }

  // Fallback to default row label
  return label || rowLabel;
};

export default NavigationArrayRowLabel;
