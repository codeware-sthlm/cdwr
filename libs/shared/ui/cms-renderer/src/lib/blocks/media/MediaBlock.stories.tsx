import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { showcaseMedia } from '../gallery-media';

import { MediaBlock } from './MediaBlock';

const meta = {
  title: 'cms-renderer/MediaBlock',
  component: MediaBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof MediaBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// Its own fixture: the block is retired, so no layout can hold one and the
// gallery has no example to share
const args: Story['args'] = {
  blockType: 'media',
  media: showcaseMedia(
    'media.jpg',
    'Backlit woven steel mesh, moire rippling across the weave',
    1264,
    848
  )
};

export const Default: Story = {
  args
};

// A11y matrix — explicit export const declarations are required so the
// Storybook CSF parser can statically discover each story. Each export
// becomes an independent vitest test with axe running in 'error' mode.
export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
