import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { RenderBlocks } from '../RenderBlocks';

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
  parameters: { layout: 'padded' }
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

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
