import { mediaUploadField, slugField } from '@codeware/app-cms/ui/fields';
import { multiTenantLinkFeature } from '@codeware/app-cms/ui/lexical';
import { seoTab } from '@codeware/app-cms/ui/tabs';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { filterByTenantScope } from '@codeware/app-cms/util/filters';
import type { BlockSlug } from '@codeware/shared/util/payload-types';
import { getActiveKeys } from '@codeware/shared/util/pure';
import { BlocksFeature } from '@payloadcms/richtext-lexical';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import type { CollectionConfig } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

/**
 * Define which blocks are available for the rich text editor.
 */
// Using a record to make sure all blocks are included and not forgotten
const blocks: Record<BlockSlug, boolean> = {
  'block-gallery': false,
  about: false,
  card: true,
  code: true,
  image: true,
  // Retired: `image` replaces it. Blocks already placed keep
  // rendering — this only stops the admin offering it for new content
  media: false,
  'social-media': true,
  spacing: true,
  testimonial: false,
  // Unsupported blocks
  callout: false,
  content: false,
  'feature-cards': false,
  'feature-section': false,
  'file-area': false,
  form: false,
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
  access: {
    read: userOrApiKeyAccess(true),
    readVersions: userOnlyAccess({ tenantPath: 'version.tenant' }),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Post', sv: 'Inlägg' },
    plural: { en: 'Posts', sv: 'Inlägg' }
  },
  fields: [
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
              name: 'relatedPosts',
              type: 'relationship',
              label: { en: 'Related Posts', sv: 'Relaterade inlägg' },
              admin: {
                position: 'sidebar',
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
              admin: {
                position: 'sidebar'
              },
              hasMany: true,
              relationTo: 'categories'
            }
          ]
        },
        seoTab()
      ]
    },
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
        },
        position: 'sidebar'
      }
    },
    slugField({ sourceField: 'title' })
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
