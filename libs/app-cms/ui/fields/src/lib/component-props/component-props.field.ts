import { customT } from '@codeware/app-cms/util/i18n';
import type { JSONField } from 'payload';

import {
  customComponentsSlug,
  isPropsObject,
  missingRequired,
  parseComponentSchema,
  siblingRelationId
} from './component-props';

/**
 * The values for the inputs a custom component declares, as one JSON object.
 * The form follows the sibling `component` relationship in the same row.
 */
export const componentPropsField: JSONField = {
  name: 'props',
  type: 'json',
  label: { en: 'Inputs', sv: 'Inputs' },
  admin: {
    description: {
      en: 'The values for the inputs the component declares.',
      sv: 'Värdena för de inputs komponenten deklarerar.'
    },
    components: {
      Field: '@codeware/app-cms/ui/fields/component-props/ComponentProps.client'
    }
  },
  validate: async (value, { req, siblingData }) => {
    const t = customT(req.t);
    if (!isPropsObject(value)) {
      return t('validation:propsNotObject');
    }

    // A missing component is the relationship field's own error
    const { payload } = req;
    const id = siblingRelationId(siblingData, 'component');
    if (id === null) {
      return true;
    }

    const component = await payload
      .findByID({
        collection: customComponentsSlug,
        id,
        depth: 0,
        select: { name: true, propsSchema: true },
        req,
        disableErrors: true
      })
      .catch(() => null);
    const schema = parseComponentSchema(component);
    if (!schema) {
      return true;
    }

    const missing = missingRequired(value, schema.declarations);
    return missing.length === 0
      ? true
      : t('validation:propsRequiredMissing', { names: missing.join(', ') });
  }
};
