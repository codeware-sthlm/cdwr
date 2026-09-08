import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { AboutBlock } from './AboutBlock';
import { aboutGallery } from './AboutBlock.gallery';

// The running app's build metadata is provided by the storybook `PayloadProvider`
// decorator (`appInfo`), so the block renders app-agnostically here.
const meta = {
  title: 'cms-renderer/AboutBlock',
  component: AboutBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof AboutBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // The same instance the gallery renders, so the two cannot drift
  args: aboutGallery.example
};

export const WithoutHeading: Story = {
  args: { blockType: 'about' }
};

export const ShadcnLight = a11yStory({ args: Default.args }, 'shadcn', 'light');

export const ShadcnDark = a11yStory({ args: Default.args }, 'shadcn', 'dark');
