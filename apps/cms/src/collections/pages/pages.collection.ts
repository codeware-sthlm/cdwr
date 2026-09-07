import { slugField } from '@codeware/app-cms/ui/fields';
import { seoTab } from '@codeware/app-cms/ui/tabs';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { BlockSlug } from '@codeware/shared/util/payload-types';
import { getActiveKeys } from '@codeware/shared/util/pure';
import type { CollectionConfig } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

/**
 * Define which blocks are available for the layout builder.
 */
// Using a record to make sure all blocks are included and not forgotten
const blocks: Record<BlockSlug, boolean> = {
  about: true,
  callout: true,
  card: true,
  code: true,
  content: true,
  'feature-cards': true,
  'feature-section': true,
  'file-area': true,
  form: true,
  hero: true,
  image: true,
  media: true,
  'pill-list': true,
  posts: true,
  'reusable-content': true,
  showcase: true,
  'social-media': true,
  spacing: true,
  tours: true,
  // Unsupported blocks
  video: false
};

/**
 * Pages collection
 */
const pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['name', 'slug', 'updatedAt', '_status'],
    useAsTitle: 'name',
    description: {
      en: 'Pages are the foundation of the system and are used to build your website. Work with drafts and publish when ready.',
      sv: 'Sidor är fundamentet i systemet och används för att bygga din webbplats. Arbeta med utkast och publicera när det är klart.'
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
    singular: { en: 'Page', sv: 'Sida' },
    plural: { en: 'Pages', sv: 'Sidor' }
  },
  fields: [
    {
      name: 'name',
      label: { en: 'Name', sv: 'Namn' },
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: {
          en: 'The name of the page used for navigation links.',
          sv: 'Sidans namn som används för navigeringslänkar.'
        }
      }
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Content', sv: 'Innehåll' },
          fields: [
            {
              name: 'header',
              type: 'text',
              label: { en: 'Header', sv: 'Rubrik' },
              required: false,
              localized: true,
              admin: {
                description: {
                  en: 'A pre-designed header on top of the page. Provide for a consistent look and feel or customize everything in layout builder.',
                  sv: 'En fördefinierad rubrik längst upp på sidan. Använd för att skapa ett konsekvent utseende, alternativt anpassa allt i innehållsbyggaren.'
                }
              },
              defaultValue: ''
            },
            {
              name: 'layout',
              type: 'blocks',
              label: { en: 'Layout builder', sv: 'Innehållsbyggaren' },
              labels: {
                singular: { en: 'block', sv: 'block' },
                plural: { en: 'blocks', sv: 'block' }
              },
              blockReferences: getActiveKeys<BlockSlug>(blocks),
              blocks: [],
              required: true,
              admin: {
                description: {
                  en: 'Build your page by adding the content you need. E.g. choose "Content" to create one or more columns. Then use the text editor and add more blocks if needed in each column.',
                  sv: 'Bygg din sida genom att lägga till det innehåll du behöver. Välj t.ex. "Innehåll" för att skapa en eller flera kolumner. Skriv sedan i texteditorn och lägg till fler block om det behövs i varje kolumn.'
                },
                disableListColumn: true,
                initCollapsed: true
              }
            }
          ]
        },
        seoTab()
      ]
    },
    slugField({ sourceField: 'name' })
  ],
  versions: {
    drafts: {
      autosave: {
        interval: 3000
      }
    }
  }
};

export default pages;
