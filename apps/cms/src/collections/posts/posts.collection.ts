import {
  mediaUploadField,
  slugField,
  visibilityField
} from '@codeware/app-cms/ui/fields';
import { multiTenantLinkFeature } from '@codeware/app-cms/ui/lexical';
import { seoTab } from '@codeware/app-cms/ui/tabs';
import {
  adminGroups,
  managedByField
} from '@codeware/app-cms/util/definitions';
import { filterByTenantScope } from '@codeware/app-cms/util/filters';
import { isAgent } from '@codeware/app-cms/util/misc';
import type { BlockSlug } from '@codeware/shared/util/payload-types';
import { getActiveKeys } from '@codeware/shared/util/pure';
import { BlocksFeature } from '@payloadcms/richtext-lexical';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import type { CollectionConfig } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

import {
  agentDraftsWhere,
  agentMayCreate,
  agentOr
} from './access/agent-post-access';
import {
  agentDraftOnly,
  agentNeverPublishes
} from './hooks/agent-draft-only.hook';

/**
 * Define which blocks are available for the rich text editor.
 */
// Using a record to make sure all blocks are included and not forgotten
const blocks: Record<BlockSlug, boolean> = {
  'block-gallery': false,
  about: false,
  card: true,
  code: true,
  'custom-component': false,
  image: true,
  'social-media': true,
  spacing: true,
  testimonial: false,
  'theme-studio': false,
  // Unsupported blocks
  callout: false,
  'coming-soon': false,
  content: false,
  'feature-cards': false,
  'feature-section': false,
  'file-area': false,
  form: false,
  gallery: false,
  hero: false,
  'pill-list': false,
  posts: false,
  'reusable-content': false,
  showcase: false,
  tours: false
};

/**
 * Posts collection
 */
const posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['title', 'updatedAt', '_status'],
    useAsTitle: 'title',
    description: {
      en: 'Posts are standalone pages such as articles or blog posts. Work with drafts and publish when ready.',
      sv: 'Inlägg är fristående sidor som exempelvis artiklar eller bloggposter. Arbeta med utkast och publicera när det är klart.'
    }
  },
  // An agent creates drafts and reads back the ones it drafted, trashed ones
  // included; it never updates, trashes or deletes, so it can't publish
  // through a version restore either
  access: {
    read: agentOr(
      userOrApiKeyAccess({ hasStatus: true, hasVisibility: true }),
      agentDraftsWhere()
    ),
    readVersions: agentOr(
      userOnlyAccess({ tenantPath: 'version.tenant' }),
      agentDraftsWhere('version')
    ),
    create: agentOr(userOnlyAccess(), agentMayCreate),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  hooks: {
    beforeOperation: [agentDraftOnly],
    beforeChange: [agentNeverPublishes]
  },
  trash: true,
  labels: {
    singular: { en: 'Post', sv: 'Inlägg' },
    plural: { en: 'Posts', sv: 'Inlägg' }
  },
  fields: [
    managedByField(),
    {
      name: 'title',
      label: { en: 'Title', sv: 'Titel' },
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: {
          en: 'The title of the post and name used in navigation.',
          sv: 'Inläggs titel och namn som används i navigering.'
        }
      }
    },
    {
      type: 'row',
      fields: [slugField({ sourceField: 'title' }), visibilityField()]
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Content', sv: 'Innehåll' },
          fields: [
            mediaUploadField({
              name: 'heroImage',
              mimeTypeSlugs: ['image']
            }),
            {
              name: 'content',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  BlocksFeature({
                    blocks: [...getActiveKeys<BlockSlug>(blocks)]
                  }),
                  multiTenantLinkFeature()
                ]
              }),
              label: false,
              localized: true,
              required: true,
              admin: {
                disableListColumn: true,
                disableListFilter: true
              }
            }
          ]
        },
        {
          label: { en: 'Meta', sv: 'Metadata' },
          fields: [
            {
              name: 'authors',
              label: { en: 'Authors', sv: 'Författare' },
              type: 'relationship',
              relationTo: 'users',
              hasMany: true,
              filterOptions: ({ req }) => filterByTenantScope(req, 'users'),
              admin: {
                description: {
                  en: 'The authors of the post.',
                  sv: 'Författare till inlägget.'
                }
              }
            },
            {
              name: 'relatedPosts',
              type: 'relationship',
              label: { en: 'Related Posts', sv: 'Relaterade inlägg' },
              admin: {
                disableListColumn: true
              },
              filterOptions: ({ id }) => ({ id: { not_in: [id] } }),
              hasMany: true,
              relationTo: 'posts'
            },
            {
              name: 'categories',
              type: 'relationship',
              label: { en: 'Categories', sv: 'Kategorier' },
              hasMany: true,
              relationTo: 'categories'
            },
            {
              // Set by `agentDraftOnly` alone: no user can set it, and no edit
              // can clear it, so an agent always finds its own drafts
              name: 'draftedBy',
              type: 'relationship',
              label: { en: 'Drafted by', sv: 'Utkast av' },
              relationTo: 'agents',
              access: {
                create: ({ req: { user } }) => isAgent(user),
                update: () => false
              },
              admin: {
                readOnly: true,
                condition: (data) => Boolean(data?.['draftedBy']),
                description: {
                  en: 'The agent that drafted the post.',
                  sv: 'Agenten som skrev utkastet.'
                }
              }
            }
          ]
        },
        seoTab()
      ]
    }
  ],
  versions: {
    drafts: {
      autosave: {
        interval: 3000
      }
    }
  }
};

export default posts;
