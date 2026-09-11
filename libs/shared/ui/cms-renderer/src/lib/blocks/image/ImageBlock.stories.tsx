import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ImageBlock } from './ImageBlock';
import { imageGallery } from './ImageBlock.gallery';

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
            text: 'A caption, set beneath the image from its rich-text field.'
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

// The gallery's instance, so the story and the gallery cannot drift apart
const media = imageGallery.example.media as Media;

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
