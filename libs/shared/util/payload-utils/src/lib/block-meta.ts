/* AUTO-GENERATED — do not edit manually. Run `pnpm nx sync` to update. */

import type { BlockSlug } from '@codeware/shared/util/payload-types';

/** One field an editor fills in, as the admin presents it. */
export type BlockFieldMeta = {
  name: string;
  type: string;
  required?: boolean;
  localized?: boolean;
  label?: string;
  description?: string;
  /** For a blocks field: the slugs it accepts */
  blocks?: Array<string>;
  /** Nested one level, for a group or an array */
  fields?: Array<BlockFieldMeta>;
};

/**
 * A layout field that offers blocks.
 *
 * `posts` and `tours` are absent on purpose: they gate their blocks inside a
 * Lexical editor config, which cannot be read from the block definitions.
 */
export type BlockHost = 'pages' | 'reusable-content';

export type BlockMeta = {
  slug: BlockSlug;
  label: string;
  /** Empty means registered and rendered, but not offered anywhere */
  availableIn: Array<BlockHost>;
  fields: Array<BlockFieldMeta>;
};

/**
 * Every registered block, and what an editor fills in for it.
 *
 * Keyed by `BlockSlug`, so a block registered in Payload without an entry
 * here stops the build — the same guarantee `blocksMap` gives the renderer.
 * `nx sync --check` is what keeps the values current.
 */
