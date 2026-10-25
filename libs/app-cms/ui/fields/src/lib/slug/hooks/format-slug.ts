import type { FieldHook } from 'payload';

/**
 * Formats a string into a dash-separated slug.
 *
 * @param val The string to format
 * @returns
 */
const format = (val: string): string =>
  val
    // Replace spaces with dashes
    .replace(/ /g, '-')
    // Replace multiple dashes with a single dash
    .replace(/-+/g, '-')
    // Remove all non-word characters
    .replace(/[^\w-/]+/g, '')
    .toLowerCase();

/**
 * Creates a slug for a field to which it is applied.
 * Commonly used as collection identifier.
 *
 * - Limited to collections only
 *
 * @param fallbackField The field to use as a fallback if the slug value is not provided
 * @returns The slug
 * @throws If the fallback field is used and does not exist for the collection
 *
 * @example
 *
 * // 'My page'             -> 'my-page'
 * // 'My page 123'         -> 'my-page-123'
 * // 'My page - 123'       -> 'my-page-123'
 * // 'The header!'         -> 'the-header'
 * // 'The $?$%^&*() title' -> 'the-title'
 */
export const formatSlug =
  (fallbackField: string): FieldHook =>
  ({ value, originalDoc, data, collection, req: { payload } }) => {
    if (value && typeof value === 'string') {
      return format(value);
    }

    // Type-safe collection guard
    if (!collection) {
      payload.logger.error(
        'formatSlug hook called without a collection, it should not happen'
      );
      return value;
    }

    // Catch developer field name typos; flattened so fields in unnamed tabs count
    if (
      !collection.flattenedFields.some((field) => field.name === fallbackField)
    ) {
      throw new Error(
        `formatSlug hook called with fallback field '${fallbackField}' that does not exist`
      );
    }

    // Get from patch data or original document data
    const fallbackData = data?.[fallbackField] || originalDoc?.[fallbackField];

    if (fallbackData && typeof fallbackData === 'string') {
      return format(fallbackData);
    }

    // The form could be incomplete or the fallback field could have a bad type.
    // Leave this up to the developer to fix in case the slug is not as expected.
    return value;
  };
