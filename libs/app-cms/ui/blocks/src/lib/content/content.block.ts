import { multiTenantLinkFeature } from '@codeware/app-cms/ui/lexical';
import { enumName } from '@codeware/app-cms/util/db';
import type { BlockSlug } from '@codeware/shared/util/payload-types';
import { getActiveKeys } from '@codeware/shared/util/pure';
import { BlocksFeature, lexicalEditor } from '@payloadcms/richtext-lexical';
import type { Block } from 'payload';

/**
 * Define which blocks are available as rich text plugins.
 */
// Using a record to make sure all blocks are included and not forgotten
const richTextBlocks: Record<BlockSlug, boolean> = {
  about: false,
  card: true,
  code: true,
  form: true,
  image: true,
  media: true,
  'social-media': true,
  spacing: true,
  // Unsupported blocks
  callout: false,
  content: false,
  'feature-cards': false,
  'feature-section': false,
  'file-area': false,
  hero: false,
  'pill-list': false,
  posts: false,
  'reusable-content': false,
  showcase: false,
  tours: false,
  video: false
};

/** Define which blocks are available within the content block itself. */
const inlineBlocks: Record<BlockSlug, boolean> = {
  about: false,
  card: true,
  code: true,
  form: true,
  image: true,
  media: true,
  'reusable-content': true,
  'social-media': true,
  spacing: true,
  // Unsupported blocks
  callout: false,
  content: false,
  'feature-cards': false,
  'feature-section': false,
  'file-area': false,
  hero: false,
  'pill-list': false,
  posts: false,
  showcase: false,
  tours: false,
  video: false
};

/**
 * Content block for defining a column layout with rich text content.
 */
export const contentBlock: Block = {
  slug: 'content',
  interfaceName: 'ContentBlock',
  labels: {
    singular: { en: 'Content', sv: 'Innehåll' },
    plural: { en: 'Content', sv: 'Innehåll' }
  },
  fields: [
    {
      name: 'columns',
      type: 'array',
      label: false,
      labels: {
        singular: { en: 'Column', sv: 'Kolumn' },
        plural: { en: 'Columns', sv: 'Kolumner' }
      },
      admin: {
        initCollapsed: true
      },
      fields: [
        {
          name: 'size',
          type: 'select',
          label: { en: 'Width', sv: 'Bredd' },
          defaultValue: 'full',
          enumName: enumName('content_column_size'),
          options: [
            {
              label: { en: 'One Third', sv: 'En tredjedel' },
              value: 'one-third'
            },
            {
              label: { en: 'Half', sv: 'Hälften' },
              value: 'half'
            },
            {
              label: { en: 'Two Thirds', sv: 'Två tredjedelar' },
              value: 'two-thirds'
            },
            {
              label: { en: 'Full', sv: 'Fullbredd' },
              value: 'full'
            }
          ]
        },
        {
          name: 'richText',
          type: 'richText',
          editor: lexicalEditor({
            features: ({ rootFeatures }) => {
              return [
                ...rootFeatures,
                BlocksFeature({
                  blocks: getActiveKeys<BlockSlug>(richTextBlocks)
                }),
                multiTenantLinkFeature()
              ];
            }
          }),
          label: false,
          localized: true
        },
        {
          name: 'blocks',
          type: 'blocks',
          labels: {
            singular: { en: 'Block', sv: 'Block' },
            plural: { en: 'Blocks', sv: 'Block' }
          },
          blockReferences: getActiveKeys<BlockSlug>(inlineBlocks),
          blocks: [],
          label: false
        }
      ]
    }
  ]
};