export const BLOCK_META: Record<BlockSlug, BlockMeta> = {
  about: {
    slug: 'about',
    label: 'About',
    availableIn: ['pages'],
    fields: [
      {
        name: 'heading',
        type: 'text',
        label: 'Heading',
        description: 'Optional heading shown above the deployment details.'
      }
    ]
  },
  'block-gallery': {
    slug: 'block-gallery',
    label: 'Block gallery',
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: 'Eyebrow',
        description: 'Small uppercase label shown above the heading'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Heading'
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: 'Intro',
        description: 'Short paragraph below the heading'
      },
      {
        name: 'mode',
        type: 'select',
        required: true,
        label: 'Mode',
        description:
          'The index lists everything registered. The browser shows one block with its fields and an example, and steps to the next.'
      }
    ]
  },
  callout: {
    slug: 'callout',
    label: 'Callout',
    availableIn: ['pages'],
    fields: [
      {
        name: 'showMark',
        type: 'checkbox',
        label: 'Show brand mark'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Heading'
      },
      {
        name: 'body',
        type: 'textarea',
        localized: true,
        label: 'Body'
      },
      {
        name: 'image',
        type: 'upload',
        label: 'Image',
        description:
          'Optional. Sits beside the text and turns the band into a two-column section.'
      },
      {
        name: 'link',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in new tab'
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            label: 'Document to link to'
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            label: 'Custom URL',
            description:
              'Add protocol (http:// or https://) if the link is external'
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: 'Label'
          }
        ]
      }
    ]
  },
  card: {
    slug: 'card',
    label: 'Card',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'cards',
        type: 'array',
        fields: [
          {
            name: 'brand',
            type: 'group',
            label: 'Branding',
            description: 'Select an icon and color that represent the card'
          },
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: 'Title'
          },
          {
            name: 'description',
            type: 'text',
            localized: true,
            label: 'Description',
            description: 'A text that will complement the title'
          },
          {
            name: 'content',
            type: 'textarea',
            required: true,
            localized: true,
            label: 'Main content'
          },
          {
            name: 'enableLink',
            type: 'checkbox',
            label: 'Card link',
            description: 'Let the card link to a page or external URL'
          },
          {
            name: 'link',
            type: 'group'
          }
        ]
      }
    ]
  },
  code: {
    slug: 'code',
    label: 'Code',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'language',
        type: 'select',
        required: true,
        label: 'Language'
      },
      {
        name: 'code',
        type: 'code',
        required: true
      }
    ]
  },
  content: {
    slug: 'content',
    label: 'Content',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'columns',
        type: 'array',
        fields: [
          {
            name: 'size',
            type: 'select',
            label: 'Width'
          },
          {
            name: 'richText',
            type: 'richText',
            localized: true
          },
          {
            name: 'blocks',
            type: 'blocks',
            blocks: [
              'card',
              'code',
              'form',
              'image',
              'media',
              'reusable-content',
              'social-media',
              'spacing'
            ]
          }
        ]
      }
    ]
  },
  'feature-cards': {
    slug: 'feature-cards',
    label: 'Feature cards',
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: 'Eyebrow',
        description: 'Small uppercase label shown above the heading'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Heading'
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: 'Intro',
        description: 'Short paragraph below the heading'
      },
      {
        name: 'columns',
        type: 'select',
        label: 'Columns',
        description: 'Desktop column count. Auto fits to the number of items.'
      },
      {
        name: 'items',
        type: 'array',
        label: 'Cards',
        fields: [
          {
            name: 'brand',
            type: 'group',
            label: 'Branding',
            description: 'Icon and color for this item'
          },
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: 'Title'
          },
          {
            name: 'description',
            type: 'textarea',
            required: true,
            localized: true,
            label: 'Description'
          }
        ]
      }
    ]
  },
  'feature-section': {
    slug: 'feature-section',
    label: 'Feature section',
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: 'Eyebrow',
        description: 'Small uppercase label shown above the heading'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Heading'
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: 'Intro',
        description: 'Short paragraph below the heading'
      },
      {
        name: 'enableLink',
        type: 'checkbox',
        label: 'Show a link below the intro'
      },
      {
        name: 'link',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in new tab'
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            label: 'Document to link to'
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            label: 'Custom URL',
            description:
              'Add protocol (http:// or https://) if the link is external'
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: 'Label'
          }
        ]
      },
      {
        name: 'media',
        type: 'upload',
        label: 'Visual',
        description: 'The image that carries the claim above it.'
      },
      {
        name: 'subFeatures',
        type: 'array',
        label: 'Supporting points',
        description:
          'Shown as one divided row beneath the visual. Two to four reads best.',
        fields: [
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: 'Title'
          },
          {
            name: 'body',
            type: 'textarea',
            required: true,
            localized: true,
            label: 'Body'
          }
        ]
      }
    ]
  },
  'file-area': {
    slug: 'file-area',
    label: 'File Area',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'tags',
        type: 'relationship',
        label: 'Tags',
        description:
          'Select tags that represent the files to show in the file area.'
      },
      {
        name: 'files',
        type: 'array',
        fields: [
          {
            name: 'media',
            type: 'relationship'
          }
        ]
      }
    ]
  },
  form: {
    slug: 'form',
    label: 'Forms',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'form',
        type: 'relationship',
        required: true
      },
      {
        name: 'enableIntro',
        type: 'checkbox',
        label: 'Add an introduction to the form'
      },
      {
        name: 'introContent',
        type: 'richText',
        label: 'Introduction'
      }
    ]
  },
  hero: {
    slug: 'hero',
    label: 'Hero',
    availableIn: ['pages'],
    fields: [
      {
        name: 'badge',
        type: 'text',
        localized: true,
        label: 'Badge',
        description:
          'Optional pill above the headline. The tenant logo is shown automatically when available.'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Headline'
      },
      {
        name: 'lede',
        type: 'textarea',
        required: true,
        localized: true,
        label: 'Introduction',
        description:
          'The part that hooks the reader and conveys the most essential information (often answering who, what, when, where, why).'
      },
      {
        name: 'media',
        type: 'upload',
        label: 'Visual',
        description:
          'Shown below the actions. What makes the claim above checkable rather than asserted.'
      },
      {
        name: 'actions',
        type: 'array',
        label: 'Actions',
        fields: [
          {
            name: 'link',
            type: 'group'
          },
          {
            name: 'emphasis',
            type: 'select',
            label: 'Emphasis'
          }
        ]
      }
    ]
  },
  image: {
    slug: 'image',
    label: 'Image',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'media',
        type: 'upload',
        required: true,
        label: 'Image',
        description: 'Select an image.'
      }
    ]
  },
  media: {
    slug: 'media',
    label: 'Media',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'media',
        type: 'upload',
        required: true
      }
    ]
  },
  'pill-list': {
    slug: 'pill-list',
    label: 'Pill list',
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: 'Eyebrow',
        description: 'Small uppercase label shown above the heading'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Heading'
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: 'Intro',
        description: 'Short paragraph below the heading'
      },
      {
        name: 'surface',
        type: 'select',
        label: 'Surface',
        description: 'Background treatment'
      },
      {
        name: 'items',
        type: 'array',
        label: 'Pills',
        fields: [
          {
            name: 'label',
            type: 'text',
            required: true,
            label: 'Label',
            description: 'e.g. "my-package"'
          },
          {
            name: 'url',
            type: 'text',
            label: 'URL',
            description: 'Optional external link'
          }
        ]
      }
    ]
  },
  posts: {
    slug: 'posts',
    label: 'Posts Listing',
    availableIn: ['pages'],
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        localized: true,
        label: 'Title'
      },
      {
        name: 'description',
        type: 'textarea',
        localized: true,
        label: 'Description'
      },
      {
        name: 'limit',
        type: 'number',
        required: true,
        label: 'Max posts',
        description: 'Maximum number of posts to display'
      }
    ]
  },
  'reusable-content': {
    slug: 'reusable-content',
    label: 'Reusable Content',
    availableIn: ['pages'],
    fields: [
      {
        name: 'reusableContent',
        type: 'relationship',
        required: true
      },
      {
        name: 'refId',
        type: 'text',
        label: 'Reference',
        description:
          'Optional reference that can be used to identify this block with CSS or JavaScript.'
      }
    ]
  },
  showcase: {
    slug: 'showcase',
    label: 'Showcase',
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: 'Eyebrow',
        description: 'Small uppercase label shown above the heading'
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: 'Heading'
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: 'Intro',
        description: 'Short paragraph below the heading'
      },
      {
        name: 'enableHeaderLink',
        type: 'checkbox',
        label: 'Show link in the header'
      },
      {
        name: 'link',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in new tab'
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            label: 'Document to link to'
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            label: 'Custom URL',
            description:
              'Add protocol (http:// or https://) if the link is external'
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: 'Label'
          }
        ]
      },
      {
        name: 'items',
        type: 'array',
        label: 'Items',
        fields: [
          {
            name: 'tag',
            type: 'text',
            localized: true,
            label: 'Tag',
            description: 'Small badge, e.g. "Platform"'
          },
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: 'Title'
          },
          {
            name: 'description',
            type: 'textarea',
            required: true,
            localized: true,
            label: 'Description'
          },
          {
            name: 'meta',
            type: 'text',
            label: 'Meta',
            description: 'Monospace line, e.g. "Nx · Payload · Postgres"'
          },
          {
            name: 'link',
            type: 'group'
          }
        ]
      }
    ]
  },
  'social-media': {
    slug: 'social-media',
    label: 'Social Media',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'social',
        type: 'array',
        label: 'Social Media Links',
        fields: [
          {
            name: 'platform',
            type: 'select',
            required: true,
            label: 'Platform'
          },
          {
            name: 'email',
            type: 'email',
            required: true,
            label: 'Email'
          },
          {
            name: 'phone',
            type: 'text',
            required: true,
            label: 'Phone'
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            label: 'URL'
          },
          {
            name: 'withLabel',
            type: 'checkbox',
            label: 'With label'
          },
          {
            name: 'label',
            type: 'text',
            label: 'Icon label',
            description: 'Short text to display next to the icon'
          }
        ]
      },
      {
        name: 'direction',
        type: 'radio',
        label: 'Direction',
        description: 'How the social media links are displayed'
      }
    ]
  },
  spacing: {
    slug: 'spacing',
    label: 'Empty Spacing',
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'size',
        type: 'select',
        required: true,
        label: 'Size',
        description:
          'Regular spacing size matches the default spacing between blocks'
      },
      {
        name: 'divider',
        type: 'checkbox',
        label: 'Horizontal divider'
      },
      {
        name: 'color',
        type: 'text',
        label: 'Color',
        description: 'Override divider theme color'
      }
    ]
  },
  testimonial: {
    slug: 'testimonial',
    label: 'Testimonial',
    availableIn: ['pages'],
    fields: [
      {
        name: 'quote',
        type: 'textarea',
        required: true,
        localized: true,
        label: 'Quote',
        description:
          'In their words, not yours. One or two sentences carries further than a paragraph.'
      },
      {
        name: 'author',
        type: 'group',
        label: 'Attribution',
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
            label: 'Name'
          },
          {
            name: 'role',
            type: 'text',
            localized: true,
            label: 'Role and company'
          },
          {
            name: 'avatar',
            type: 'upload',
            label: 'Portrait'
          }
        ]
      },
      {
        name: 'logo',
        type: 'upload',
        label: 'Company mark',
        description:
          'Shown beside the quote. Leave empty when the name is enough.'
      },
      {
        name: 'enableLink',
        type: 'checkbox',
        label: 'Link to the longer story'
      },
      {
        name: 'link',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in new tab'
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            label: 'Document to link to'
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            label: 'Custom URL',
            description:
              'Add protocol (http:// or https://) if the link is external'
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: 'Label'
          }
        ]
      }
    ]
  },
  tours: {
    slug: 'tours',
    label: 'Tour Listing',
    availableIn: ['pages'],
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        localized: true,
        label: 'Title'
      },
      {
        name: 'description',
        type: 'textarea',
        localized: true,
        label: 'Description'
      },
      {
        name: 'limit',
        type: 'number',
        required: true,
        label: 'Max tours',
        description: 'Maximum number of tours to display'
      }
    ]
  },
  video: {
    slug: 'video',
    label: 'Video',
    availableIn: [],
    fields: [
      {
        name: 'media',
        type: 'upload',
        required: true,
        description: 'Select a video.'
      }
    ]
  }
};
