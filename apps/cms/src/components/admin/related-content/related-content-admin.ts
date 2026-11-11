import { customT } from '@codeware/app-cms/util/i18n';
import type { CollectionConfig } from 'payload';

import {
  type RelatedContentConfig,
  relatedContentKey
} from './related-content';

/**
 * Admin options adding a Content tab to a collection's documents, counting
 * what points at the document. Spread into the collection's `admin`.
 */
export const relatedContentAdmin = (config: RelatedContentConfig) =>
  ({
    custom: { [relatedContentKey]: config },
    components: {
      views: {
        edit: {
          content: {
            Component:
              '@codeware/apps/cms/components/admin/related-content/RelatedContentView',
            path: '/content',
            // Between Edit (100) and Versions (300)
            tab: {
              label: ({ t }) => customT(t)('relatedContent:tab'),
              href: '/content',
              order: 200
            }
          }
        }
      }
    }
  }) satisfies NonNullable<CollectionConfig['admin']>;
