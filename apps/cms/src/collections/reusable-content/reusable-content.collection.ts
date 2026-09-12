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
  'block-gallery': false,
  about: false,
  card: true,
  code: true,
  content: true,
  'file-area': true,
  form: true,
  image: true,
  // Retired: `image` and `video` replace it. Blocks already placed keep
  // rendering — this only stops the admin offering it for new content
  media: false,
  'social-media': true,
  spacing: true,
  testimonial: false,
  // Unsupported blocks
  callout: false,
  'feature-cards': false,
  'feature-section': false,
  hero: false,
  'pill-list': false,
  posts: false,
  'reusable-content': false,
  showcase: false,
  tours: false,
  video: false
};

/**
 * Reusable content collection
 */
const reusableContent: CollectionConfig = {
  slug: 'reusable-content',
  access: {
    read: userOrApiKeyAccess(),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  admin: {
    group: adminGroups.content,
    useAsTitle: 'title',
    description: {
      en: 'Reusable content is created so that the same content can be reused in multiple places in pages and posts.',
      sv: 'Återanvändbara element skapas för att samma innehåll ska kunna återanvändas på flera olika ställen i sidor och inlägg.'
    }
  },
  labels: {
    plural: { en: 'Reusable Contents', sv: 'Återanvändbara element' },
    singular: { en: 'Reusable Content', sv: 'Återanvändbart element' }
  },
  fields: [
    {
      name: 'title',
      label: { en: 'Title', sv: 'Titel' },
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'What is the reusable content about? This is just an internal help text to keep the content organized.',
          sv: 'Vad handlar det återanvändbara elementet om? Detta är bara en intern hjälptext för att hålla ordning på innehållet.'
        }
      }
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
      required: true
    }
  ]
};

export default reusableContent;
