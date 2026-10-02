import type { CodeField, Field, RowField } from 'payload';

import { sourceName } from './names';

/**
 * The component's source: a code field, shown by the studio rather than by a
 * field component of its own. The collection supplies the label and access.
 */
export const tsxSourceField: CodeField = {
  name: sourceName,
  type: 'code',
  admin: { language: 'typescript' },
  required: true
};

/**
 * Lays out the component studio over `fields`.
 *
 * An unnamed row holds no data, so the fields keep their paths and columns.
 * The studio renders the source, the build and, in its side panel, the array
 * of declared inputs; any other field in the row is not shown.
 */
export const componentStudioField = (fields: Field[]): RowField => ({
  type: 'row',
  fields,
  admin: {
    components: {
      Field:
        '@codeware/app-cms/ui/fields/component-studio/ComponentStudio.client'
    }
  }
});
