import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { GalleryBlock } from './GalleryBlock';
import { galleryGallery } from './GalleryBlock.gallery';

const meta = {
  title: 'cms-renderer/GalleryBlock',
  component: GalleryBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof GalleryBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = galleryGallery.example;

export const Default: Story = {
  args
};

/** Evenly laid out, with the caption under each picture. */
export const Row: Story = {
  args: { ...args, layout: 'row' }
};

export const FrostLight = a11yStory({ args }, 'frost', 'light');
export const FrostDark = a11yStory({ args }, 'frost', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
