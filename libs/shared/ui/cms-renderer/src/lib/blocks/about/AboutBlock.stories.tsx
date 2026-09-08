import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { AboutBlock } from './AboutBlock';

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
  args: { blockType: 'about', heading: 'About this deployment' }
};

export const WithoutHeading: Story = {
  args: { blockType: 'about' }
};

export const ShadcnLight = a11yStory({ args: Default.args }, 'shadcn', 'light');

export const ShadcnDark = a11yStory({ args: Default.args }, 'shadcn', 'dark');
