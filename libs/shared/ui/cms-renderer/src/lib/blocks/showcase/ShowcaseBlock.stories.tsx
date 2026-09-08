import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ShowcaseBlock } from './ShowcaseBlock';
import { showcaseGallery } from './ShowcaseBlock.gallery';

const meta = {
  title: 'cms-renderer/ShowcaseBlock',
  component: ShowcaseBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ShowcaseBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

// The same instance the gallery renders, so the two cannot drift
const args: Story['args'] = showcaseGallery.example;

export const Default: Story = {
  args
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
