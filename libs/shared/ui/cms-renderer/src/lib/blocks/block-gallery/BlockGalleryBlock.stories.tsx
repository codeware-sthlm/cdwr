import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { RenderBlocks } from '../../RenderBlocks';

import { BlockGalleryBlock } from './BlockGalleryBlock';

/**
 * The gallery reads the generated registry, so these stories show the real
 * count of blocks the platform ships — not a fixture. A block registered
 * tomorrow appears here without anyone touching this file, which is the whole
 * claim being made.
 */
const meta = {
  title: 'cms-renderer/BlockGalleryBlock',
  component: BlockGalleryBlock,
  // Storybook serves the cms's public/blocks itself, on its own origin
  parameters: { layout: 'padded', payloadUrl: '' }
} satisfies Meta<typeof BlockGalleryBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'block-gallery',
  mode: 'index',
  // `RenderBlocks` supplies this through `resolveBlockProps` on a real page.
  // Without it here, opening a card from the index shows no example at all
  render: RenderBlocks,
  eyebrow: 'Blocks',
  heading: 'Every block, drawn by the renderer that serves it',
  intro:
    'Not screenshots. Each card below names a block the platform registers, and the sections follow what an editor can actually reach for.'
};

export const Default: Story = {
  args
};

/** The view a `?block=` link arrives at, and where a card click lands. */
export const Browser: Story = {
  args: { ...args, mode: 'browser' }
};

/** Each card drawn as its block, scaled down, in place of the illustration. */
export const DrawnBlocks: Story = {
  name: 'Index with drawn blocks',
  args: { ...args, cardPicture: 'block' }
};

export const FrostLight = a11yStory({ args }, 'frost', 'light');
export const FrostDark = a11yStory({ args }, 'frost', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
