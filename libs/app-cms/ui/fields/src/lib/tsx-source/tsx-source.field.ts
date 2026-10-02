import type { CodeField } from 'payload';

/**
 * Source editor for a React component: a Monaco model that understands JSX.
 * The collection supplies the name, label and access.
 */
export const tsxSourceField: CodeField = {
  name: 'source',
  type: 'code',
  admin: {
    language: 'typescript',
    components: {
      Field: '@codeware/app-cms/ui/fields/tsx-source/TsxSource.client'
    }
  },
  required: true
};
