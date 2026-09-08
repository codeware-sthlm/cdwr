import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ImageBlock } from './ImageBlock';

const meta = {
  title: 'cms-renderer/ImageBlock',
  component: ImageBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ImageBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const caption = {
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'text',
            version: 1,
            text: 'A placeholder image used to illustrate the block layout and caption rendering.'
          }
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0
      }
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0
  }
};

const media = {
  id: 1,
  alt: 'Placeholder image',
  url: 'https://placehold.co/1200x675/png',
  width: 1200,
  height: 675,
  sizes: {},
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z'
} as unknown as Media;

export const WithCaption: Story = {
  name: 'With caption',
  args: { media: { ...media, caption } as unknown as Media }
};

export const HiddenCaption: Story = {
  name: 'Caption hidden',
  args: {
    media: { ...media, caption } as unknown as Media,
    hideCaption: true
  }
};

export const ShadcnLight = a11yStory({ args: { media } }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args: { media } }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory(
  { args: { media } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { media } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { media } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { media } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { media } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory({ args: { media } }, 'codeware', 'dark');
