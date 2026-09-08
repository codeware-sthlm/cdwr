import type { Media } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { VideoBlock } from './VideoBlock';

const meta = {
  title: 'cms-renderer/VideoBlock',
  component: VideoBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof VideoBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseMedia = {
  id: 1,
  alt: 'Big Buck Bunny — sample video',
  url: 'https://www.w3schools.com/html/mov_bbb.mp4',
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z'
} as unknown as Media;

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
            text: 'Big Buck Bunny — open source animation by Blender Foundation.'
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

export const WithCaption: Story = {
  name: 'With caption',
  args: {
    blockType: 'video',
    media: { ...baseMedia, caption } as unknown as Media
  }
};

export const ShadcnLight = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'shadcn',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { blockType: 'video', media: baseMedia } },
  'codeware',
  'dark'
);
