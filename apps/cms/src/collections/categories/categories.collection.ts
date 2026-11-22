import { slugField } from '@codeware/app-cms/ui/fields';
import {
  adminGroups,
  managedByField
} from '@codeware/app-cms/util/definitions';
import type { CollectionConfig } from 'payload';

import { relatedContentAdmin } from '../../components/admin/related-content/related-content-admin';
import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';
import {
  agentOr,
  agentWorkspaceWhere
} from '../posts/access/agent-post-access';

/**
 * Categories collection
 */
const categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['name', 'slug'],
    useAsTitle: 'name',
    description: {
      en: 'Categories makes it possible to group blog posts by topic for better overview.',
      sv: 'Kategorier gör det möjligt att gruppera inlägg efter ämne för bättre överblick.'
    },
    ...relatedContentAdmin({
      description: 'relatedContent:categoryDescription',
      sources: [{ collection: 'posts', path: 'categories' }],
      workspace: 'tenant'
    })
  },
  // An agent reads its own workspace's categories, to put a draft in one
  access: {
    read: agentOr(userOrApiKeyAccess(), agentWorkspaceWhere),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Category', sv: 'Kategori' },
    plural: { en: 'Categories', sv: 'Kategorier' }
  },
  fields: [
    managedByField(),
    {
      name: 'name',
      type: 'text',
      localized: true,
      required: true,
      label: { en: 'Name', sv: 'Namn' },
      admin: {
        description: {
          en: 'The name of the category.',
          sv: 'Namnet på kategorin.'
        }
      }
    },
    slugField({ sourceField: 'name' })
  ]
};

export default categories;
